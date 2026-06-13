import os
import json
from datetime import datetime, timedelta
from google.oauth2 import service_account
from googleapiclient.discovery import build
import logging

logger = logging.getLogger(__name__)

SCOPES = ['https://www.googleapis.com/auth/calendar']
CREDENTIALS_FILE = os.environ.get('GOOGLE_CREDENTIALS_FILE', '')
CALENDAR_ID = os.environ.get('GOOGLE_CALENDAR_ID', '')


def get_calendar_service():
    if not CREDENTIALS_FILE or not os.path.exists(CREDENTIALS_FILE):
        logger.warning('Google credentials file not found')
        return None
    try:
        credentials = service_account.Credentials.from_service_account_file(
            CREDENTIALS_FILE, scopes=SCOPES
        )
        return build('calendar', 'v3', credentials=credentials)
    except Exception as e:
        logger.error(f'Error connecting to Google Calendar: {e}')
        return None


def crear_evento_renta(renta):
    """Crea o actualiza un evento en Google Calendar para una renta."""
    service = get_calendar_service()
    if not service or not CALENDAR_ID:
        return None

    try:
        fecha = str(renta.fecha_renta)
        hora_inicio = renta.hora_inicio or '09:00:00'
        hora_fin = renta.hora_fin or '23:00:00'

        # Construir descripción
        productos = renta.rentaproductos.select_related('producto').all()
        lista_productos = '\n'.join([f"  • {rp.cantidad}x {rp.producto.nombre}" for rp in productos])

        descripcion = f"""Cliente: {renta.cliente.nombre}
Teléfono: {renta.cliente.telefono}
Folio: {renta.folio}
Dirección: {renta.calle_y_numero}, {renta.colonia}, {renta.ciudad_o_municipio}

Productos:
{lista_productos}

Total: ${renta.precio_total}
Pagado: {'Sí' if renta.pagado else 'No'}"""

        evento = {
            'summary': f"🎉 {renta.cliente.nombre} - {renta.folio}",
            'description': descripcion,
            'start': {
                'dateTime': f"{fecha}T{hora_inicio}",
                'timeZone': 'America/Mexico_City',
            },
            'end': {
                'dateTime': f"{fecha}T{hora_fin}",
                'timeZone': 'America/Mexico_City',
            },
            'colorId': '2' if renta.pagado else '11',  # Verde si pagado, rojo si no
        }

        # Si ya tiene evento_google_id, actualizar; si no, crear
        if hasattr(renta, 'evento_google_id') and renta.evento_google_id:
            try:
                result = service.events().update(
                    calendarId=CALENDAR_ID,
                    eventId=renta.evento_google_id,
                    body=evento
                ).execute()
                return result.get('id')
            except Exception:
                # Si no se puede actualizar, crear nuevo
                pass

        result = service.events().insert(
            calendarId=CALENDAR_ID,
            body=evento
        ).execute()
        return result.get('id')

    except Exception as e:
        logger.error(f'Error creando evento en Google Calendar: {e}')
        return None


def eliminar_evento_renta(evento_id):
    """Elimina un evento de Google Calendar."""
    service = get_calendar_service()
    if not service or not CALENDAR_ID or not evento_id:
        return

    try:
        service.events().delete(
            calendarId=CALENDAR_ID,
            eventId=evento_id
        ).execute()
    except Exception as e:
        logger.error(f'Error eliminando evento de Google Calendar: {e}')