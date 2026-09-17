"""Pausa del bot WhatsApp cuando un humano escribe desde la app Business (SMB echoes)."""
from __future__ import annotations

import re
from datetime import timedelta

from django.utils import timezone

from core.models import WhatsAppBotPause


def telefono_key(telefono: str) -> str:
    digits = ''.join(c for c in str(telefono or '') if c.isdigit())
    return digits[-10:] if len(digits) >= 10 else digits


RESUME_RE = re.compile(
    r'^(menu|menú|cancelar|cancel|inicio|bot|automatico|automático)$',
    re.I,
)


def pause_bot(telefono: str, reason: str = 'smb_echo', hours: int = 48) -> None:
    key = telefono_key(telefono)
    if not key:
        return
    WhatsAppBotPause.objects.update_or_create(
        telefono=key,
        defaults={
            'reason': (reason or 'smb_echo')[:40],
            'expires_at': timezone.now() + timedelta(hours=hours),
        },
    )


def resume_bot(telefono: str) -> None:
    key = telefono_key(telefono)
    if not key:
        return
    WhatsAppBotPause.objects.filter(telefono=key).delete()


def is_paused(telefono: str) -> bool:
    key = telefono_key(telefono)
    if not key:
        return False
    row = WhatsAppBotPause.objects.filter(telefono=key).first()
    if not row:
        return False
    if row.expires_at and row.expires_at < timezone.now():
        row.delete()
        return False
    return True


def should_resume_from_text(texto: str) -> bool:
    t = (texto or '').strip()
    if not t:
        return False
    norm = (
        t.lower()
        .replace('á', 'a')
        .replace('é', 'e')
        .replace('í', 'i')
        .replace('ó', 'o')
        .replace('ú', 'u')
    )
    return bool(RESUME_RE.match(norm) or RESUME_RE.match(t))
