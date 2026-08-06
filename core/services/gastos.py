"""Lógica de negocio para gastos — compartida entre API REST y vistas legacy."""
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

from django.db import transaction
from django.db.models import Sum, Count
from django.utils import timezone

from core.models import Gasto, MovimientoContable, Cuenta, PresupuestoCategoria
from core.utils import saldo_efectivo

MAX_COMPROBANTE_BYTES = 5 * 1024 * 1024
COMPROBANTE_TIPOS = {'application/pdf', 'image/jpeg', 'image/png', 'image/jpg'}


def semana_bounds(semana_inicio: date) -> tuple[date, date]:
    return semana_inicio, semana_inicio + timedelta(days=6)


def lunes_de(fecha: date | None = None) -> date:
    ref = fecha or date.today()
    return ref - timedelta(days=ref.weekday())


def _unwrap(val):
    """Normaliza valores de MultiValueDict/FormData (listas de un elemento)."""
    if isinstance(val, (list, tuple)):
        return val[0] if val else None
    return val


def _decimal(val) -> Decimal:
    val = _unwrap(val)
    if val is None or val == '':
        raise ValueError('Monto inválido.')
    try:
        # Acepta "1000", "1000.00", "$ 1,000.00"
        cleaned = (
            str(val)
            .strip()
            .replace('$', '')
            .replace(',', '')
            .replace(' ', '')
        )
        d = Decimal(cleaned).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError('Monto inválido.')
    if d <= 0:
        raise ValueError('Monto debe ser mayor a 0.')
    return d


def validar_comprobante(comprobante, monto: Decimal = None, requerido_sin_archivo: bool = False):
    """Valida formato/tamaño si hay archivo. El comprobante es opcional."""
    if not comprobante:
        return
    size = getattr(comprobante, 'size', None)
    if size is not None and size > MAX_COMPROBANTE_BYTES:
        raise ValueError('El comprobante no puede superar 5 MB.')
    content_type = getattr(comprobante, 'content_type', '') or ''
    if content_type and content_type not in COMPROBANTE_TIPOS:
        raise ValueError('Comprobante debe ser PDF, JPG o PNG.')


def gasto_mes_categoria(categoria: str, excluir_id: int | None = None) -> Decimal:
    hoy = date.today()
    inicio = hoy.replace(day=1)
    qs = Gasto.objects.filter(categoria=categoria, fecha__gte=inicio, fecha__lte=hoy)
    if excluir_id:
        qs = qs.exclude(id=excluir_id)
    return qs.aggregate(total=Sum('monto'))['total'] or Decimal('0')


def obtener_presupuesto_mensual(categoria: str) -> Decimal | None:
    """None = sin límite configurado (categoría inactiva o no registrada)."""
    try:
        registro = PresupuestoCategoria.objects.get(categoria=categoria, activo=True)
        return registro.monto_mensual
    except PresupuestoCategoria.DoesNotExist:
        return None


def listar_presupuestos(excluir_id: int | None = None) -> dict[str, dict]:
    """Presupuesto disponible para cada categoría con registro activo."""
    resultado = {}
    for registro in PresupuestoCategoria.objects.filter(activo=True):
        resultado[registro.categoria] = presupuesto_disponible(
            registro.categoria,
            excluir_id=excluir_id,
        )
    return resultado


def presupuesto_disponible(categoria: str, excluir_id: int | None = None) -> dict:
    gastado = gasto_mes_categoria(categoria, excluir_id=excluir_id)
    presupuesto = obtener_presupuesto_mensual(categoria)

    if presupuesto is None:
        return {
            'categoria': categoria,
            'presupuesto': None,
            'gastado': str(gastado),
            'disponible': None,
            'porcentaje': 0,
            'excedido': False,
            'sin_limite': True,
        }

    disponible = presupuesto - gastado
    pct = float(gastado / presupuesto * 100) if presupuesto > 0 else 0
    return {
        'categoria': categoria,
        'presupuesto': str(presupuesto),
        'gastado': str(gastado),
        'disponible': str(disponible),
        'porcentaje': round(min(pct, 100), 1),
        'excedido': disponible < 0,
        'sin_limite': False,
    }


