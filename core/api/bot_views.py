"""APIs /v1/bot/ para integración WhatsApp."""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.models import Cliente, Empleado, Producto, Renta
from core.services.bot_productos import (
    listar_manteles_por_familia,
    productos_disponibles,
    tokenizar_busqueda,
)
from core.services.pagos_renta import (
    PagoRentaError,
    pagos_registrados,
    registrar_pago_renta,
    saldo_pendiente,
)
from core.services.promociones_renta import (
    opciones_manteles_regalo,
    preview_promo_mantel,
    serializar_linea_cotizacion,
    validar_manteles_regalo,
)
from core.services.rentas import RentaServiceError, cancelar_renta, crear_renta, editar_renta
from core.services import whatsapp_cart as wa_cart


def _require_staff(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)
    return None


def _solo_digitos(valor: str) -> str:
    return ''.join(c for c in (valor or '') if c.isdigit())


def _claves_telefono(valor: str) -> set[str]:
    """Variantes para match MX: completo y últimos 10."""
    d = _solo_digitos(valor)
    if not d:
        return set()
    keys = {d}
    if len(d) >= 10:
        keys.add(d[-10:])
    return keys


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def bot_empleados_telefonos(request):
    """
    Teléfonos de empleados activos para el bot WhatsApp.

    - ignore: no deben disparar el flujo de cliente (staff escribiendo al negocio)
    - asesores: a quién avisar en HANDOFF (COORDINADOR / ENCARGADO por defecto)
    """
    denied = _require_staff(request)
    if denied:
        return denied

    tipos_asesor_raw = (request.GET.get('tipos_asesor') or 'COORDINADOR,ENCARGADO').upper()
    tipos_asesor = {t.strip() for t in tipos_asesor_raw.split(',') if t.strip()}

    ignore = []
    asesores = []
    vistos_ignore = set()
    vistos_asesor = set()

    qs = Empleado.objects.filter(activo=True).exclude(telefono='').order_by('nombre')
    for emp in qs:
        digitos = _solo_digitos(emp.telefono)
        if len(digitos) < 10:
            continue
        clave = digitos[-10:]
        item = {
            'id': emp.id,
            'nombre': emp.nombre,
            'telefono': clave,
            'telefono_raw': emp.telefono,
            'tipo_empleado': emp.tipo_empleado,
        }
        if clave not in vistos_ignore:
            ignore.append(item)
            vistos_ignore.add(clave)
        if emp.tipo_empleado in tipos_asesor and clave not in vistos_asesor:
            asesores.append(item)
            vistos_asesor.add(clave)

    return Response({
        'ignore': ignore,
        'asesores': asesores,
        'count_ignore': len(ignore),
        'count_asesores': len(asesores),
    })


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

    digitos = _solo_digitos(telefono)
    clave = digitos[-10:] if len(digitos) >= 10 else digitos

    cliente = Cliente.objects.filter(telefono=telefono).first()
    if not cliente and clave:
        cliente = (
            Cliente.objects.filter(telefono=clave).first()
            or Cliente.objects.filter(telefono__endswith=clave).first()
        )

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
    solo_disponibles = str(request.GET.get('solo_disponibles', '')).lower() in (
        '1', 'true', 'yes', 'si', 'sí',
    )
    limit_raw = request.GET.get('limit')
    limit = None
    if limit_raw not in (None, ''):
        try:
            limit = max(1, min(int(limit_raw), 50))
        except (TypeError, ValueError):
            return Response({'error': 'limit debe ser un entero.'}, status=400)

    data = productos_disponibles(
        fecha,
        hora_inicio,
        hora_fin,
        tipos=tipos,
        search=search,
        limit=limit,
        solo_disponibles=solo_disponibles,
    )
    for item in data:
        item.pop('search_tokens', None)
    return Response({
        'count': len(data),
        'search_tokens': tokenizar_busqueda(search) if search else [],
        'resultados': data,
    })


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
        digitos = _solo_digitos(telefono)
        clave = digitos[-10:] if len(digitos) >= 10 else digitos
        qs = Renta.objects.filter(status='ACTIVO').select_related('cliente').prefetch_related(
            'rentaproductos__producto'
        )
        if clave:
            qs = qs.filter(
                Q(cliente__telefono=telefono)
                | Q(cliente__telefono=clave)
                | Q(cliente__telefono__endswith=clave)
            )
        else:
            qs = qs.filter(cliente__telefono=telefono)
        rentas = qs.order_by('-fecha_renta', '-id')[:10]
        data = [_serializar_renta(r) for r in rentas]
        return Response({'count': len(data), 'rentas': data})

    if not folio:
        return Response({'error': 'folio o telefono requerido.'}, status=400)

    renta = Renta.objects.filter(folio=folio).select_related('cliente').prefetch_related(
        'rentaproductos__producto'
    ).first()
    if not renta:
        return Response({'error': 'Renta no encontrada.'}, status=404)
    return Response(_serializar_renta(renta))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def bot_renta_pago(request, folio):
    """Registra pago (transferencia/efectivo) validado por asesor vía bot."""
    denied = _require_staff(request)
    if denied:
        return denied

    renta = Renta.objects.filter(folio=folio).select_related('cliente').first()
    if not renta:
        return Response({'error': 'Renta no encontrada.'}, status=404)

    metodo = (request.data.get('metodo_pago') or 'transferencia').lower()
    monto = request.data.get('monto')
    if monto in (None, ''):
        try:
            monto = str(saldo_pendiente(renta))
        except Exception:
            return Response({'error': 'No se pudo calcular el saldo.'}, status=400)

    try:
        result = registrar_pago_renta(
            renta,
            monto=monto,
            metodo_pago=metodo,
            cuenta_id=request.data.get('cuenta_id'),
        )
        return Response(result)
    except PagoRentaError as exc:
        return Response({'error': exc.message}, status=exc.status)


