import os
import json
from pywebpush import webpush, WebPushException
from core.models import PushSuscripcion
import logging

logger = logging.getLogger(__name__)

VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')
VAPID_EMAIL = os.environ.get('VAPID_EMAIL', 'mailto:admin@trotacrm.com')


def get_vapid_private_key():
    """
    Si VAPID_PRIVATE_KEY es una ruta a archivo .pem, lee el contenido.
    Si es una clave directa, la devuelve tal cual.
    """
    key = VAPID_PRIVATE_KEY
    if key and os.path.isfile(key):
        with open(key, 'r') as f:
            return f.read()
    return key


def enviar_notificacion(user, titulo, cuerpo, url='/'):
    suscripciones = PushSuscripcion.objects.filter(user=user)
    eliminadas = []
    private_key = get_vapid_private_key()

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
                vapid_private_key=private_key,
                vapid_claims={'sub': VAPID_EMAIL},
            )
        except WebPushException as e:
            logger.warning(f"Push falló para {user.username}: {e}")
            if e.response and e.response.status_code in [404, 410]:
                eliminadas.append(sub.id)

    if eliminadas:
        PushSuscripcion.objects.filter(id__in=eliminadas).delete()


def enviar_notificacion_todos(usuarios, titulo, cuerpo, url='/'):
    for user in usuarios:
        enviar_notificacion(user, titulo, cuerpo, url)