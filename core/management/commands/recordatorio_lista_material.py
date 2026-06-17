from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import date, timedelta
from core.models import AsignacionCoordinador, ListaMaterialEvento
from core.push_notifications import enviar_notificacion


class Command(BaseCommand):
    help = 'Envía recordatorios a coordinadores que no han enviado su lista de material'

    def add_arguments(self, parser):
        parser.add_argument(
            'modo',
            choices=['diario', 'horario'],
            help='diario: recordatorio 7 y 4 días antes | horario: recordatorio cada hora el día anterior'
        )

    def handle(self, *args, **options):
        modo = options['modo']
        hoy = date.today()

        # Buscar asignaciones sin lista enviada con evento futuro
        asignaciones = AsignacionCoordinador.objects.select_related(
            'renta', 'renta__cliente', 'coordinador'
        ).filter(
            renta__fecha_renta__gt=hoy,
            renta__status='ACTIVO',
        )

        # Excluir las que ya tienen lista enviada o en estado avanzado
        estados_ok = ['ENVIADA', 'SURTIDA', 'EN_EVENTO', 'REGRESADA', 'REVISADA', 'RECIBIDA', 'PREPARADA']
        asignaciones_sin_lista = []

        for a in asignaciones:
            try:
                lista = ListaMaterialEvento.objects.get(asignacion=a)
                if lista.estado not in estados_ok:
                    asignaciones_sin_lista.append(a)
            except ListaMaterialEvento.DoesNotExist:
                asignaciones_sin_lista.append(a)

        enviados = 0

        for a in asignaciones_sin_lista:
            dias_restantes = (a.renta.fecha_renta - hoy).days
            coordinador = a.coordinador
            cliente = a.renta.cliente.nombre
            fecha = a.renta.fecha_renta.strftime('%d/%m/%Y')

            if modo == 'diario':
                # 7 días antes — un recordatorio
                if dias_restantes == 7:
                    enviar_notificacion(
                        coordinador,
                        '📋 Lista de material pendiente',
                        f'Faltan 7 días para el evento de {cliente} ({fecha}). ¡No olvides hacer tu lista de material!',
                        '/coordinador'
                    )
                    enviados += 1

                # 4, 3, 2 días antes — recordatorio diario
                elif 2 <= dias_restantes <= 4:
                    enviar_notificacion(
                        coordinador,
                        f'⚠️ Faltan {dias_restantes} días — Lista pendiente',
                        f'El evento de {cliente} es el {fecha} y aún no has enviado tu lista de material.',
                        '/coordinador'
                    )
                    enviados += 1

            elif modo == 'horario':
                # Solo el día anterior
                if dias_restantes == 1:
                    hora_actual = timezone.now().hour  # UTC
                    # Solo entre 14:00 y 02:00 UTC (8am-8pm México)
                    if 14 <= hora_actual <= 23 or hora_actual == 0:
                        enviar_notificacion(
                            coordinador,
                            '🚨 ¡Último día! Lista de material urgente',
                            f'El evento de {cliente} es MAÑANA ({fecha}) y no has enviado tu lista. ¡Hazlo ahora!',
                            '/coordinador'
                        )
                        enviados += 1

        self.stdout.write(f'Recordatorios enviados: {enviados}')