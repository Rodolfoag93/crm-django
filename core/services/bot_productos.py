"""Utilidades para detectar familias de mesa/mantel desde el nombre del producto."""

from collections import defaultdict

from core.models import Producto

FAMILIAS_MANTEL = ('TABLON', 'INFANTIL', 'REDONDO', 'IMPERIAL')
FAMILIA_ORDEN = FAMILIAS_MANTEL
SILLAS_MINIMAS_POR_MESA = 10


def _normalizar(nombre: str) -> str:
    n = (nombre or '').lower().strip()
    return n.replace('ó', 'o').replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ú', 'u')


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


def productos_disponibles(fecha, hora_inicio, hora_fin, tipos=None, search=''):
    qs = Producto.objects.filter(activo=True)
    if tipos:
        tipo_list = [t.strip().upper() for t in tipos.split(',') if t.strip()]
        if tipo_list:
            qs = qs.filter(tipo__in=tipo_list)
    if search:
        qs = qs.filter(nombre__icontains=search)
    qs = qs.order_by('tipo', 'nombre')

    resultados = []
    for producto in qs:
        libres = producto.stock_disponible_en_horario(fecha, hora_inicio, hora_fin)
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