def validar_presupuesto(categoria: str, monto: Decimal, excluir_id: int | None = None):
    presupuesto = obtener_presupuesto_mensual(categoria)
    if presupuesto is None:
        return

    info = presupuesto_disponible(categoria, excluir_id=excluir_id)
    disponible = Decimal(info['disponible'])
    if monto > disponible:
        raise ValueError(
            f"El gasto de ${monto:.2f} excede el presupuesto de "
            f"'{categoria}' (${disponible:.2f} disponibles de ${presupuesto:.2f})."
        )


def _saldo_cuenta(cuenta: Cuenta | None, excluir_gasto: Gasto | None = None) -> Decimal:
    if cuenta:
        saldo = cuenta.saldo_actual()
    else:
        saldo = saldo_efectivo()
    if excluir_gasto and excluir_gasto.pk:
        saldo += excluir_gasto.monto
    return saldo


def validar_saldo(cuenta: Cuenta | None, monto: Decimal, excluir_gasto: Gasto | None = None):
    saldo = _saldo_cuenta(cuenta, excluir_gasto=excluir_gasto)
    if monto > saldo:
        nombre = cuenta.nombre if cuenta else 'efectivo'
        faltante = monto - saldo
        raise ValueError(
            f"Saldo insuficiente en '{nombre}'. "
            f"Disponible: ${saldo:.2f} | Intenta gastar: ${monto:.2f} | Faltante: ${faltante:.2f}"
        )


def buscar_duplicados(
    descripcion: str,
    monto: Decimal,
    categoria: str,
    excluir_id: int | None = None,
) -> list[dict]:
    hace_7 = date.today() - timedelta(days=7)
    qs = Gasto.objects.filter(
        fecha__gte=hace_7,
        categoria=categoria,
        monto=monto,
    )
    if excluir_id:
        qs = qs.exclude(id=excluir_id)
    desc_norm = descripcion.strip().lower()
    resultados = []
    for g in qs.select_related('cuenta').order_by('-fecha'):
        if g.descripcion.strip().lower() == desc_norm or desc_norm in g.descripcion.strip().lower():
            resultados.append({
                'id': g.id,
                'fecha': str(g.fecha),
                'descripcion': g.descripcion,
                'monto': str(g.monto),
                'categoria': g.categoria,
                'categoria_display': g.get_categoria_display(),
            })
    return resultados


def _cuenta_movimiento(cuenta: Cuenta | None) -> Cuenta | None:
    if cuenta:
        return cuenta
    return Cuenta.objects.filter(tipo__iexact='efectivo', activa=True).first()


def _crear_movimiento(gasto: Gasto):
    cuenta = _cuenta_movimiento(gasto.cuenta)
    metodo = 'efectivo' if not gasto.cuenta else 'transferencia'
    MovimientoContable.objects.create(
        gasto=gasto,
        tipo='EGRESO',
        monto=gasto.monto,
        metodo_pago=metodo,
        cuenta=cuenta if gasto.cuenta else None,
        fecha=timezone.now(),
        descripcion=f'Gasto: {gasto.descripcion}',
    )


def _sincronizar_movimiento(gasto: Gasto):
    mov = gasto.movimientos.first()
    cuenta = _cuenta_movimiento(gasto.cuenta)
    metodo = 'efectivo' if not gasto.cuenta else 'transferencia'
    if mov:
        mov.monto = gasto.monto
        mov.descripcion = f'Gasto: {gasto.descripcion}'
        mov.metodo_pago = metodo
        mov.cuenta = cuenta if gasto.cuenta else None
        mov.fecha = timezone.now()
        mov.save()
    else:
        _crear_movimiento(gasto)


