from django.db.models import Sum
from core.models import RentaProducto, OcupacionDia

def recalcular_ocupacion_producto_dia(producto, fecha):
    usados = RentaProducto.objects.filter(
        producto=producto,
        renta__fecha_renta=fecha,
        renta__status='ACTIVO'
    ).aggregate(total=Sum('cantidad'))['total'] or 0

    if usados == 0:
        estado = 'LIBRE'
    elif usados < producto.stock_total:
        estado = 'PARCIAL'
    else:
        estado = 'LLENO'

    OcupacionDia.objects.update_or_create(
        producto=producto,
        fecha=fecha,
        defaults={'estado': estado}
    )