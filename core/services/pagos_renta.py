"""Registro de pagos sobre rentas (PWA y bot WhatsApp)."""

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from core.models import Cuenta, MovimientoContable, PedidoFinanzas


class PagoRentaError(Exception):
    def __init__(self, message, status=400):
        self.message = message
        self.status = status
        super().__init__(message)


def saldo_pendiente(renta) -> Decimal:
    """precio_total - anticipo - ingresos ya registrados en PedidoFinanzas."""
    anticipo = Decimal(str(renta.anticipo or 0))
    pagos = Decimal('0')
    pedido = PedidoFinanzas.objects.filter(renta=renta).first()
    if pedido:
        total_ing = pedido.movimientos.filter(tipo='INGRESO').aggregate(t=Sum('monto'))['t']
        pagos = Decimal(str(total_ing or 0))
    return (Decimal(str(renta.precio_total or 0)) - anticipo - pagos).quantize(Decimal('0.01'))


def pagos_registrados(renta) -> Decimal:
    pedido = PedidoFinanzas.objects.filter(renta=renta).first()
    if not pedido:
        return Decimal('0')
    total_ing = pedido.movimientos.filter(tipo='INGRESO').aggregate(t=Sum('monto'))['t']
    return Decimal(str(total_ing or 0))


def resolver_cuenta(metodo: str, cuenta_id=None) -> Cuenta:
    metodo = (metodo or '').lower()
    if metodo == 'efectivo':
        qs = Cuenta.objects.filter(tipo__iexact='efectivo')
        cuenta = qs.first()
        if not cuenta:
            raise PagoRentaError('No hay caja de efectivo configurada.')
        return cuenta

    if metodo != 'transferencia':
        raise PagoRentaError('metodo_pago inválido.')

    if cuenta_id:
        cuenta = Cuenta.objects.filter(id=cuenta_id).first()
        if not cuenta:
            raise PagoRentaError('Cuenta no encontrada.')
        return cuenta

    cuenta = (
        Cuenta.objects.filter(activa=True)
        .exclude(tipo__iexact='efectivo')
        .order_by('id')
        .first()
    )
    if not cuenta:
        raise PagoRentaError('No hay cuenta bancaria configurada.')
    return cuenta


def registrar_pago_renta(renta, *, monto, metodo_pago, cuenta_id=None) -> dict:
    """
    Registra un INGRESO parcial o liquidación.
    Retorna dict con ok, liquidado, saldo_pendiente, etc.
    """
    if renta.pagado:
        raise PagoRentaError('Esta renta ya está completamente pagada.')

    try:
        monto_dec = Decimal(str(monto))
        if monto_dec <= 0:
            raise ValueError
    except Exception as exc:
        raise PagoRentaError('Monto inválido.') from exc

    metodo = (metodo_pago or '').lower()
    cuenta = resolver_cuenta(metodo, cuenta_id)
    saldo = saldo_pendiente(renta)
    if saldo <= 0:
        raise PagoRentaError('No hay saldo pendiente.')
    if monto_dec > saldo:
        raise PagoRentaError(f'El monto supera el saldo pendiente (${saldo:,.2f}).')

    liquidacion = monto_dec >= saldo
    with transaction.atomic():
        finanza, _ = PedidoFinanzas.objects.get_or_create(
            renta=renta, defaults={'total': saldo}
        )
        now = timezone.now()
        desc = (
            f'Liquidación renta #{renta.folio or renta.id}'
            if liquidacion
            else f'Pago parcial renta #{renta.folio or renta.id}'
        )
        MovimientoContable.objects.create(
            pedido=finanza,
            tipo='INGRESO',
            monto=monto_dec,
            metodo_pago=metodo,
            cuenta=cuenta,
            fecha=now,
            descripcion=desc,
        )
        if liquidacion:
            renta.pagado = True
            renta.save(update_fields=['pagado'])
            finanza.pagado = True
            finanza.metodo_pago = metodo
            finanza.cuenta_destino = cuenta
            finanza.fecha_pago = now
            finanza.total = saldo
            finanza.save()

    nuevo_saldo = max(Decimal('0'), saldo - monto_dec)
    return {
        'ok': True,
        'folio': renta.folio,
        'renta_id': renta.id,
        'liquidado': liquidacion,
        'monto': str(monto_dec),
        'metodo_pago': metodo,
        'saldo_pendiente': str(nuevo_saldo),
        'total': str(renta.precio_total or 0),
        'anticipo': str(renta.anticipo or 0),
        'pagos_registrados': str(pagos_registrados(renta)),
        'pagado': bool(renta.pagado),
        'telefono_cliente': renta.cliente.telefono if renta.cliente_id else None,
        'cliente': renta.cliente.nombre if renta.cliente_id else None,
    }
