"""Extracción de intención/slots de mensajes de WhatsApp vía Claude (Anthropic).

Fase 1 del bot: reduce el menú rígido dejando que el cliente escriba en texto
libre. Si Anthropic falla, tarda o responde algo no parseable, SIEMPRE se
devuelve la respuesta vacía (todo en null) para que el router de n8n caiga al
menú de siempre — nunca debe tumbar el webhook.
"""
from __future__ import annotations

import json
import logging
import os
import re

from django.conf import settings
from django.utils import timezone

try:
    import anthropic
except ImportError:
    anthropic = None

logger = logging.getLogger(__name__)

INTENCIONES = ('cotizar', 'pedidos', 'animacion', 'eventos', 'asesor')
CONFIANZAS = ('alta', 'media', 'baja')

_FECHA_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
_HORA_RE = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')

TOOL_NAME = 'extraer_intencion_whatsapp'

TOOL_SCHEMA = {
    'name': TOOL_NAME,
    'description': (
        'Extrae la intención del cliente y, si están presentes en el mensaje, '
        'la fecha, hora y dirección del evento/renta. No inventes datos que el '
        'cliente no mencionó explícita o implícitamente.'
    ),
    'input_schema': {
        'type': 'object',
        'properties': {
            'intencion': {
                'type': ['string', 'null'],
                'enum': [*INTENCIONES, None],
                'description': (
                    'Qué quiere el cliente: cotizar (rentar mobiliario/carpas/mesas), '
                    'pedidos (dar seguimiento a una renta/pedido existente), '
                    'animacion (payasos, shows, animadores), eventos (organización '
                    'de un evento completo), asesor (quiere hablar con una persona), '
                    'o null si no es identificable con el mensaje dado.'
                ),
            },
            'fecha_renta': {
                'type': ['string', 'null'],
                'description': (
                    'Fecha del evento en formato YYYY-MM-DD, resuelta contra la fecha '
                    'de hoy (dada en el prompt) si el cliente usó una referencia '
                    'relativa ("mañana", "el sábado"). null si no se menciona.'
                ),
            },
            'hora_inicio': {
                'type': ['string', 'null'],
                'description': (
                    'Hora de inicio en formato HH:MM (24h) SOLO si es precisa. '
                    'null si no se menciona o si es una franja imprecisa como "en la tarde".'
                ),
            },
            'hora_fin': {
                'type': ['string', 'null'],
                'description': (
                    'Hora de fin en formato HH:MM (24h) SOLO si es precisa. '
                    'null si no se menciona o si es una franja imprecisa.'
                ),
            },
            'franja_horaria_texto': {
                'type': ['string', 'null'],
                'description': (
                    'Franja horaria tal como la dijo el cliente (ej. "en la tarde", '
                    '"por la noche") cuando no da una hora exacta. null si no aplica.'
                ),
            },
            'direccion_texto': {
                'type': ['string', 'null'],
                'description': 'Dirección tal como la escribió el cliente, sin estructurar. null si no se menciona.',
            },
            'confianza': {
                'type': 'string',
                'enum': list(CONFIANZAS),
                'description': 'Qué tan seguro estás de la extracción en conjunto.',
            },
        },
        'required': [
            'intencion', 'fecha_renta', 'hora_inicio', 'hora_fin',
            'franja_horaria_texto', 'direccion_texto', 'confianza',
        ],
    },
}


def _cfg(key: str, default: str = '') -> str:
    return (os.environ.get(key) or getattr(settings, key, None) or default or '').strip()


def api_key() -> str:
    return _cfg('ANTHROPIC_API_KEY')


def model() -> str:
    return _cfg('ANTHROPIC_MODEL', 'claude-sonnet-5')


def timeout_s() -> float:
    try:
        return float(getattr(settings, 'ANTHROPIC_TIMEOUT_S', 8) or 8)
    except (TypeError, ValueError):
        return 8.0


def configured() -> bool:
    return bool(api_key() and anthropic is not None)


def _respuesta_vacia() -> dict:
    return {
        'intencion': None,
        'fecha_renta': None,
        'hora_inicio': None,
        'hora_fin': None,
        'franja_horaria_texto': None,
        'direccion_texto': None,
        'confianza': None,
    }


