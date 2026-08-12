"""Reportes de negocio semanal / mensual / anual (PDF estilo cotización)."""

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Avg, Count, Max, Min, Q, Sum
from django.template.loader import render_to_string

from core.models import Gasto, MovimientoContable, Renta
from core.services.cotizaciones import _fmt_money, _logo_file_uri, _nexoo_file_uri

MESES_ES = (
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
)

TITULOS_REPORTE = {
    'semana': 'Reporte semanal',
    'mes': 'Reporte mensual',
    'ano': 'Reporte anual',
}


class ReporteError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def _money(value):
    return Decimal(str(value or 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _parse_fecha(value):
    if value in (None, ''):
        return date.today()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError as exc:
        raise ReporteError(f'Fecha inválida: {value}') from exc


def _normalizar_tipo(tipo: str) -> str:
    tipo_norm = (tipo or 'semana').strip().lower()
    # Aliases de año (API/UI suelen mandar "ano" sin ñ)
    if tipo_norm in ('ano', 'año', 'anual', 'anio', 'year'):
        return 'ano'
    return tipo_norm


def resolver_periodo(tipo: str, referencia=None):
    """
    tipo: 'semana' | 'mes' | 'ano'
    referencia: fecha dentro del periodo (default hoy)
    → (inicio, fin, etiqueta, tipo_norm)
    """
    tipo_norm = _normalizar_tipo(tipo)
    if tipo_norm not in ('semana', 'mes', 'ano'):
        raise ReporteError('tipo debe ser semana, mes o ano')

    ref = _parse_fecha(referencia)

    if tipo_norm == 'semana':
        lunes = ref - timedelta(days=ref.weekday())
        domingo = lunes + timedelta(days=6)
        etiqueta = (
            f'Semana del {lunes.day} de {MESES_ES[lunes.month - 1]} '
            f'al {domingo.day} de {MESES_ES[domingo.month - 1]} de {domingo.year}'
        )
        return lunes, domingo, etiqueta, tipo_norm

    if tipo_norm == 'ano':
        inicio = date(ref.year, 1, 1)
        fin = date(ref.year, 12, 31)
        etiqueta = f'Año {inicio.year}'
        return inicio, fin, etiqueta, tipo_norm

    inicio = ref.replace(day=1)
    fin = ref.replace(day=monthrange(ref.year, ref.month)[1])
    etiqueta = f'{MESES_ES[inicio.month - 1].capitalize()} {inicio.year}'
    return inicio, fin, etiqueta, tipo_norm


def build_reporte_negocio(inicio: date, fin: date, *, tipo='semana', etiqueta=''):
    rentas_qs = (
        Renta.objects.filter(
            status='ACTIVO',
            fecha_renta__gte=inicio,
            fecha_renta__lte=fin,
        )
        .select_related('cliente', 'finanza', 'finanza__cuenta_destino')
        .prefetch_related('finanza__movimientos__cuenta')
        .order_by('fecha_renta', 'folio')
    )

    agg = rentas_qs.aggregate(
        total_ventas=Sum('precio_total'),
        total_cobrado=Sum('precio_total', filter=Q(pagado=True)),
        total_sin_cobrar=Sum('precio_total', filter=Q(pagado=False)),
        ticket_promedio=Avg('precio_total'),
        renta_max=Max('precio_total'),
        count=Count('id'),
    )

    total_ventas = _money(agg['total_ventas'])
    total_cobrado = _money(agg['total_cobrado'])
    total_sin_cobrar = _money(agg['total_sin_cobrar'])
    ticket_promedio = _money(agg['ticket_promedio'])
    renta_max = _money(agg['renta_max'])

    renta_alta = None
    if renta_max > 0:
        top = rentas_qs.filter(precio_total=renta_max).first()
        if top:
            renta_alta = {
                'folio': top.folio,
                'total': renta_max,
                'cliente': top.cliente.nombre if top.cliente_id else '',
            }

    # Clientes nuevos vs recurrentes (por primera renta ACTIVO)
    cliente_ids = list(rentas_qs.values_list('cliente_id', flat=True).distinct())
    clientes_nuevos = 0
    clientes_recurrentes = 0
    if cliente_ids:
        primeras = (
            Renta.objects.filter(status='ACTIVO', cliente_id__in=cliente_ids)
            .values('cliente_id')
            .annotate(primera=Min('fecha_renta'))
        )
        primera_map = {row['cliente_id']: row['primera'] for row in primeras}
        for cid in cliente_ids:
            primera = primera_map.get(cid)
            if primera and inicio <= primera <= fin:
                clientes_nuevos += 1
            else:
                clientes_recurrentes += 1

    # Pagos (INGRESO) de las rentas del periodo → por cuenta
    renta_ids = list(rentas_qs.values_list('id', flat=True))
    movimientos = (
        MovimientoContable.objects.filter(
            tipo='INGRESO',
            pedido__renta_id__in=renta_ids,
        )
        .select_related('cuenta', 'pedido__renta')
        .order_by('fecha', 'id')
    )

    pagos_por_renta: dict[int, list] = {}
    cobros_cuenta: dict[str, Decimal] = {}
    for mov in movimientos:
        cuenta_nombre = mov.cuenta.nombre if mov.cuenta_id else 'Efectivo'
        metodo = mov.metodo_pago or ''
        if mov.cuenta_id and getattr(mov.cuenta, 'tipo', None):
            label = cuenta_nombre
        elif (metodo or '').lower() == 'efectivo':
            label = 'Efectivo'
        else:
            label = cuenta_nombre or 'Sin cuenta'

        monto = _money(mov.monto)
        cobros_cuenta[label] = _money(cobros_cuenta.get(label, 0) + monto)
        rid = mov.pedido.renta_id if mov.pedido_id else None
        if rid:
            pagos_por_renta.setdefault(rid, []).append({
                'cuenta': label,
                'metodo': metodo,
                'monto': monto,
            })

    def _fallback_cuenta(renta):
        """Cuenta/método cuando la renta está pagada pero faltan movimientos."""
        finanza = getattr(renta, 'finanza', None)
        if finanza and finanza.cuenta_destino_id:
            return finanza.cuenta_destino.nombre, finanza.metodo_pago or ''
        if finanza and (finanza.metodo_pago or '').lower() == 'efectivo':
            return 'Efectivo', 'efectivo'
        return 'Sin cuenta', ''

    ventas = []
    for r in rentas_qs:
        pagos = list(pagos_por_renta.get(r.id, []))
        sum_movs = _money(sum((p['monto'] for p in pagos), Decimal('0')))
        total_renta = _money(r.precio_total)

        # Si está marcada pagada y los movimientos no cubren el total,
        # imputar el faltante a la cuenta de finanza (mismo criterio que la fila).
        if r.pagado and sum_movs < total_renta:
            faltante = _money(total_renta - sum_movs)
            cuenta_fb, metodo_fb = _fallback_cuenta(r)
            pago_fb = {'cuenta': cuenta_fb, 'metodo': metodo_fb, 'monto': faltante}
            pagos.append(pago_fb)
            cobros_cuenta[cuenta_fb] = _money(cobros_cuenta.get(cuenta_fb, 0) + faltante)

        por_cuenta: dict[str, Decimal] = {}
        for p in pagos:
            por_cuenta[p['cuenta']] = _money(por_cuenta.get(p['cuenta'], 0) + p['monto'])
        cuentas_resumen = [
            {'cuenta': k, 'monto': v} for k, v in sorted(por_cuenta.items(), key=lambda x: (-x[1], x[0]))
        ]
        cuentas_texto = ', '.join(
            f"{c['cuenta']} (${_fmt_money(c['monto'])})" for c in cuentas_resumen
        ) if cuentas_resumen else ('—' if not r.pagado else 'Sin movimiento')

        ventas.append({
            'folio': r.folio,
            'fecha': r.fecha_renta.isoformat(),
            'total': total_renta,
            'pagado': bool(r.pagado),
            'estado': 'Pagado' if r.pagado else 'Sin pagar',
            'cliente': r.cliente.nombre if r.cliente_id else '',
            'cuentas': cuentas_resumen,
            'cuentas_texto': cuentas_texto,
        })

    cobros_por_cuenta = [
        {'cuenta': nombre, 'monto': monto}
        for nombre, monto in sorted(cobros_cuenta.items(), key=lambda x: (-x[1], x[0]))
    ]
    total_cobros_movimientos = _money(sum((c['monto'] for c in cobros_por_cuenta), Decimal('0')))
    gastos_qs = Gasto.objects.filter(fecha__gte=inicio, fecha__lte=fin).select_related('cuenta').order_by('fecha', 'id')
    gastos_agg = gastos_qs.aggregate(total=Sum('monto'))
    total_gastos = _money(gastos_agg['total'])

    gastos = [
        {
            'fecha': g.fecha.isoformat(),
            'descripcion': g.descripcion,
            'tipo': g.get_tipo_display(),
            'categoria': g.get_categoria_display(),
            'cuenta': g.cuenta.nombre if g.cuenta_id else ('Efectivo' if g.tipo == 'NOMINA' else '—'),
            'monto': _money(g.monto),
        }
        for g in gastos_qs
    ]

    balance = _money(total_ventas - total_gastos)

    return {
        'tipo': tipo,
        'etiqueta': etiqueta,
        'fecha_inicio': inicio.isoformat(),
        'fecha_fin': fin.isoformat(),
        'clientes_nuevos': clientes_nuevos,
        'clientes_recurrentes': clientes_recurrentes,
        'ticket_promedio': ticket_promedio,
        'renta_mas_alta': renta_alta,
        'total_ventas': total_ventas,
        'total_cobrado': total_cobrado,
        'total_sin_cobrar': total_sin_cobrar,
        'total_gastos': total_gastos,
        'balance': balance,
        'count_ventas': agg['count'] or 0,
        'count_gastos': len(gastos),
        'cobros_por_cuenta': cobros_por_cuenta,
        'total_cobros_movimientos': total_cobros_movimientos,
        'ventas': ventas,
        'gastos': gastos,
    }


def render_reporte_pdf_bytes(data: dict) -> bytes:
    ventas_fmt = [
        {
            **v,
            'total_fmt': _fmt_money(v['total']),
            'cuentas': [
                {**c, 'monto_fmt': _fmt_money(c['monto'])}
                for c in (v.get('cuentas') or [])
            ],
        }
        for v in data['ventas']
    ]
    gastos_fmt = [
        {
            **g,
            'fecha_fmt': date.fromisoformat(g['fecha']).strftime('%d/%m/%Y'),
            'monto_fmt': _fmt_money(g['monto']),
        }
        for g in data['gastos']
    ]
    cobros_fmt = [
        {
            **c,
            'monto_fmt': _fmt_money(c['monto']),
        }
        for c in (data.get('cobros_por_cuenta') or [])
    ]
    renta_alta = data.get('renta_mas_alta')
    renta_alta_fmt = None
    if renta_alta:
        renta_alta_fmt = {
            **renta_alta,
            'total_fmt': _fmt_money(renta_alta['total']),
        }

    ctx = {
        'logo_url': _logo_file_uri(),
        'nexoo_url': _nexoo_file_uri(),
        'titulo': TITULOS_REPORTE.get(data.get('tipo') or 'semana', 'Reporte'),
        'etiqueta': data.get('etiqueta') or '',
        'periodo': f"{data['fecha_inicio']} — {data['fecha_fin']}",
        'clientes_nuevos': data['clientes_nuevos'],
        'clientes_recurrentes': data['clientes_recurrentes'],
        'ticket_promedio_fmt': _fmt_money(data['ticket_promedio']),
        'renta_mas_alta': renta_alta_fmt,
        'total_ventas_fmt': _fmt_money(data['total_ventas']),
        'total_cobrado_fmt': _fmt_money(data['total_cobrado']),
        'total_sin_cobrar_fmt': _fmt_money(data['total_sin_cobrar']),
        'total_gastos_fmt': _fmt_money(data['total_gastos']),
        'balance_fmt': _fmt_money(data['balance']),
        'cobros_por_cuenta': cobros_fmt,
        'total_cobros_movimientos_fmt': _fmt_money(data.get('total_cobros_movimientos') or 0),
        'ventas': ventas_fmt,
        'gastos': gastos_fmt,
        'count_ventas': data['count_ventas'],
        'count_gastos': data['count_gastos'],
    }

    html = render_to_string('core/reporte_negocio_pdf.html', ctx)
    try:
        from weasyprint import HTML
        return HTML(string=html, base_url=str(ctx.get('logo_url') or '')).write_pdf()
    except Exception:
        return html.encode('utf-8')


def generar_reporte(tipo='semana', fecha=None):
    inicio, fin, etiqueta, tipo_norm = resolver_periodo(tipo, fecha)
    data = build_reporte_negocio(inicio, fin, tipo=tipo_norm, etiqueta=etiqueta)
    return data
