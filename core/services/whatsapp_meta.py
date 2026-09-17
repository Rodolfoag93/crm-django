"""WhatsApp Cloud API (Meta) — webhook verify, ingress y envío."""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)


class WhatsAppMetaError(Exception):
    def __init__(self, message: str, status: int = 400):
        self.message = message
        self.status = status
        super().__init__(message)


def _cfg(key: str, default: str = '') -> str:
    return (os.environ.get(key) or getattr(settings, key, None) or default or '').strip()


def verify_token() -> str:
    return _cfg('META_WA_VERIFY_TOKEN', 'trota-wa-verify')


def access_token() -> str:
    return _cfg('META_WA_ACCESS_TOKEN')


def phone_number_id() -> str:
    return _cfg('META_WA_PHONE_NUMBER_ID')


def graph_version() -> str:
    return _cfg('META_WA_GRAPH_VERSION', 'v21.0')


def meta_configured() -> bool:
    return bool(access_token() and phone_number_id())


def n8n_ingress_url() -> str:
    return _cfg(
        'META_WA_N8N_FORWARD_URL',
        _cfg('TWILIO_WEBHOOK_URL', 'https://bot.app.trotacrm.com/webhook/whatsapp'),
    )


def check_verify_token(mode: str, token: str, challenge: str) -> str | None:
    """Devuelve el challenge si la verificación es válida; si no, None."""
    if mode != 'subscribe':
        return None
    if not token or token != verify_token():
        return None
    return challenge or None


def _normalize_wa_to(telefono: str) -> str:
    digits = ''.join(c for c in str(telefono or '') if c.isdigit())
    if not digits:
        raise WhatsAppMetaError('Teléfono vacío.')
    if len(digits) == 10:
        digits = '52' + digits
    # WhatsApp MX móvil a veces usa 521; si ya trae 52 y 11+ dígitos, dejarlo
    return digits


def send_text(telefono: str, mensaje: str) -> dict:
    """Envía texto por Cloud API. Requiere META_WA_ACCESS_TOKEN + PHONE_NUMBER_ID."""
    if not meta_configured():
        raise WhatsAppMetaError(
            'Meta WhatsApp no configurado (META_WA_ACCESS_TOKEN / META_WA_PHONE_NUMBER_ID).',
            status=503,
        )
    body_text = (mensaje or '').strip()
    if not body_text:
        raise WhatsAppMetaError('Mensaje vacío.')
    to = _normalize_wa_to(telefono)
    url = f'https://graph.facebook.com/{graph_version()}/{phone_number_id()}/messages'
    payload = {
        'messaging_product': 'whatsapp',
        'to': to,
        'type': 'text',
        'text': {'preview_url': False, 'body': body_text[:4096]},
    }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            'Authorization': f'Bearer {access_token()}',
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
        logger.error('Meta WA send HTTP %s: %s', exc.code, err[:500])
        raise WhatsAppMetaError(f'Meta Graph API: {err[:300]}', status=400) from exc
    except urllib.error.URLError as exc:
        raise WhatsAppMetaError('No se pudo conectar con Meta Graph API.', status=503) from exc


def extract_inbound_messages(payload: dict) -> list[dict]:
    """Normaliza webhooks Meta a lista de {telefono, texto, message_id, profile_name}."""
    out: list[dict] = []
    for entry in payload.get('entry') or []:
        for change in entry.get('changes') or []:
            value = change.get('value') or {}
            contacts = {c.get('wa_id'): c for c in (value.get('contacts') or []) if isinstance(c, dict)}
            for msg in value.get('messages') or []:
                if not isinstance(msg, dict):
                    continue
                wa_id = str(msg.get('from') or '')
                contact = contacts.get(wa_id) or {}
                profile = (contact.get('profile') or {}).get('name') or ''
                tipo = msg.get('type') or 'text'
                texto = ''
                latitude = None
                longitude = None
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
                elif tipo == 'order':
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
                    # imagen/audio/etc: marcar para que el bot pueda handoff
                    texto = f'[{tipo}]'
                out.append({
                    'telefono': wa_id,
                    'texto': texto,
                    'message_id': str(msg.get('id') or ''),
                    'profile_name': profile,
                    'type': tipo,
                    'latitude': latitude,
                    'longitude': longitude,
                })
    return out


def forward_to_n8n(
    telefono: str,
    texto: str,
    message_id: str = '',
    profile_name: str = '',
    media_url: str = '',
    media_type: str = '',
) -> None:
    """Reenvía al webhook n8n existente (formato Twilio form) para reutilizar W1/W2."""
    url = n8n_ingress_url()
    if not url:
        logger.warning('META_WA: sin URL de forward a n8n')
        return
    digits = ''.join(c for c in telefono if c.isdigit())
    fields = {
        'From': f'whatsapp:+{digits}',
        'To': f'whatsapp:+{_cfg("META_WA_DISPLAY_NUMBER", "523121529952")}',
        'Body': texto or '',
        'MessageSid': message_id or f'meta_{digits}',
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
        logger.exception('META_WA forward n8n failed: %s', exc)
        raise WhatsAppMetaError(f'No se pudo reenviar a n8n: {exc}', status=502) from exc
