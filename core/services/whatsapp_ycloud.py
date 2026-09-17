"""WhatsApp vía YCloud (BSP) — webhooks e envío API v2."""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings
from django.core import signing

logger = logging.getLogger(__name__)


class YCloudError(Exception):
    def __init__(self, message: str, status: int = 400):
        self.message = message
        self.status = status
        super().__init__(message)


def _cfg(key: str, default: str = '') -> str:
    return (os.environ.get(key) or getattr(settings, key, None) or default or '').strip()


def api_key() -> str:
    return _cfg('YCLOUD_API_KEY') or _cfg('META_WA_ACCESS_TOKEN')


def from_number() -> str:
    """E.164 del número de negocio (+5213121529952)."""
    raw = _cfg('YCLOUD_FROM_NUMBER') or _cfg('META_WA_DISPLAY_NUMBER') or '5213121529952'
    digits = ''.join(c for c in raw if c.isdigit())
    return f'+{digits}' if digits else ''


def api_base() -> str:
    return _cfg('YCLOUD_API_BASE', 'https://api.ycloud.com/v2').rstrip('/')


def configured() -> bool:
    return bool(api_key() and from_number())


def _public_base_url() -> str:
    return _cfg('PUBLIC_BASE_URL', 'https://app.trotacrm.com').rstrip('/')


MEDIA_PROXY_SALT = 'wa-media-proxy'


def _media_proxy_max_age_s() -> int:
    try:
        horas = int(getattr(settings, 'WA_MEDIA_PROXY_MAX_AGE_HOURS', 168) or 168)
    except (TypeError, ValueError):
        horas = 168
    return max(1, horas) * 3600


def build_media_proxy_url(media_url: str) -> str:
    """
    Envuelve un link de media de YCloud (requiere X-API-Key) en un link propio
    con token firmado, para que un humano (asesor) pueda abrirlo desde WhatsApp
    sin necesitar la key. Ver bot_media_proxy en core/api/bot_views.py.
    """
    if not media_url:
        return ''
    token = signing.dumps(media_url, salt=MEDIA_PROXY_SALT)
    return f'{_public_base_url()}/v1/bot/media-proxy/?t={urllib.parse.quote(token)}'


def resolve_media_proxy_token(token: str) -> str:
    """Valida firma + expiración + allowlist de host. Devuelve el link real de YCloud."""
    try:
        media_url = signing.loads(token or '', salt=MEDIA_PROXY_SALT, max_age=_media_proxy_max_age_s())
    except signing.BadSignature as exc:
        raise YCloudError('Link inválido o expirado.', status=404) from exc
    host = (urllib.parse.urlparse(media_url).hostname or '').lower()
    allowed_host = (urllib.parse.urlparse(api_base()).hostname or '').lower()
    if not host or not allowed_host or host != allowed_host:
        raise YCloudError('Link inválido.', status=404)
    return media_url


