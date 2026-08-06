"""Lógica de negocio para cuentas y movimientos contables (PWA CRM)."""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from core.models import Cuenta, MovimientoContable


class CuentasError(Exception):
    def __init__(self, message: str, status: int = 400):
        self.message = message
        self.status = status
        super().__init__(message)


def _money(val) -> Decimal:
    if val is None or val == '':
        raise CuentasError('Monto inválido.')
    try:
        cleaned = str(val).strip().replace('$', '').replace(',', '').replace(' ', '')
        d = Decimal(cleaned).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise CuentasError('Monto inválido.') from exc
    if d <= 0:
        raise CuentasError('El monto debe ser mayor a 0.')
    return d


def get_caja_efectivo() -> Cuenta | None:
    return Cuenta.objects.filter(tipo__iexact='efectivo', activa=True).first()


def _serialize_cuenta(c: Cuenta) -> dict:
    return {
        'id': c.id,
        'nombre': c.nombre,
        'tipo': c.tipo,
        'banco': c.banco or '',
        'numero': c.numero or '',
        'activa': c.activa,
        'saldo': str(c.saldo_actual()),
    }


def listar_cuentas(*, activas_only: bool = True, incluir_inactivas: bool = False) -> list[dict]:
    qs = Cuenta.objects.all().order_by('tipo', 'nombre')
    if activas_only and not incluir_inactivas:
        qs = qs.filter(activa=True)
    return [_serialize_cuenta(c) for c in qs]


def resumen_balances() -> dict:
    activas = Cuenta.objects.filter(activa=True).order_by('tipo', 'nombre')
    efectivo = Decimal('0')
    bancos = Decimal('0')
    items = []
    for c in activas:
        saldo = Decimal(str(c.saldo_actual() or 0))
        items.append(_serialize_cuenta(c))
        if (c.tipo or '').lower() == 'efectivo':
            efectivo += saldo
        else:
            bancos += saldo
    return {
        'saldo_efectivo': str(efectivo),
        'saldo_bancos': str(bancos),
        'total': str(efectivo + bancos),
        'cuentas': items,
    }


def crear_cuenta(data: dict) -> dict:
    nombre = (data.get('nombre') or '').strip()
    if len(nombre) < 2:
        raise CuentasError('Nombre de cuenta requerido.')
    tipo = (data.get('tipo') or 'Banco').strip()
    if tipo not in ('Banco', 'Efectivo'):
        # normalizar variantes
        if tipo.lower() == 'efectivo':
            tipo = 'Efectivo'
        elif tipo.lower() == 'banco':
            tipo = 'Banco'
        else:
            raise CuentasError('Tipo inválido. Usa Banco o Efectivo.')
    if tipo == 'Efectivo' and get_caja_efectivo():
        raise CuentasError('Ya existe una cuenta de efectivo/caja activa.')
    cuenta = Cuenta.objects.create(
        nombre=nombre,
        banco=(data.get('banco') or '').strip() or None,
        numero=(data.get('numero') or '').strip(),
        tipo=tipo,
        activa=True if data.get('activa') is None else bool(data.get('activa')),
    )
    return _serialize_cuenta(cuenta)


def actualizar_cuenta(cuenta_id: int, data: dict) -> dict:
    cuenta = get_object_or_404(Cuenta, pk=cuenta_id)
    if 'nombre' in data:
        nombre = (data.get('nombre') or '').strip()
        if len(nombre) < 2:
            raise CuentasError('Nombre de cuenta requerido.')
        cuenta.nombre = nombre
    if 'banco' in data:
        cuenta.banco = (data.get('banco') or '').strip() or None
    if 'numero' in data:
        cuenta.numero = (data.get('numero') or '').strip()
    if 'tipo' in data and data.get('tipo'):
        tipo = str(data.get('tipo')).strip()
        if tipo.lower() == 'efectivo':
            tipo = 'Efectivo'
        elif tipo.lower() == 'banco':
            tipo = 'Banco'
        if tipo not in ('Banco', 'Efectivo'):
            raise CuentasError('Tipo inválido. Usa Banco o Efectivo.')
        if tipo == 'Efectivo' and (cuenta.tipo or '').lower() != 'efectivo':
            otra = get_caja_efectivo()
            if otra and otra.id != cuenta.id:
                raise CuentasError('Ya existe una cuenta de efectivo/caja activa.')
        cuenta.tipo = tipo
    if 'activa' in data:
        cuenta.activa = bool(data.get('activa'))
    cuenta.save()
    return _serialize_cuenta(cuenta)


