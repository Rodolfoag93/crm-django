# core/utils.py
from django.db.models import Sum, Case, When, F, DecimalField
from django.utils import timezone

from .models import MovimientoContable, Gasto, Cuenta, Nomina


def saldo_efectivo():
    return MovimientoContable.objects.filter(
        cuenta__isnull=True
    ).aggregate(
        total=Sum(
            Case(
                When(tipo='INGRESO', then=F('monto')),
                When(tipo='EGRESO', then=-F('monto')),
                output_field=DecimalField()
            )
        )
    )['total'] or 0


def _descripcion_gasto_nomina(nomina):
    nombre = (getattr(nomina.empleado, 'nombre', None) or '').strip() or f'#{nomina.empleado_id}'
    extras = nomina.pago_eventos_extra()
    if extras:
        return f'Nómina {nombre} (incl. pagos extra)'
    return f'Nómina {nombre}'


def sincronizar_gasto_nomina(nomina):
    """
    Sincroniza el gasto y el movimiento contable de una nómina.
    El monto incluye sueldo base + pagos extras (nomina.calcular_total()).
    La nómina SIEMPRE se paga en efectivo.
    """
    if not nomina.pk:
        return None

    # Asegurar total al día (base + extras)
    total = nomina.calcular_total()
    if nomina.total != total:
        Nomina.objects.filter(pk=nomina.pk).update(total=total)
        nomina.total = total

    descripcion = _descripcion_gasto_nomina(nomina)
    referencia = f'nomina:{nomina.id}'

    gasto, _ = Gasto.objects.update_or_create(
        nomina=nomina,
        defaults={
            'tipo': 'NOMINA',
            'categoria': 'NOMINA',
            'fecha': nomina.fecha_fin,
            'monto': total,
            'descripcion': descripcion,
            'referencia': referencia,
            'cuenta': None,  # efectivo
        }
    )

    cuenta_efectivo = Cuenta.objects.filter(tipo__iexact='Efectivo', activa=True).first()
    if cuenta_efectivo is None:
        cuenta_efectivo = Cuenta.objects.filter(tipo__iexact='efectivo').first()

    mov = MovimientoContable.objects.filter(gasto=gasto).first()
    if mov is None:
        # Compat: movimientos viejos sin FK gasto, buscados por descripción legada
        mov = MovimientoContable.objects.filter(
            gasto__isnull=True,
            tipo='EGRESO',
            descripcion__in=[f'Nómina {nomina.id}', descripcion],
        ).order_by('-id').first()

    campos = {
        'tipo': 'EGRESO',
        'metodo_pago': 'efectivo',
        'cuenta': cuenta_efectivo,
        'pedido': None,
        'gasto': gasto,
        'monto': total,
        'descripcion': descripcion,
        'fecha': timezone.now(),
    }
    if mov:
        for k, v in campos.items():
            setattr(mov, k, v)
        mov.save()
    else:
        MovimientoContable.objects.create(**campos)

    return gasto


def resync_todos_gastos_nomina():
    """Recalcula total y sincroniza gasto/movimiento de todas las nóminas."""
    n = 0
    for nomina in Nomina.objects.select_related('empleado').iterator():
        sincronizar_gasto_nomina(nomina)
        n += 1
    return n


def calcular_total(renta):
    total = 0
    for rp in renta.rentaproductos.all():
        total += rp.precio_unitario * rp.cantidad
    return total
