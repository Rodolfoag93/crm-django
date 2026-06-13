import os
import json
from pywebpush import webpush, WebPushException
from core.models import PushSuscripcion
import logging

logger = logging.getLogger(__name__)

VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')
VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_EMAIL = os.environ.get('VAPID_EMAIL', 'mailto:admin@trotacrm.com')


def enviar_notificacion(user, titulo, cuerpo, url='/'):
    """
    Envía una notificación push a todas las suscripciones activas de un usuario.
    """
    suscripciones = PushSuscripcion.objects.filter(user=user)
    eliminadas = []

    for sub in suscripciones:
        try:
            webpush(
                subscription_info={
                    'endpoint': sub.endpoint,
                    'keys': {
                        'p256dh': sub.p256dh,
                        'auth': sub.auth,
                    }
                },
                data=json.dumps({
                    'title': titulo,
                    'body': cuerpo,
                    'url': url,
                }),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={'sub': VAPID_EMAIL},
            )
        except WebPushException as e:
            logger.warning(f"Push falló para {user.username}: {e}")
            # Si el endpoint ya no es válido, eliminarlo
            if e.response and e.response.status_code in [404, 410]:
                eliminadas.append(sub.id)

    if eliminadas:
        PushSuscripcion.objects.filter(id__in=eliminadas).delete()


def enviar_notificacion_todos(usuarios, titulo, cuerpo, url='/'):
    """
    Envía notificación a una lista de usuarios.
    """
    for user in usuarios:
        enviar_notificacion(user, titulo, cuerpo, url)