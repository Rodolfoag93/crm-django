"""API pública del sitio marketing (trotacrm.com) — sin auth staff."""
from __future__ import annotations

import logging
from datetime import date, datetime, time

from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from core.models import Producto
from core.services.bot_productos import productos_disponibles
from core.services.rentas import RentaServiceError, crear_renta
from core.services.temporada_alta import temporada_para_fecha

logger = logging.getLogger(__name__)


class PublicAnonThrottle(AnonRateThrottle):
    scope = 'public'


def _parse_date(raw):
    if not raw:
        return None
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw
    return date.fromisoformat(str(raw)[:10])


def _parse_time(raw):
    if not raw:
        return None
    if isinstance(raw, time):
        return raw
    s = str(raw).strip()
    if len(s) == 5:
        s = s + ':00'
    return time.fromisoformat(s)


def _producto_public_dict(p: Producto) -> dict:
    foto_url = None
    if getattr(p, 'foto', None):
        try:
            from core.api.sitio_web_views import media_url
            foto_url = media_url(p.foto)
        except Exception:
            foto_url = None
    cat = (getattr(p, 'categoria_web', None) or '').strip() or None
    if p.tipo != 'BR':
        cat = None
    return {
        'id': p.id,
        'nombre': p.nombre,
        'tipo': p.tipo,
        'precio': str(p.precio),
        'foto_url': foto_url,
        'categoria_filtro': cat,
        'medida': None,
    }


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([PublicAnonThrottle])
def public_productos(request):
    tipo = (request.GET.get('tipo') or '').upper().strip()
    qs = Producto.objects.filter(activo=True).order_by('nombre')
    if tipo:
        qs = qs.filter(tipo=tipo)
    limit = request.GET.get('limit')
    if limit not in (None, ''):
        try:
            qs = qs[: max(1, min(int(limit), 200))]
        except (TypeError, ValueError):
            return Response({'error': 'limit inválido.'}, status=400)
    data = [_producto_public_dict(p) for p in qs]
    return Response({'count': len(data), 'resultados': data})


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([PublicAnonThrottle])
def public_disponibilidad(request):
    fecha = _parse_date(request.GET.get('fecha') or request.GET.get('fecha_renta'))
    hora_inicio = _parse_time(request.GET.get('hora_inicio'))
    hora_fin = _parse_time(request.GET.get('hora_fin'))
    if not all([fecha, hora_inicio, hora_fin]):
        return Response(
            {'error': 'fecha, hora_inicio y hora_fin son requeridos.'},
            status=400,
        )
    tipos = request.GET.get('tipo', '')
    search = (request.GET.get('search') or '').strip()
    solo = str(request.GET.get('solo_disponibles', '1')).lower() in (
        '1', 'true', 'yes', 'si', 'sí',
    )
    data = productos_disponibles(
        fecha,
        hora_inicio,
        hora_fin,
        tipos=tipos,
        search=search,
        limit=50,
        solo_disponibles=solo,
    )
    for item in data:
        item.pop('search_tokens', None)
    return Response({'count': len(data), 'resultados': data})


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([PublicAnonThrottle])
def public_temporada(request):
    fecha = _parse_date(request.GET.get('fecha') or request.GET.get('fecha_renta'))
    if not fecha:
        return Response({'error': 'fecha requerida.'}, status=400)
    t = temporada_para_fecha(fecha)
    if not t:
        return Response({'temporada_alta': False})
    return Response({
        'temporada_alta': True,
        'nombre': t.nombre,
        'fecha_inicio': str(t.fecha_inicio),
        'fecha_fin': str(t.fecha_fin),
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PublicAnonThrottle])
def public_rentas_crear(request):
    """
    Crea renta desde el cotizador web.
    Body mínimo: cliente (nombre, telefono), dirección, fecha_renta, hora_inicio,
    hora_fin, productos: [{id|producto_id, cantidad}].
    """
    data = dict(request.data or {})
    # Normalizar contacto del formulario marketing
    if not data.get('cliente_nombre') and data.get('nombre'):
        data['cliente_nombre'] = data.get('nombre')
    if not data.get('cliente_telefono') and data.get('telefono'):
        data['cliente_telefono'] = data.get('telefono')
    if not data.get('cliente_telefono') and data.get('whatsapp'):
        data['cliente_telefono'] = data.get('whatsapp')

    notas = []
    if data.get('tipo_evento'):
        notas.append(f"Tipo evento: {data['tipo_evento']}")
    if data.get('sede') or data.get('ciudad'):
        notas.append(f"Sede: {data.get('sede') or data.get('ciudad')}")
    if data.get('invitados'):
        notas.append(f"Invitados: {data['invitados']}")
    if data.get('email') or data.get('correo'):
        notas.append(f"Email: {data.get('email') or data.get('correo')}")
    if data.get('paquete'):
        notas.append(f"Paquete web: {data['paquete']}")
    if data.get('notas'):
        notas.append(str(data['notas']))
    if notas:
        prev = (data.get('comentarios') or '').strip()
        data['comentarios'] = (prev + '\n' if prev else '') + ' | '.join(notas)

    if not data.get('calle_y_numero') and data.get('sede'):
        data['calle_y_numero'] = str(data['sede'])[:120]
    if not data.get('ciudad_o_municipio'):
        data['ciudad_o_municipio'] = str(data.get('ciudad') or data.get('sede') or 'Por confirmar')[:80]
    if not data.get('colonia'):
        data['colonia'] = 'Por confirmar'

    try:
        data['fecha_renta'] = _parse_date(data.get('fecha_renta'))
        data['hora_inicio'] = _parse_time(data.get('hora_inicio'))
        data['hora_fin'] = _parse_time(data.get('hora_fin'))
        if not all([data.get('fecha_renta'), data.get('hora_inicio'), data.get('hora_fin')]):
            return Response(
                {'error': 'fecha_renta, hora_inicio y hora_fin son requeridos.'},
                status=400,
            )
        result = crear_renta(data)
        mensaje = (
            f"Listo. Folio *{result.get('folio')}*. "
            'Te contactamos por WhatsApp el mismo día.'
        )
        if result.get('requiere_validacion_logistica'):
            mensaje = (
                f"Folio *{result.get('folio')}* registrado. "
                'Estás en temporada alta: un asesor confirmará logística pronto.'
            )
        result['mensaje'] = mensaje
        return Response(result, status=201)
    except RentaServiceError as exc:
        return Response({'error': exc.message}, status=exc.status)
    except Exception:
        logger.exception('public_rentas_crear falló')
        return Response({'error': 'No se pudo crear la solicitud.'}, status=500)


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([PublicAnonThrottle])
def public_contenido(request):
    from core.api.sitio_web_views import sitio_payload
    return Response(sitio_payload())
