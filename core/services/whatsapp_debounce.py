"""Debounce de inbound WhatsApp: agrupa mensajes y reenvía una vez a n8n."""
from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from core.models import WhatsAppMessageBuffer
from core.services.whatsapp_bot_pause import telefono_key

logger = logging.getLogger(__name__)


def debounce_seconds() -> int:
    try:
        return max(0, int(getattr(settings, 'WA_DEBOUNCE_SECONDS', 30) or 0))
    except (TypeError, ValueError):
        return 30


def clear_buffer(telefono: str) -> bool:
    """Elimina buffer pendiente (p. ej. humano intervino vía SMB echo)."""
    key = telefono_key(telefono)
    if not key:
        return False
    deleted, _ = WhatsAppMessageBuffer.objects.filter(telefono=key).delete()
    if deleted:
        logger.info('WA debounce: buffer cancelado %s', key)
    return bool(deleted)


def enqueue(
    telefono: str,
    texto: str,
    message_id: str = '',
    profile_name: str = '',
) -> WhatsAppMessageBuffer | None:
    """
    Encola un mensaje. process_after se fija solo en el primer mensaje del lote
    (ventana fija desde el primero).
    """
    key = telefono_key(telefono)
    if not key:
        return None
    body = (texto or '').strip()
    now = timezone.now()
    seconds = debounce_seconds()

    with transaction.atomic():
        row = (
            WhatsAppMessageBuffer.objects.select_for_update()
            .filter(telefono=key)
            .first()
        )
        if row is None:
            texts = [body] if body else []
            row = WhatsAppMessageBuffer.objects.create(
                telefono=key,
                textos=texts,
                profile_name=(profile_name or '')[:120],
                last_message_id=(message_id or '')[:120],
                process_after=now + timedelta(seconds=seconds),
            )
            logger.info(
                'WA debounce: nuevo buffer %s process_after=%s',
                key,
                row.process_after.isoformat(),
            )
            return row

        texts = list(row.textos or [])
        if body:
            texts.append(body)
        row.textos = texts
        if profile_name:
            row.profile_name = (profile_name or '')[:120]
        if message_id:
            row.last_message_id = (message_id or '')[:120]
        # No reiniciar process_after: ventana fija desde el primero
        row.save(update_fields=['textos', 'profile_name', 'last_message_id', 'updated_at'])
        logger.info('WA debounce: append buffer %s n=%s', key, len(texts))
        return row


def flush_due(limit: int = 50) -> int:
    """Reenvía a n8n los buffers vencidos. Devuelve cuántos se flushearon."""
    now = timezone.now()
    flushed = 0

    from core.services import whatsapp_bot_pause as bot_pause
    from core.services import whatsapp_meta as wa_meta
    from core.services import whatsapp_ycloud as wa_yc

    if wa_yc.configured():
        forward = wa_yc.forward_to_n8n
    else:
        forward = wa_meta.forward_to_n8n

    while flushed < limit:
        with transaction.atomic():
            row = (
                WhatsAppMessageBuffer.objects.select_for_update(skip_locked=True)
                .filter(process_after__lte=now)
                .order_by('process_after')
                .first()
            )
            if row is None:
                break
            telefono = row.telefono
            textos = list(row.textos or [])
            profile_name = row.profile_name or ''
            message_id = row.last_message_id or ''
            row.delete()

        # Humano ya tomó el chat: no mandar el lote encolado al bot
        if bot_pause.is_paused(telefono):
            logger.info('WA debounce: flush omitido (pausado) %s', telefono)
            flushed += 1
            continue

        body = '\n'.join(t for t in textos if t).strip()
        if not body:
            logger.info('WA debounce: buffer vacío descartado %s', telefono)
            flushed += 1
            continue
        try:
            forward(
                telefono,
                body,
                message_id=message_id or f'debounce_{telefono}',
                profile_name=profile_name,
            )
            flushed += 1
            logger.info('WA debounce: flush → n8n %s (%s msgs)', telefono, len(textos))
        except Exception:
            logger.exception('WA debounce: falló forward %s; reencolando', telefono)
            # Reponer buffer breve para reintento
            WhatsAppMessageBuffer.objects.update_or_create(
                telefono=telefono,
                defaults={
                    'textos': textos,
                    'profile_name': profile_name[:120],
                    'last_message_id': (message_id or '')[:120],
                    'process_after': timezone.now() + timedelta(seconds=15),
                },
            )
            break

    return flushed