def _telefono_coincide(renta, telefono: str) -> bool:
    if not telefono:
        return True
    keys = _claves_telefono(telefono)
    if not keys:
        return True
    return bool(_claves_telefono(renta.cliente.telefono or '') & keys)


def _renta_activa_folio(folio: str):
    return (
        Renta.objects.filter(folio=folio)
        .select_related('cliente')
        .prefetch_related('rentaproductos__producto')
        .first()
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def bot_renta_cancelar(request, folio):
    denied = _require_staff(request)
    if denied:
        return denied

    renta = _renta_activa_folio(folio)
    if not renta:
        return Response({'error': 'Renta no encontrada.'}, status=404)
    if not _telefono_coincide(renta, request.data.get('telefono') or ''):
        return Response({'error': 'El folio no corresponde a este teléfono.'}, status=403)

    motivo = (request.data.get('motivo') or 'Cancelado por cliente vía WhatsApp').strip()
    try:
        result = cancelar_renta(renta, motivo)
        return Response(result)
    except RentaServiceError as exc:
        return Response({'error': exc.message}, status=exc.status)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def bot_renta_validacion(request, folio):
    """Asesor aprueba/rechaza logística (temporada alta). Rechazo cancela y libera stock."""
    denied = _require_staff(request)
    if denied:
        return denied

    from core.services.temporada_alta import (
        aprobar_validacion_logistica,
        rechazar_validacion_logistica,
    )

    renta = _renta_activa_folio(folio)
    if not renta:
        return Response({'error': 'Renta no encontrada.'}, status=404)

    accion = (request.data.get('accion') or request.data.get('decision') or '').lower().strip()
    actor = (request.data.get('actor') or request.user.username or 'bot').strip()
    motivo = (request.data.get('motivo') or '').strip()

    try:
        if accion in ('aprobar', 'ok', 'si', 'sí', 'approve'):
            return Response(aprobar_validacion_logistica(renta, actor=actor))
        if accion in ('rechazar', 'no', 'reject', 'cancelar'):
            return Response(rechazar_validacion_logistica(renta, motivo=motivo, actor=actor))
        return Response({'error': 'accion debe ser aprobar o rechazar.'}, status=400)
    except RentaServiceError as exc:
        return Response({'error': exc.message}, status=exc.status)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def bot_temporada_check(request):
    denied = _require_staff(request)
    if denied:
        return denied
    from core.services.temporada_alta import temporada_para_fecha
    fecha = request.GET.get('fecha')
    if not fecha:
        return Response({'error': 'fecha requerida (YYYY-MM-DD).'}, status=400)
    try:
        t = temporada_para_fecha(fecha)
    except Exception:
        return Response({'error': 'fecha inválida.'}, status=400)
    if not t:
        return Response({'temporada_alta': False})
    return Response({
        'temporada_alta': True,
        'nombre': t.nombre,
        'fecha_inicio': str(t.fecha_inicio),
        'fecha_fin': str(t.fecha_fin),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def bot_renta_editar(request, folio):
    denied = _require_staff(request)
    if denied:
        return denied

    renta = _renta_activa_folio(folio)
    if not renta:
        return Response({'error': 'Renta no encontrada.'}, status=404)
    if not _telefono_coincide(renta, request.data.get('telefono') or ''):
        return Response({'error': 'El folio no corresponde a este teléfono.'}, status=403)

    try:
        result = editar_renta(renta, request.data)
        renta.refresh_from_db()
        data = _serializar_renta(renta)
        data.update(result)
        return Response(data)
    except RentaServiceError as exc:
        return Response({'error': exc.message}, status=exc.status)
    except Producto.DoesNotExist:
        return Response({'error': 'Producto no encontrado.'}, status=400)


def _serializar_renta(renta):
    productos = []
    for rp in renta.rentaproductos.all():
        productos.append({
            'id': rp.producto_id,
            'nombre': rp.producto.nombre,
            'cantidad': rp.cantidad,
            'precio_unitario': str(rp.precio_unitario),
            'subtotal': str(rp.subtotal),
            'es_regalo': rp.precio_unitario == 0 and bool(rp.nota),
        })
    anticipo = Decimal(str(renta.anticipo or 0))
    pagos = pagos_registrados(renta)
    saldo = saldo_pendiente(renta)
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
        'anticipo': str(anticipo),
        'pagos_registrados': str(pagos),
        'saldo_pendiente': str(max(Decimal('0'), saldo)),
        'pagado': renta.pagado,
        'estado_entrega': renta.estado_entrega,
        'status': renta.status,
        'validacion_logistica': getattr(renta, 'validacion_logistica', 'NO_REQUIERE'),
        'temporada_alta': renta.temporada_alta.nombre if getattr(renta, 'temporada_alta_id', None) else None,
        'requiere_validacion_logistica': getattr(renta, 'validacion_logistica', '') == 'PENDIENTE',
    }


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def bot_resolver_carrito(request):
    """
    Resuelve product_retailer_id del catálogo WhatsApp → Producto.id del CRM.

    Body: { "items": [ {"product_retailer_id": "...", "cantidad": 1}, ... ] }

    - `items` ausente o no-lista → 400 (bug del caller / n8n).
    - `items: []` → 200 con resueltos=[] y no_identificados=[] (caso válido).
    - No consulta stock/disponibilidad; solo mapeo determinista.
    """
    denied = _require_staff(request)
    if denied:
        return denied

    if 'items' not in request.data:
        return Response({'error': 'items es requerido (lista).'}, status=400)
    items = request.data.get('items')
    if not isinstance(items, list):
        return Response({'error': 'items debe ser una lista.'}, status=400)

    return Response(wa_cart.resolver_carrito(items))
