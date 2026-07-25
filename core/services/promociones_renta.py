"""Reglas de promoción: mantel de regalo con mesa + 10 sillas."""

from collections import defaultdict
from decimal import Decimal

from django.core.exceptions import ValidationError

from core.models import Producto
from core.services.bot_productos import (
    FAMILIA_ORDEN,
    SILLAS_MINIMAS_POR_MESA,
    agrupar_mesas_por_familia,
    detectar_familia_mantel,
    extraer_color_mantel,
    listar_manteles_por_familia,
)


NOTA_REGALO = 'Regalo: mesa + 10 sillas'


def _resolver_lineas(productos_data):
    lineas = []
    for item in productos_data:
        producto = item.get('producto')
        if producto is None:
            producto = Producto.objects.get(id=item['id'])
        lineas.append({
            'producto': producto,
            'cantidad': int(item.get('cantidad', 1)),
            'precio_unitario': item.get('precio_unitario'),
        })
    return lineas


def calcular_manteles_regalo(productos_data):
    """
    Retorna cuántos manteles regalo aplican por familia.
    Ej: {'TABLON': 2, 'REDONDO': 1}
    """
    lineas = _resolver_lineas(productos_data)
    mesas_por_familia, sillas_total = agrupar_mesas_por_familia(lineas)

    if not mesas_por_familia or sillas_total < SILLAS_MINIMAS_POR_MESA:
        return {}

    regalo = {}
    sillas_restantes = sillas_total
    for familia in FAMILIA_ORDEN:
        mesas = mesas_por_familia.get(familia, 0)
        if mesas <= 0:
            continue
        paquetes = min(mesas, sillas_restantes // SILLAS_MINIMAS_POR_MESA)
        if paquetes > 0:
            regalo[familia] = paquetes
            sillas_restantes -= paquetes * SILLAS_MINIMAS_POR_MESA
    return regalo


def preview_promo_mantel(productos_data):
    regalo = calcular_manteles_regalo(productos_data)
    lineas = _resolver_lineas(productos_data)
    mesas_por_familia, sillas_total = agrupar_mesas_por_familia(lineas)
    return {
        'sillas_total': sillas_total,
        'sillas_minimas_por_mesa': SILLAS_MINIMAS_POR_MESA,
        'mesas_por_familia': mesas_por_familia,
        'manteles_regalo': regalo,
        'total_regalos': sum(regalo.values()),
    }


def _normalizar_elecciones(manteles_regalo):
    por_familia = defaultdict(int)
    detalle = []
    for item in manteles_regalo:
        producto_id = item.get('producto_id') or item.get('id')
        cantidad = int(item.get('cantidad', 1))
        producto = Producto.objects.get(id=producto_id)
        if producto.tipo != 'MT':
            raise ValidationError(f'"{producto.nombre}" no es mantelería.')
        familia = detectar_familia_mantel(producto.nombre)
        if not familia:
            raise ValidationError(f'No se detectó familia del mantel "{producto.nombre}".')
        por_familia[familia] += cantidad
        detalle.append({
            'producto': producto,
            'cantidad': cantidad,
            'familia': familia,
        })
    return detalle, dict(por_familia)


def validar_manteles_regalo(productos_data, manteles_regalo):
    if not manteles_regalo:
        return []

    regalo_esperado = calcular_manteles_regalo(productos_data)
    if not regalo_esperado:
        raise ValidationError(
            'El pedido no califica para mantel de regalo (requiere mesa + 10 sillas).'
        )

    detalle, elegido_por_familia = _normalizar_elecciones(manteles_regalo)
    for familia, cantidad_esperada in regalo_esperado.items():
        if elegido_por_familia.get(familia, 0) != cantidad_esperada:
            raise ValidationError(
                f'Se esperaban {cantidad_esperada} mantel(es) {familia.lower()}, '
                f'se recibieron {elegido_por_familia.get(familia, 0)}.'
            )

    for familia, cantidad in elegido_por_familia.items():
        if familia not in regalo_esperado:
            raise ValidationError(f'No aplica mantel de regalo para familia {familia}.')

    return detalle


def lineas_mantel_regalo(manteles_regalo_validados):
    lineas = []
    for item in manteles_regalo_validados:
        producto = item['producto']
        lineas.append({
            'producto': producto,
            'cantidad': item['cantidad'],
            'precio_unitario': Decimal('0'),
            'precio_lista': producto.precio,
            'nota': NOTA_REGALO,
            'es_regalo': True,
        })
    return lineas


def opciones_manteles_regalo(regalo_por_familia, fecha=None, hora_inicio=None, hora_fin=None):
    opciones = {}
    for familia, cantidad in regalo_por_familia.items():
        opciones[familia] = {
            'cantidad_regalo': cantidad,
            'colores_disponibles': listar_manteles_por_familia(
                familia, fecha, hora_inicio, hora_fin
            ),
        }
    return opciones


def serializar_linea_cotizacion(producto, cantidad, precio_unitario, es_regalo=False):
    subtotal = Decimal(str(precio_unitario)) * cantidad
    linea = {
        'id': producto.id,
        'nombre': producto.nombre,
        'tipo': producto.tipo,
        'cantidad': cantidad,
        'precio_unitario': str(precio_unitario),
        'subtotal': str(subtotal),
        'es_regalo': es_regalo,
    }
    if producto.tipo == 'MT':
        linea['familia'] = detectar_familia_mantel(producto.nombre)
        linea['color'] = extraer_color_mantel(producto.nombre)
    return linea
