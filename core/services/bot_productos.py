"""Utilidades para detectar familias de mesa/mantel desde el nombre del producto."""

from __future__ import annotations

import re
from collections import defaultdict

from django.db.models import QuerySet

from core.models import Producto

FAMILIAS_MANTEL = ('TABLON', 'INFANTIL', 'REDONDO', 'IMPERIAL')
FAMILIA_ORDEN = FAMILIAS_MANTEL
SILLAS_MINIMAS_POR_MESA = 10

# Variantes para match accent-insensitive vía iregex (Postgres/SQLite).
_ACCENT_ALTS = {
    'a': 'aáàäâ',
    'e': 'eéèëê',
    'i': 'iíìïî',
    'o': 'oóòöô',
    'u': 'uúùüû',
    'n': 'nñ',
}


def _normalizar(nombre: str) -> str:
    n = (nombre or '').lower().strip()
    return n.replace('ó', 'o').replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ú', 'u')


def tokenizar_busqueda(search: str, max_tokens: int = 6) -> list[str]:
    """
    Parte la query en tokens (>=2 chars), sin acentos.
    Ej: "Spiderman chico tobogán" -> ["spiderman", "chico", "tobogan"]
    """
    raw = _normalizar(search or '')
    tokens = [t for t in re.split(r'[^a-z0-9]+', raw) if len(t) >= 2]
    return tokens[:max_tokens]


def _patron_iregex_token(token: str) -> str:
    """Convierte 'tobogan' en patrón que también matchea 'tobogán'."""
    partes = []
    for ch in token.lower():
        if ch in _ACCENT_ALTS:
            partes.append(f'[{_ACCENT_ALTS[ch]}]')
        else:
            partes.append(re.escape(ch))
    return ''.join(partes)


def aplicar_busqueda_nombre(qs: QuerySet, search: str) -> QuerySet:
    """
    Filtra por nombre con AND de tokens, case/accent-insensitive.
    "spiderman chico" exige ambos tokens en el nombre (no la frase completa).
    """
    tokens = tokenizar_busqueda(search)
    if not tokens:
        return qs

    for token in tokens:
        patron = _patron_iregex_token(token)
        qs = qs.filter(nombre__iregex=patron)
    return qs


def detectar_familia_mesa(nombre: str) -> str | None:
    n = _normalizar(nombre)
    if 'infantil' in n and 'tablon' in n:
        return 'INFANTIL'
    if 'imperial' in n:
        return 'IMPERIAL'
    if 'redond' in n:
        return 'REDONDO'
    if 'tablon' in n:
        return 'TABLON'
    return None


def detectar_familia_mantel(nombre: str) -> str | None:
    n = _normalizar(nombre)
    if 'infantil' in n:
        return 'INFANTIL'
    if 'imperial' in n:
        return 'IMPERIAL'
    if 'redond' in n:
        return 'REDONDO'
    if 'tablon' in n:
        return 'TABLON'
    return None


def extraer_color_mantel(nombre: str) -> str:
    n = _normalizar(nombre)
    for prefijo in ('mantel infantil', 'mantel tablón', 'mantel tablon',
                    'mantel redondo', 'mantel redonda', 'mantel imperial', 'mantel'):
        if n.startswith(prefijo):
            color = nombre[len(prefijo):].strip(' -–')
            return color or nombre
    return nombre


def listar_manteles_por_familia(familia: str, fecha=None, hora_inicio=None, hora_fin=None):
    if familia not in FAMILIAS_MANTEL:
        return []

    opciones = []
    for producto in Producto.objects.filter(tipo='MT', activo=True).order_by('nombre'):
        if detectar_familia_mantel(producto.nombre) != familia:
            continue
        item = {
            'id': producto.id,
            'nombre': producto.nombre,
            'color': extraer_color_mantel(producto.nombre),
            'precio_lista': str(producto.precio),
            'stock_total': producto.stock_total,
        }
        if fecha and hora_inicio and hora_fin:
            item['unidades_libres'] = producto.stock_disponible_en_horario(
                fecha, hora_inicio, hora_fin
            )
        else:
            item['unidades_libres'] = producto.stock_disponible
        opciones.append(item)
    return opciones


def productos_disponibles(
    fecha,
    hora_inicio,
    hora_fin,
    tipos=None,
    search='',
    limit=None,
    solo_disponibles=False,
):
    """
    Lista productos activos con stock en horario.
    search: multi-token AND, case/accent-insensitive.
    limit: tope de resultados (útil para menús WhatsApp).
    solo_disponibles: si True, omite unidades_libres == 0.
    """
    qs = Producto.objects.filter(activo=True)
    if tipos:
        tipo_list = [t.strip().upper() for t in tipos.split(',') if t.strip()]
        if tipo_list:
            qs = qs.filter(tipo__in=tipo_list)
    if search:
        qs = aplicar_busqueda_nombre(qs, search)
    qs = qs.order_by('tipo', 'nombre')

    resultados = []
    for producto in qs:
        libres = producto.stock_disponible_en_horario(fecha, hora_inicio, hora_fin)
        if solo_disponibles and libres <= 0:
            continue
        resultados.append({
            'id': producto.id,
            'nombre': producto.nombre,
            'tipo': producto.tipo,
            'tipo_display': producto.get_tipo_display(),
            'precio': str(producto.precio),
            'disponible': libres > 0,
            'unidades_libres': libres,
            'familia_mesa': detectar_familia_mesa(producto.nombre) if producto.tipo == 'ME' else None,
        })
        if limit is not None and len(resultados) >= int(limit):
            break
    return resultados


def agrupar_mesas_por_familia(lineas):
    """lineas: iterable de dicts con keys producto (Producto) y cantidad."""
    mesas = defaultdict(int)
    sillas = 0
    for linea in lineas:
        producto = linea['producto']
        cantidad = int(linea['cantidad'])
        if producto.tipo == 'SI':
            sillas += cantidad
        elif producto.tipo == 'ME':
            familia = detectar_familia_mesa(producto.nombre)
            if familia:
                mesas[familia] += cantidad
    return dict(mesas), sillas
