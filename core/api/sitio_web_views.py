"""API CRM + helpers para contenido del sitio público."""
from __future__ import annotations

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from core.models import SitioWebContenido, SitioWebMedia
from core.services.sitio_web_defaults import (
    SITIO_MEDIA_CLAVES,
    SITIO_MEDIA_LABELS,
    default_sitio_datos,
)


def media_url(field) -> str | None:
    if not field:
        return None
    try:
        url = field.url
    except ValueError:
        return None
    if url.startswith('http://') or url.startswith('https://'):
        # Prefer path-only so apex and app share /media/
        from urllib.parse import urlparse
        return urlparse(url).path
    return url if url.startswith('/') else f'/{url.lstrip("/")}'


def sitio_payload() -> dict:
    obj = SitioWebContenido.get_solo()
    datos = obj.datos or default_sitio_datos()
    imagenes = {k: None for k in SITIO_MEDIA_CLAVES}
    for m in SitioWebMedia.objects.all():
        imagenes[m.clave] = media_url(m.imagen)
    return {
        'datos': datos,
        'imagenes': imagenes,
        'media_labels': SITIO_MEDIA_LABELS,
        'actualizado_en': obj.actualizado_en.isoformat() if obj.actualizado_en else None,
    }


@api_view(['GET', 'PUT'])
@permission_classes([IsAdminUser])
def crm_sitio_web(request):
    if request.method == 'GET':
        return Response(sitio_payload())

    body = request.data if isinstance(request.data, dict) else {}
    datos = body.get('datos')
    if not isinstance(datos, dict):
        return Response({'error': 'Se requiere el objeto "datos".'}, status=400)

    obj = SitioWebContenido.get_solo()
    obj.datos = datos
    obj.actualizado_por = request.user
    obj.save()
    return Response(sitio_payload())


@api_view(['POST'])
@permission_classes([IsAdminUser])
def crm_sitio_web_imagen(request):
    clave = (request.data.get('clave') or '').strip()
    if clave not in SITIO_MEDIA_CLAVES:
        return Response(
            {'error': f'Clave inválida. Usa una de: {", ".join(SITIO_MEDIA_CLAVES)}'},
            status=400,
        )
    archivo = request.FILES.get('imagen') or request.FILES.get('file')
    if not archivo:
        return Response({'error': 'Sube un archivo en el campo imagen.'}, status=400)

    media, _ = SitioWebMedia.objects.get_or_create(clave=clave)
    if media.imagen:
        media.imagen.delete(save=False)
    media.imagen = archivo
    media.save()
    return Response(sitio_payload())


@api_view(['DELETE'])
@permission_classes([IsAdminUser])
def crm_sitio_web_imagen_borrar(request, clave):
    if clave not in SITIO_MEDIA_CLAVES:
        return Response({'error': 'Clave inválida.'}, status=400)
    media = SitioWebMedia.objects.filter(clave=clave).first()
    if media:
        if media.imagen:
            media.imagen.delete(save=False)
        media.delete()
    return Response(sitio_payload())