@transaction.atomic
def crear_gasto(data: dict, comprobante=None) -> Gasto:
    monto = _decimal(data.get('monto'))
    categoria = data.get('categoria', 'INSUMOS')
    descripcion = (data.get('descripcion') or '').strip()
    if not descripcion:
        raise ValueError('Completa el campo: descripción.')

    cuenta_id = _unwrap(data.get('cuenta') or data.get('cuenta_id'))
    cuenta = None
    if cuenta_id:
        try:
            cuenta = Cuenta.objects.get(id=cuenta_id, activa=True)
        except (Cuenta.DoesNotExist, TypeError, ValueError):
            raise ValueError('Cuenta no válida o inactiva.')

    validar_comprobante(comprobante, monto)
    validar_presupuesto(categoria, monto)
    validar_saldo(cuenta, monto)

    gasto = Gasto.objects.create(
        tipo=data.get('tipo', 'GASTO'),
        categoria=categoria,
        cuenta=cuenta,
        descripcion=descripcion,
        monto=monto,
        fecha=data.get('fecha') or date.today(),
        referencia=data.get('referencia') or '',
        comprobante=comprobante,
    )
    _crear_movimiento(gasto)
    return gasto


@transaction.atomic
def actualizar_gasto(gasto: Gasto, data: dict, comprobante=None) -> Gasto:
    monto = _decimal(data.get('monto', gasto.monto))
    categoria = data.get('categoria', gasto.categoria)
    descripcion = (data.get('descripcion') or gasto.descripcion).strip()
    if not descripcion:
        raise ValueError('Completa el campo: descripción.')

    cuenta_id = data.get('cuenta') if 'cuenta' in data else data.get('cuenta_id')
    if cuenta_id is None and 'cuenta' not in data and 'cuenta_id' not in data:
        cuenta = gasto.cuenta
    elif cuenta_id:
        try:
            cuenta = Cuenta.objects.get(id=cuenta_id, activa=True)
        except Cuenta.DoesNotExist:
            raise ValueError('Cuenta no válida o inactiva.')
    else:
        cuenta = None

    if comprobante is not None:
        validar_comprobante(comprobante)
    elif gasto.comprobante:
        # Archivo existente en disco: solo validar si se reemplaza
        pass
    validar_presupuesto(categoria, monto, excluir_id=gasto.id)
    validar_saldo(cuenta, monto, excluir_gasto=gasto)

    gasto.tipo = data.get('tipo', gasto.tipo)
    gasto.categoria = categoria
    gasto.cuenta = cuenta
    gasto.descripcion = descripcion
    gasto.monto = monto
    if 'fecha' in data and data['fecha']:
        gasto.fecha = data['fecha']
    if 'referencia' in data:
        gasto.referencia = data.get('referencia') or ''
    if comprobante is not None:
        gasto.comprobante = comprobante
    gasto.save()
    _sincronizar_movimiento(gasto)
    return gasto


@transaction.atomic
def eliminar_gasto(gasto: Gasto):
    gasto.movimientos.all().delete()
    gasto.delete()


def stats_gastos(semana_inicio: date | None = None) -> dict:
    lunes = semana_inicio or lunes_de()
    domingo = lunes + timedelta(days=6)
    qs = Gasto.objects.filter(fecha__range=[lunes, domingo])
    total_semana = qs.aggregate(t=Sum('monto'))['t'] or Decimal('0')
    por_categoria = (
        qs.values('categoria')
        .annotate(total=Sum('monto'), count=Count('id'))
        .order_by('-total')
    )
    hoy = date.today()
    mes_inicio = hoy.replace(day=1)
    total_mes = (
        Gasto.objects.filter(fecha__gte=mes_inicio, fecha__lte=hoy)
        .aggregate(t=Sum('monto'))['t'] or Decimal('0')
    )
    return {
        'semana_inicio': str(lunes),
        'semana_fin': str(domingo),
        'total_semana': str(total_semana),
        'total_mes': str(total_mes),
        'count_semana': qs.count(),
        'por_categoria': [
            {
                'categoria': row['categoria'],
                'total': str(row['total'] or 0),
                'count': row['count'] or 0,
            }
            for row in por_categoria
        ],
    }
