"""Temporada alta y validación logística de rentas."""

from datetime import date, datetime

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from core.models import Renta, TemporadaAlta
from core.services.rentas import RentaServiceError, cancelar_renta


def _as_date(valor) -> date:
    if isinstance(valor, date) and not isinstance(valor, datetime):
        return valor
    if isinstance(valor, datetime):
        return valor.date()
    return date.fromisoformat(str(valor)[:10])


def temporada_para_fecha(fecha) -> TemporadaAlta | None:
    d = _as_date(fecha)
    return (
        TemporadaAlta.objects.filter(
            activo=True,
            fecha_inicio__lte=d,
            fecha_fin__gte=d,
        )
        .order_by('-fecha_inicio')
        .first()
    )


def aplicar_temporada_alta_a_renta(renta: Renta) -> TemporadaAlta | None:
    temporada = temporada_para_fecha(renta.fecha_renta)
    if temporada:
        renta.validacion_logistica = 'PENDIENTE'
        renta.temporada_alta = temporada
        renta.save(update_fields=['validacion_logistica', 'temporada_alta'])
    else:
        renta.validacion_logistica = 'NO_REQUIERE'
        renta.temporada_alta = None
        renta.save(update_fields=['validacion_logistica', 'temporada_alta'])
    return temporada


def aprobar_validacion_logistica(renta: Renta, *, actor: str = '') -> dict:
    if renta.status == 'CANCELADO':
        raise RentaServiceError('La renta está cancelada.')
    if renta.validacion_logistica == 'APROBADA':
        return _payload(renta, ya='ya estaba aprobada')
    if renta.validacion_logistica == 'RECHAZADA':
        raise RentaServiceError('La renta ya fue rechazada (stock liberado).')
    if renta.validacion_logistica not in ('PENDIENTE', 'NO_REQUIERE'):
        raise RentaServiceError('Estado de validación inválido.')

    with transaction.atomic():
        renta.validacion_logistica = 'APROBADA'
        nota = f"Validación logística APROBADA ({actor or 'sistema'}) {timezone.localtime().strftime('%Y-%m-%d %H:%M')}"
        renta.comentarios = ((renta.comentarios or '') + '\n' + nota).strip()
        renta.save(update_fields=['validacion_logistica', 'comentarios'])

    result = _payload(renta, decision='aprobada')
    _notify_cliente(
        renta,
        [
            f'✅ ¡Buenas noticias! Tu pedido *{renta.folio}* ya quedó *confirmado* por logística.',
            f'Fecha: {renta.fecha_renta}',
            'Si necesitas algo más, escribe *MENU*.',
        ],
    )
    return result


def rechazar_validacion_logistica(renta: Renta, motivo: str = '', *, actor: str = '') -> dict:
    """Rechaza logística y cancela la renta → libera stock (solo ACTIVO cuenta)."""
    if renta.status == 'CANCELADO' or renta.validacion_logistica == 'RECHAZADA':
        return _payload(renta, ya='ya estaba rechazada/cancelada')
    if renta.validacion_logistica == 'APROBADA':
        raise RentaServiceError('Ya estaba aprobada; cancela desde el CRM si aplica.')

    motivo_final = (motivo or 'Sin disponibilidad logística (repartidores/camionetas) en temporada alta').strip()
    with transaction.atomic():
        renta.validacion_logistica = 'RECHAZADA'
        renta.save(update_fields=['validacion_logistica'])
        cancelar_renta(
            renta,
            f'Rechazo logística ({actor or "sistema"}): {motivo_final}',
        )

    result = _payload(renta, decision='rechazada')
    result['status'] = 'CANCELADO'
    _notify_cliente(
        renta,
        [
            f'Lamentablemente no pudimos confirmar el pedido *{renta.folio}* por logística en temporada alta.',
            'El folio quedó liberado. Con gusto te ayudamos a cotizar otra fecha: escribe *MENU* y elige *1*.',
            f'Motivo: {motivo_final}',
        ],
    )
    return result


def _payload(renta: Renta, **extra) -> dict:
    temporada = renta.temporada_alta.nombre if renta.temporada_alta_id else None
    return {
        'ok': True,
        'folio': renta.folio,
        'renta_id': renta.id,
        'validacion_logistica': renta.validacion_logistica,
        'temporada': temporada,
        'telefono_cliente': renta.cliente.telefono if renta.cliente_id else None,
        'cliente': renta.cliente.nombre if renta.cliente_id else None,
        'fecha_renta': str(renta.fecha_renta),
        **extra,
    }


def _notify_cliente(renta: Renta, lineas: list[str]) -> None:
    """Best-effort: avisa al cliente vía webhook n8n (Twilio)."""
    telefono = (renta.cliente.telefono if renta.cliente_id else '') or ''
    if not telefono:
        return
    url = getattr(settings, 'BOT_NOTIFY_WEBHOOK_URL', '') or ''
    if not url:
        return
    try:
        import json
        import urllib.request

        body = json.dumps({
            'telefono': telefono,
            'mensaje_whatsapp': '\n'.join(lineas),
        }).encode('utf-8')
        req = urllib.request.Request(
            url,
            data=body,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        urllib.request.urlopen(req, timeout=8)
    except Exception:
        pass
