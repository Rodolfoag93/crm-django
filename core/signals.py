from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from core.models import RentaProducto, Renta, PedidoFinanzas, Nomina, Empleado, Gasto
from core.services.ocupacion import recalcular_ocupacion_producto_dia
from core.models import calcular_total

@receiver(post_save, sender=RentaProducto)
@receiver(post_delete, sender=RentaProducto)
def actualizar_ocupacion(sender, instance, **kwargs):
    recalcular_ocupacion_producto_dia(
        instance.producto,
        instance.renta.fecha_renta
    )

@receiver(post_save, sender=Renta)
def crear_o_actualizar_pedido_finanzas(sender, instance, **kwargs):
    """
    Crea PedidoFinanzas al guardar la renta o actualiza el total si cambia.
    """
    from .models import PedidoFinanzas, calcular_total

    total = calcular_total(instance)
    pedido, created = PedidoFinanzas.objects.get_or_create(
        renta=instance,
        defaults={'total': total}
    )
    # Siempre actualizamos el total real
    pedido.total = total
    pedido.save()


def calcular_total(renta):
    """
    Calcula el total de la Renta sumando cantidad * precio de cada producto.
    Ajusta esto según tu modelo de productos y relación.
    """
    total = sum([rp.cantidad * rp.producto.precio for rp in renta.rentaproductos.all()])
    return total

@receiver(post_save, sender=Nomina)
def crear_gasto_nomina(sender, instance, created, **kwargs):
    if not created:
        return

    Gasto.objects.create(
        tipo='NOMINA',
        descripcion=f"Nómina {instance.empleado}",
        monto=instance.total,
        fecha=instance.fecha_fin,
        referencia=f"Nomina ID {instance.id}"
    )