def fetch_media_stream(media_url: str):
    """
    Descarga el binario desde YCloud con X-API-Key server-side, EN STREAMING
    (no carga el archivo completo en memoria — importante si algún día llega
    un video/documento pesado). Devuelve (iterador_de_chunks, content_type,
    content_length_o_None). El caller debe agotar el iterador (cierra la
    conexión al terminar, incluso si se corta a medias).
    """
    req = urllib.request.Request(
        media_url,
        headers={'X-API-Key': api_key()},
        method='GET',
    )
    try:
        resp = urllib.request.urlopen(req, timeout=20)
    except urllib.error.HTTPError as exc:
        logger.error('YCloud media fetch HTTP %s: %s', exc.code, media_url)
        raise YCloudError('No se pudo descargar el archivo.', status=502) from exc
    except urllib.error.URLError as exc:
        raise YCloudError('No se pudo conectar con YCloud.', status=503) from exc

    content_type = resp.headers.get('Content-Type') or 'application/octet-stream'
    content_length = resp.headers.get('Content-Length')

    def _chunks():
        try:
            while True:
                chunk = resp.read(64 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            resp.close()

    return _chunks(), content_type, content_length


def n8n_ingress_url() -> str:
    return _cfg(
        'META_WA_N8N_FORWARD_URL',
        'https://bot.app.trotacrm.com/webhook/whatsapp',
    )


def _e164(telefono: str) -> str:
    digits = ''.join(c for c in str(telefono or '') if c.isdigit())
    if not digits:
        raise YCloudError('Teléfono vacío.')
    if len(digits) == 10:
        digits = '521' + digits  # MX móvil WhatsApp suele ir con 521
    elif digits.startswith('52') and len(digits) == 12 and digits[2] != '1':
        # 52 + 10 dígitos sin el 1 → anteponer 1 tras 52
        digits = '521' + digits[2:]
    return f'+{digits}'


def send_text(telefono: str, mensaje: str) -> dict:
    if not configured():
        raise YCloudError('YCloud no configurado (YCLOUD_API_KEY / YCLOUD_FROM_NUMBER).', status=503)
    body_text = (mensaje or '').strip()
    if not body_text:
        raise YCloudError('Mensaje vacío.')
    payload = {
        'from': from_number(),
        'to': _e164(telefono),
        'type': 'text',
        'text': {'body': body_text[:4096]},
    }
    url = f'{api_base()}/whatsapp/messages'
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            'X-API-Key': api_key(),
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode('utf-8') or '{}'
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        err = exc.read().decode('utf-8', errors='replace')
        logger.error('YCloud send HTTP %s: %s', exc.code, err[:500])
        raise YCloudError(f'YCloud: {err[:300]}', status=400) from exc
    except urllib.error.URLError as exc:
        raise YCloudError('No se pudo conectar con YCloud.', status=503) from exc


def extract_inbound(payload: dict) -> list[dict]:
    """whatsapp.inbound_message.received → lista {telefono, texto, message_id, profile_name}."""
    if not isinstance(payload, dict):
        return []
    etype = str(payload.get('type') or '')
    if etype != 'whatsapp.inbound_message.received':
        return []
    msg = payload.get('whatsappInboundMessage') or {}
    if not isinstance(msg, dict):
        return []
    from_raw = str(msg.get('from') or '')
    telefono = ''.join(c for c in from_raw if c.isdigit())
    tipo = msg.get('type') or 'text'
    texto = ''
    latitude = None
    longitude = None
    media_url = ''
    media_type = ''
    if tipo == 'text':
        texto = ((msg.get('text') or {}).get('body') or '').strip()
    elif tipo == 'button':
        texto = ((msg.get('button') or {}).get('text') or '').strip()
    elif tipo == 'interactive':
        inter = msg.get('interactive') or {}
        if inter.get('type') == 'button_reply':
            texto = ((inter.get('button_reply') or {}).get('title') or '').strip()
        elif inter.get('type') == 'list_reply':
            texto = ((inter.get('list_reply') or {}).get('title') or '').strip()
    elif tipo == 'location':
        loc = msg.get('location') or {}
        try:
            latitude = float(loc.get('latitude'))
            longitude = float(loc.get('longitude'))
            texto = f'[location|{latitude}|{longitude}]'
        except (TypeError, ValueError):
            texto = '[location]'
    elif tipo in ('image', 'video', 'document', 'sticker'):
        media_obj = msg.get(tipo) or {}
        media_url = str(media_obj.get('link') or '')
        media_type = str(media_obj.get('mime_type') or '')
        texto = str(media_obj.get('caption') or '').strip()
    elif tipo == 'order':
        # Pedido desde catálogo WhatsApp (product_retailer_id, no nombre)
        order = msg.get('order') or {}
        items = order.get('product_items') or []
        parts = []
        for it in items:
            if not isinstance(it, dict):
                continue
            rid = str(it.get('product_retailer_id') or '').strip()
            if not rid:
                continue
            try:
                qty = int(it.get('quantity') or 1)
            except (TypeError, ValueError):
                qty = 1
            parts.append(f'{rid}x{qty}' if qty != 1 else rid)
        note = str(order.get('text') or '').strip()
        ids_part = ','.join(parts) if parts else 'sin-sku'
        texto = f'[order|{ids_part}' + (f'|{note}' if note else '') + ']'
    else:
        texto = f'[{tipo}]'
    profile = ((msg.get('customerProfile') or {}).get('name') or '')
    return [{
        'telefono': telefono,
        'texto': texto,
        'message_id': str(msg.get('id') or ''),
        'profile_name': profile,
        'type': tipo,
        'latitude': latitude,
        'longitude': longitude,
        'media_url': media_url,
        'media_type': media_type,
    }]


def extract_smb_echoes(payload: dict) -> list[dict]:
    """
    whatsapp.smb.message.echoes → mensajes enviados desde la app Business al cliente.
    Usamos el `to` (cliente) para pausar el bot en ese chat.
    """
    if not isinstance(payload, dict):
        return []
    if str(payload.get('type') or '') != 'whatsapp.smb.message.echoes':
        return []
    # YCloud suele mandar whatsappMessage; tolerar variantes
    msg = payload.get('whatsappMessage') or payload.get('whatsappSmbMessage') or payload.get('data') or {}
    if isinstance(msg, list) and msg:
        msg = msg[0]
    if not isinstance(msg, dict):
        return []
    to_raw = str(msg.get('to') or msg.get('recipient') or '')
    telefono = ''.join(c for c in to_raw if c.isdigit())
    if not telefono:
        return []
    texto = ''
    if (msg.get('type') or '') == 'text':
        texto = ((msg.get('text') or {}).get('body') or '').strip()
    return [{
        'telefono': telefono,
        'texto': texto,
        'message_id': str(msg.get('id') or msg.get('wamid') or ''),
        'from_business': ''.join(c for c in str(msg.get('from') or '') if c.isdigit()),
    }]


def is_ycloud_payload(payload: dict) -> bool:
    if not isinstance(payload, dict):
        return False
    t = str(payload.get('type') or '')
    return t.startswith('whatsapp.') or 'whatsappInboundMessage' in payload


def forward_to_n8n(
    telefono: str,
    texto: str,
    message_id: str = '',
    profile_name: str = '',
    media_url: str = '',
    media_type: str = '',
) -> None:
    url = n8n_ingress_url()
    if not url:
        return
    digits = ''.join(c for c in telefono if c.isdigit())
    fields = {
        'From': f'whatsapp:+{digits}',
        'To': f'whatsapp:{from_number()}',
        'Body': texto or '',
        'MessageSid': message_id or f'ycloud_{digits}',
        'ProfileName': profile_name or '',
        'NumMedia': '1' if media_url else '0',
    }
    if media_url:
        fields['MediaUrl0'] = media_url
        fields['MediaContentType0'] = media_type or 'application/octet-stream'
    form = urllib.parse.urlencode(fields).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=form,
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
    except Exception as exc:
        logger.exception('YCloud forward n8n failed: %s', exc)
        raise YCloudError(f'No se pudo reenviar a n8n: {exc}', status=502) from exc
