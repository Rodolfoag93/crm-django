"""Horas extra: pago vía nómina (PagoExtra + sync gasto)."""

from decimal import Decimal

from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from core.models import Asistencia, Gasto, HorasExtra, MovimientoContable, Nomina, PagoExtraNomina, TipoPagoExtra
from core.utils import sincronizar_gasto_nomina

TIPO_HORAS_EXTRA_NOMBRE = 'Horas extra'


class HorasExtraPagoError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def _tipo_horas_extra() -> TipoPagoExtra:
    tipo, _ = TipoPagoExtra.objects.get_or_create(
        nombre=TIPO_HORAS_EXTRA_NOMBRE,
        defaults={
            'monto_default': Decimal('0'),
            'descuenta_horas': False,
            'horas_a_descontar': Decimal('0'),
        },
    )
    return tipo


def _dias_asistencias(empleado, semana_inicio, semana_fin) -> int:
    return Asistencia.objects.filter(
        empleado=empleado,
        fecha__range=(semana_inicio, semana_fin),
        hora_entrada__isnull=False,
    ).count()


def _obtener_o_crear_nomina(horas: HorasExtra) -> Nomina:
    nomina = Nomina.objects.filter(
        empleado=horas.empleado,
        fecha_inicio=horas.semana_inicio,
        fecha_fin=horas.semana_fin,
    ).first()
    if nomina:
        return nomina

    # Misma semana (lunes) aunque fecha_fin varíe
    nomina = Nomina.objects.filter(
        empleado=horas.empleado,
        fecha_inicio=horas.semana_inicio,
    ).first()
    if nomina:
        return nomina

    dias = _dias_asistencias(horas.empleado, horas.semana_inicio, horas.semana_fin)
    nomina = Nomina(
        empleado=horas.empleado,
        fecha_inicio=horas.semana_inicio,
        fecha_fin=horas.semana_fin,
        dias_trabajados=max(dias, 0),
    )
    nomina.save()  # total se calcula si pk
    return nomina


def _eliminar_gasto_suelto_horas(horas: HorasExtra):
    """Evita doble conteo: el gasto suelto al crear horas extra se reemplaza por el de nómina."""
    nombre = getattr(horas.empleado, 'nombre', '') or ''
    qs = Gasto.objects.filter(
        tipo='NOMINA',
        fecha=horas.semana_fin,
        monto=horas.total_pago,
        nomina__isnull=True,
    ).filter(descripcion__icontains='Horas extra')
    if nombre:
        qs = qs.filter(descripcion__icontains=nombre)
    for g in qs:
        MovimientoContable.objects.filter(gasto=g).delete()
        g.delete()


@transaction.atomic
def pagar_horas_extra_en_nomina(horas: HorasExtra) -> dict:
    """
    Marca horas extra como pagadas y las agrega como pago extra a la nómina
    de esa semana (crea la nómina si no existe).
    """
    if not horas.pk:
        raise HorasExtraPagoError('Registro de horas extra inválido.')

    if horas.pagado:
        nomina = Nomina.objects.filter(
            empleado=horas.empleado,
            fecha_inicio=horas.semana_inicio,
        ).first()
        return {
            'horas': horas,
            'nomina': nomina,
            'pago_extra': None,
            'ya_pagado': True,
            'creada_nomina': False,
        }

    monto = Decimal(str(horas.total_pago or 0))
    if monto <= 0:
        horas.pagado = True
        horas.fecha_pago = timezone.now().date()
        horas.save(update_fields=['pagado', 'fecha_pago'])
        return {
            'horas': horas,
            'nomina': None,
            'pago_extra': None,
            'ya_pagado': False,
            'creada_nomina': False,
            'sin_monto': True,
        }

    existed = Nomina.objects.filter(
        empleado=horas.empleado,
        fecha_inicio=horas.semana_inicio,
    ).exists()
    nomina = _obtener_o_crear_nomina(horas)
    tipo = _tipo_horas_extra()

    # Idempotencia: no duplicar el mismo pago de este reporte
    pago = PagoExtraNomina.objects.filter(
        nomina=nomina,
        tipo=tipo,
        monto=monto,
    ).first()
    if not pago:
        pago = PagoExtraNomina.objects.create(
            nomina=nomina,
            tipo=tipo,
            monto=monto,
        )

    nomina.save()  # recalcula total
    sincronizar_gasto_nomina(nomina)
    _eliminar_gasto_suelto_horas(horas)

    horas.pagado = True
    horas.fecha_pago = timezone.now().date()
    horas.save(update_fields=['pagado', 'fecha_pago'])

    return {
        'horas': horas,
        'nomina': nomina,
        'pago_extra': pago,
        'ya_pagado': False,
        'creada_nomina': not existed,
        'sin_monto': False,
    }