def _serialize_movimiento(m: MovimientoContable) -> dict:
    return {
        'id': m.id,
        'tipo': m.tipo,
        'monto': str(m.monto),
        'metodo_pago': m.metodo_pago or '',
        'descripcion': m.descripcion or '',
        'fecha': m.fecha.isoformat() if m.fecha else None,
        'cuenta_id': m.cuenta_id,
        'cuenta_nombre': m.cuenta.nombre if m.cuenta_id else '',
        'pedido_id': m.pedido_id,
        'gasto_id': m.gasto_id,
    }


def movimientos_cuenta(cuenta_id: int, *, limit: int = 100) -> dict:
    cuenta = get_object_or_404(Cuenta, pk=cuenta_id)
    qs = (
        MovimientoContable.objects.filter(cuenta=cuenta)
        .select_related('cuenta')
        .order_by('-fecha', '-id')[: max(1, min(limit, 500))]
    )
    return {
        'cuenta': _serialize_cuenta(cuenta),
        'movimientos': [_serialize_movimiento(m) for m in qs],
    }


@transaction.atomic
def registrar_movimiento(data: dict) -> dict:
    cuenta_id = data.get('cuenta_id') or data.get('cuenta')
    if not cuenta_id:
        raise CuentasError('Selecciona una cuenta.')
    cuenta = get_object_or_404(Cuenta, pk=cuenta_id, activa=True)
    tipo = (data.get('tipo') or '').strip().upper()
    if tipo not in ('INGRESO', 'EGRESO'):
        raise CuentasError('Tipo inválido. Usa INGRESO o EGRESO.')
    monto = _money(data.get('monto'))
    metodo = (data.get('metodo_pago') or '').strip().lower()
    if metodo not in ('efectivo', 'transferencia'):
        # Inferir por tipo de cuenta
        metodo = 'efectivo' if (cuenta.tipo or '').lower() == 'efectivo' else 'transferencia'
    descripcion = (data.get('descripcion') or '').strip()[:255]
    if tipo == 'EGRESO':
        saldo = Decimal(str(cuenta.saldo_actual() or 0))
        if monto > saldo:
            raise CuentasError(
                f'Saldo insuficiente en {cuenta.nombre}. Disponible: ${saldo}.',
            )
    mov = MovimientoContable.objects.create(
        pedido=None,
        tipo=tipo,
        monto=monto,
        metodo_pago=metodo,
        cuenta=cuenta,
        fecha=timezone.now(),
        descripcion=descripcion or f'{tipo.title()} manual',
    )
    return {
        'movimiento': _serialize_movimiento(mov),
        'cuenta': _serialize_cuenta(cuenta),
    }


