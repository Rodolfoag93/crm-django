"""Resolución de carrito WhatsApp (product_retailer_id → Producto CRM).

Solo mapeo determinista. No consulta disponibilidad, no inventa precios,
no hace fuzzy-match por nombre.
"""
from __future__ import annotations

from decimal import Decimal

from core.models import Producto


def _parse_cantidad(raw) -> int:
    try:
        n = int(raw)
    except (TypeError, ValueError):
        n = 1
    return max(1, n)


def resolver_carrito(items: list) -> dict:
    """
    Resuelve items del catálogo Meta/WhatsApp a Producto.id del CRM.

    items: [{product_retailer_id, cantidad}, ...]

    Lookup en dos pasos (sin filtrar activo primero) para distinguir:
      - sin_mapeo: no hay Producto con ese meta_retailer_id
      - inactivo: existe pero activo=False

    Duplicados del mismo retailer/id CRM se fusionan sumando cantidades.
    """
    resueltos_by_id: dict[int, dict] = {}
    no_identificados: list[dict] = []

    for raw in items:
        if not isinstance(raw, dict):
            continue
        rid = str(raw.get('product_retailer_id') or '').strip()
        cantidad = _parse_cantidad(raw.get('cantidad'))
        if not rid:
            no_identificados.append({
                'product_retailer_id': '',
                'cantidad': cantidad,
                'motivo': 'vacio',
            })
            continue

        # Dos pasos: primero por SKU (incluye inactivos), luego checar activo.
        producto = Producto.objects.filter(meta_retailer_id=rid).first()
        if producto is None:
            no_identificados.append({
                'product_retailer_id': rid,
                'cantidad': cantidad,
                'motivo': 'sin_mapeo',
            })
            continue
        if not producto.activo:
            no_identificados.append({
                'product_retailer_id': rid,
                'cantidad': cantidad,
                'motivo': 'inactivo',
            })
            continue

        existing = resueltos_by_id.get(producto.id)
        if existing:
            existing['cantidad'] = int(existing['cantidad']) + cantidad
        else:
            precio = producto.precio
            if isinstance(precio, Decimal):
                precio_str = f'{precio:.2f}'
            else:
                precio_str = str(precio)
            resueltos_by_id[producto.id] = {
                'id': producto.id,
                'nombre': producto.nombre,
                'tipo': producto.tipo,
                'precio': precio_str,
                'cantidad': cantidad,
                'product_retailer_id': rid,
            }

    return {
        'resueltos': list(resueltos_by_id.values()),
        'no_identificados': no_identificados,
    }
