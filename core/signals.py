from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from core.models import RentaProducto, Renta, PedidoFinanzas
from core.services.ocupacion import recalcular_ocupacion_producto_dia

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

