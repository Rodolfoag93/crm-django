# core/utils.py
from django.db.models import Sum, Case, When, F, DecimalField
from .models import MovimientoContable, Gasto
from django.utils import timezone

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


def sincronizar_gasto_nomina(nomina):
    """
    Sincroniza el gasto y el movimiento contable de una nómina.
    La nómina SIEMPRE se paga en efectivo.
    """

    descripcion = f'Nómina {nomina.id}'

    # =========================
    # 1️⃣ GASTO
    # =========================
    gasto, _ = Gasto.objects.update_or_create(
        nomina=nomina,
        defaults={
            'tipo': 'NOMINA',
            'categoria': 'NOMINA',
            'fecha': nomina.fecha_fin,
            'monto': nomina.total,
            'descripcion': descripcion,
            'cuenta': None  # 💵 efectivo
        }
    )

    # =========================
    # 2️⃣ MOVIMIENTO CONTABLE
    # =========================
    MovimientoContable.objects.update_or_create(
        descripcion=descripcion,
        tipo='EGRESO',
        metodo_pago='efectivo',
        cuenta=None,
        defaults={
            'pedido': None,
            'monto': nomina.total,
            'fecha': timezone.now()
        }
    )

def calcular_total(renta):
    total = 0

    for rp in renta.rentaproductos.all():
        total += rp.precio_unitario * rp.cantidad

    return total