def _sanitizar(data) -> dict:
    """Nunca confiar ciegamente en lo que devuelve el modelo: validar forma y enums."""
    out = _respuesta_vacia()
    if not isinstance(data, dict):
        return out

    if data.get('intencion') in INTENCIONES:
        out['intencion'] = data['intencion']

    fecha = data.get('fecha_renta')
    if isinstance(fecha, str) and _FECHA_RE.match(fecha):
        out['fecha_renta'] = fecha

    hora_inicio = data.get('hora_inicio')
    if isinstance(hora_inicio, str) and _HORA_RE.match(hora_inicio):
        out['hora_inicio'] = hora_inicio

    hora_fin = data.get('hora_fin')
    if isinstance(hora_fin, str) and _HORA_RE.match(hora_fin):
        out['hora_fin'] = hora_fin

    franja = data.get('franja_horaria_texto')
    if isinstance(franja, str) and franja.strip():
        out['franja_horaria_texto'] = franja.strip()[:120]

    direccion = data.get('direccion_texto')
    if isinstance(direccion, str) and direccion.strip():
        out['direccion_texto'] = direccion.strip()[:500]

    if data.get('confianza') in CONFIANZAS:
        out['confianza'] = data['confianza']

    return out


def extraer_intencion(
    texto: str,
    estado_actual: str = '',
    campos_faltantes: list | None = None,
    contexto_previo: dict | None = None,
) -> dict:
    """
    Extrae intención + slots de un mensaje de WhatsApp usando Claude (tool use).
    Nunca lanza excepción: ante cualquier falla devuelve la respuesta vacía
    (todos los campos en null) para que el router de n8n caiga al menú de siempre.
    """
    texto = (texto or '').strip()
    if not texto:
        return _respuesta_vacia()
    if not configured():
        logger.info('Anthropic no configurado (ANTHROPIC_API_KEY/paquete); fallback intención null.')
        return _respuesta_vacia()

    hoy = timezone.localdate().isoformat()
    campos_faltantes = campos_faltantes or []
    contexto_previo = contexto_previo or {}

    system_prompt = (
        'Eres el módulo de extracción de intención del bot de WhatsApp de '
        'Trotamundos, una empresa de renta de mobiliario y organización de '
        'eventos en México. Analiza el mensaje del cliente y llama a la '
        f'herramienta "{TOOL_NAME}" con lo que puedas identificar de forma '
        f'clara. La fecha de hoy es {hoy} (zona horaria de México). '
        'No inventes datos: si algo no está claro en el mensaje, usa null. '
        'No extraigas productos, cantidades ni precios — eso lo maneja otro '
        'sistema aparte.'
    )
    user_prompt = (
        f'Mensaje del cliente: "{texto}"\n'
        f'Estado actual de la conversación: {estado_actual or "(sin estado)"}\n'
        f'Campos que el flujo todavía necesita: {json.dumps(campos_faltantes, ensure_ascii=False)}\n'
        f'Contexto ya conocido de la sesión: {json.dumps(contexto_previo, ensure_ascii=False)}'
    )

    try:
        client = anthropic.Anthropic(api_key=api_key(), timeout=timeout_s())
        resp = client.messages.create(
            model=model(),
            max_tokens=512,
            system=system_prompt,
            messages=[{'role': 'user', 'content': user_prompt}],
            tools=[TOOL_SCHEMA],
            tool_choice={'type': 'tool', 'name': TOOL_NAME},
        )
        tool_use = next((b for b in resp.content if getattr(b, 'type', None) == 'tool_use'), None)
        if tool_use is None:
            logger.warning('Anthropic no devolvió tool_use para extracción de intención.')
            return _respuesta_vacia()
        resultado = _sanitizar(tool_use.input)
    except Exception:
        logger.exception('Falló extracción de intención vía Anthropic; fallback intención null.')
        return _respuesta_vacia()

    if resultado['confianza'] == 'baja' or resultado['intencion'] is None:
        logger.info(
            'Extracción de intención confianza=%s intencion=%s texto=%r',
            resultado['confianza'], resultado['intencion'], texto[:200],
        )
    return resultado