@transaction.atomic
def transferir(data: dict) -> dict:
    origen_id = data.get('origen_id') or data.get('cuenta_origen')
    destino_id = data.get('destino_id') or data.get('cuenta_destino')
    if not origen_id or not destino_id:
        raise CuentasError('Indica cuenta origen y destino.')
    if str(origen_id) == str(destino_id):
        raise CuentasError('Origen y destino deben ser distintas.')
    origen = get_object_or_404(Cuenta, pk=origen_id, activa=True)
    destino = get_object_or_404(Cuenta, pk=destino_id, activa=True)
    monto = _money(data.get('monto'))
    descripcion = (data.get('descripcion') or '').strip()[:200]
    saldo = Decimal(str(origen.saldo_actual() or 0))
    if monto > saldo:
        raise CuentasError(
            f'Saldo insuficiente en {origen.nombre}. Disponible: ${saldo}.',
        )
    now = timezone.now()
    egreso = MovimientoContable.objects.create(
        pedido=None,
        tipo='EGRESO',
        monto=monto,
        metodo_pago='transferencia',
        cuenta=origen,
        fecha=now,
        descripcion=f'Transferencia a {destino.nombre}. {descripcion}'.strip()[:255],
    )
    ingreso = MovimientoContable.objects.create(
        pedido=None,
        tipo='INGRESO',
        monto=monto,
        metodo_pago='transferencia',
        cuenta=destino,
        fecha=now,
        descripcion=f'Transferencia desde {origen.nombre}. {descripcion}'.strip()[:255],
    )
    return {
        'egreso': _serialize_movimiento(egreso),
        'ingreso': _serialize_movimiento(ingreso),
        'origen': _serialize_cuenta(origen),
        'destino': _serialize_cuenta(destino),
    }


@transaction.atomic
def traspasar_efectivo_banco(data: dict) -> dict:
    """
    direccion: 'efectivo_a_banco' | 'banco_a_efectivo'
    """
    direccion = (data.get('direccion') or data.get('origen_tipo') or '').strip().lower()
    if direccion in ('efectivo', 'efectivo_a_banco', 'caja_a_banco'):
        direccion = 'efectivo_a_banco'
    elif direccion in ('banco', 'banco_a_efectivo', 'banco_a_caja'):
        direccion = 'banco_a_efectivo'
    else:
        raise CuentasError('Dirección inválida. Usa efectivo_a_banco o banco_a_efectivo.')

    caja = get_caja_efectivo()
    if not caja:
        raise CuentasError('No existe una cuenta de caja/efectivo activa.')

    banco_id = data.get('cuenta_banco_id') or data.get('cuenta_banco')
    if not banco_id:
        raise CuentasError('Selecciona la cuenta bancaria.')
    banco = get_object_or_404(Cuenta, pk=banco_id, activa=True)
    if (banco.tipo or '').lower() == 'efectivo':
        raise CuentasError('La cuenta destino debe ser bancaria.')

    monto = _money(data.get('monto'))
    descripcion = (data.get('descripcion') or '').strip()[:200]
    now = timezone.now()

    if direccion == 'efectivo_a_banco':
        saldo = Decimal(str(caja.saldo_actual() or 0))
        if monto > saldo:
            raise CuentasError(f'Saldo insuficiente en caja. Disponible: ${saldo}.')
        egreso = MovimientoContable.objects.create(
            pedido=None, tipo='EGRESO', monto=monto,
            metodo_pago='efectivo', cuenta=caja, fecha=now,
            descripcion=f'Traspaso a banco {banco.nombre}. {descripcion}'.strip()[:255],
        )
        ingreso = MovimientoContable.objects.create(
            pedido=None, tipo='INGRESO', monto=monto,
            metodo_pago='transferencia', cuenta=banco, fecha=now,
            descripcion='Traspaso desde efectivo'[:255],
        )
    else:
        saldo = Decimal(str(banco.saldo_actual() or 0))
        if monto > saldo:
            raise CuentasError(f'Saldo insuficiente en {banco.nombre}. Disponible: ${saldo}.')
        egreso = MovimientoContable.objects.create(
            pedido=None, tipo='EGRESO', monto=monto,
            metodo_pago='transferencia', cuenta=banco, fecha=now,
            descripcion=f'Retiro a efectivo. {descripcion}'.strip()[:255],
        )
        ingreso = MovimientoContable.objects.create(
            pedido=None, tipo='INGRESO', monto=monto,
            metodo_pago='efectivo', cuenta=caja, fecha=now,
            descripcion=f'Traspaso desde banco {banco.nombre}. {descripcion}'.strip()[:255],
        )

    return {
        'egreso': _serialize_movimiento(egreso),
        'ingreso': _serialize_movimiento(ingreso),
        'caja': _serialize_cuenta(caja),
        'banco': _serialize_cuenta(banco),
        'direccion': direccion,
    }
