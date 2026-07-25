"""APIs /v1/bot/ para integración WhatsApp."""

from decimal import Decimal

from django.core.exceptions import ValidationError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.models import Cliente, Producto, Renta
from core.services.bot_productos import listar_manteles_por_familia, productos_disponibles
from core.services.promociones_renta import (
    opciones_manteles_regalo,
    preview_promo_mantel,
    serializar_linea_cotizacion,
    validar_manteles_regalo,
)
from core.services.rentas import RentaServiceError, crear_renta


def _require_staff(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)
    return None


def _parse_horario_params(request):
    fecha = request.GET.get('fecha') or request.data.get('fecha_renta')
    hora_inicio = request.GET.get('hora_inicio') or request.data.get('hora_inicio')
    hora_fin = request.GET.get('hora_fin') or request.data.get('hora_fin')
    return fecha, hora_inicio, hora_fin


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def bot_cliente(request):
    denied = _require_staff(request)
    if denied:
        return denied

    telefono = request.GET.get('telefono', '').strip()
    if not telefono:
        return Response({'error': 'Parámetro telefono requerido.'}, status=400)

    cliente = Cliente.objects.filter(telefono=telefono).first()
    if not cliente:
        return Response({'existe': False, 'cliente': None})

    return Response({
        'existe': True,
        'cliente': {
            'id': cliente.id,
            'nombre': cliente.nombre,
            'telefono': cliente.telefono,
            'calle_y_numero': cliente.calle_y_numero,
            'colonia': cliente.colonia,
            'ciudad_o_municipio': cliente.ciudad_o_municipio,
        },
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def bot_disponibilidad(request):
    denied = _require_staff(request)
    if denied:
        return denied

    fecha, hora_inicio, hora_fin = _parse_horario_params(request)
    if not all([fecha, hora_inicio, hora_fin]):
        return Response({'error': 'fecha, hora_inicio y hora_fin son requeridos.'}, status=400)

    tipos = request.GET.get('tipo', '')
    search = request.GET.get('search', '').strip()
    data = productos_disponibles(fecha, hora_inicio, hora_fin, tipos=tipos, search=search)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def bot_manteles_regalo(request):
    denied = _require_staff(request)
    if denied:
        return denied

    familia = request.GET.get('familia', '').upper()
    if not familia:
        return Response({'error': 'Parámetro familia requerido.'}, status=400)

    fecha, hora_inicio, hora_fin = _parse_horario_params(request)
    opciones = listar_manteles_por_familia(familia, fecha, hora_inicio, hora_fin)
    return Response({
        'familia': familia,
        'opciones': opciones,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def bot_promo_mantel_preview(request):
    denied = _require_staff(request)
    if denied:
        return denied

    productos = request.data.get('productos') or []
    if not productos:
        return Response({'error': 'productos requerido.'}, status=400)

    preview = preview_promo_mantel(productos)
    fecha, hora_inicio, hora_fin = _parse_horario_params(request)
    preview['opciones'] = opciones_manteles_regalo(
        preview['manteles_regalo'], fecha, hora_inicio, hora_fin
    )
    return Response(preview)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def bot_cotizacion(request):
    denied = _require_staff(request)
    if denied:
        return denied

    data = request.data
    productos = data.get('productos') or []
    manteles_regalo = data.get('manteles_regalo') or []
    if not productos:
        return Response({'error': 'productos requerido.'}, status=400)

    fecha, hora_inicio, hora_fin = _parse_horario_params(request)
    if not all([fecha, hora_inicio, hora_fin]):
        return Response({'error': 'fecha_renta, hora_inicio y hora_fin son requeridos.'}, status=400)

    lineas = []
    productos_no_disponibles = []

    for item in productos:
        producto = Producto.objects.get(id=item['id'])
        cantidad = int(item.get('cantidad', 1))
        precio = Decimal(str(item.get('precio_unitario', producto.precio)))
        if not producto.hay_stock(cantidad, fecha, hora_inicio, hora_fin):
            productos_no_disponibles.append({
                'id': producto.id,
                'nombre': producto.nombre,
                'unidades_libres': producto.stock_disponible_en_horario(
                    fecha, hora_inicio, hora_fin
                ),
            })
        lineas.append(serializar_linea_cotizacion(producto, cantidad, precio, es_regalo=False))

    promo = preview_promo_mantel(productos)
    if manteles_regalo:
        try:
            validados = validar_manteles_regalo(productos, manteles_regalo)
            for item in validados:
                producto = item['producto']
                cantidad = item['cantidad']
                if not producto.hay_stock(cantidad, fecha, hora_inicio, hora_fin):
                    productos_no_disponibles.append({
                        'id': producto.id,
                        'nombre': producto.nombre,
                        'unidades_libres': producto.stock_disponible_en_horario(
                            fecha, hora_inicio, hora_fin
                        ),
                    })
                lineas.append(serializar_linea_cotizacion(
                    producto, cantidad, Decimal('0'), es_regalo=True
                ))
        except ValidationError as exc:
            return Response({'error': str(exc)}, status=400)

    total = sum(Decimal(l['subtotal']) for l in lineas)
    return Response({
        'disponible': len(productos_no_disponibles) == 0,
        'lineas': lineas,
        'total': str(total),
        'promo_mantel': promo,
        'productos_no_disponibles': productos_no_disponibles,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def bot_renta_crear(request):
    denied = _require_staff(request)
    if denied:
        return denied

    try:
        result = crear_renta(request.data)
        return Response(result, status=201)
    except RentaServiceError as exc:
        return Response({'error': exc.message}, status=exc.status)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def bot_renta_detalle(request, folio=None):
    denied = _require_staff(request)
    if denied:
        return denied

    telefono = request.GET.get('telefono', '').strip()
    if telefono:
        rentas = Renta.objects.filter(
            cliente__telefono=telefono,
            status='ACTIVO',
        ).select_related('cliente').prefetch_related(
            'rentaproductos__producto'
        ).order_by('-fecha_renta')[:10]
        return Response([_serializar_renta(r) for r in rentas])

    if not folio:
        return Response({'error': 'folio o telefono requerido.'}, status=400)

    renta = Renta.objects.filter(folio=folio).select_related('cliente').prefetch_related(
        'rentaproductos__producto'
    ).first()
    if not renta:
        return Response({'error': 'Renta no encontrada.'}, status=404)
    return Response(_serializar_renta(renta))


def _serializar_renta(renta):
    productos = []
    for rp in renta.rentaproductos.all():
        productos.append({
            'nombre': rp.producto.nombre,
            'cantidad': rp.cantidad,
            'precio_unitario': str(rp.precio_unitario),
            'subtotal': str(rp.subtotal),
            'es_regalo': rp.precio_unitario == 0 and bool(rp.nota),
        })
    saldo = float(renta.precio_total or 0) - float(renta.anticipo or 0)
    return {
        'folio': renta.folio,
        'renta_id': renta.id,
        'cliente': renta.cliente.nombre,
        'telefono': renta.cliente.telefono,
        'fecha_renta': str(renta.fecha_renta),
        'hora_inicio': str(renta.hora_inicio) if renta.hora_inicio else None,
        'hora_fin': str(renta.hora_fin) if renta.hora_fin else None,
        'direccion': f"{renta.calle_y_numero}, {renta.colonia}, {renta.ciudad_o_municipio}".strip(', '),
        'productos': productos,
        'total': str(renta.precio_total or 0),
        'anticipo': str(renta.anticipo or 0),
        'saldo_pendiente': str(max(0, saldo)),
        'pagado': renta.pagado,
        'estado_entrega': renta.estado_entrega,
    }
