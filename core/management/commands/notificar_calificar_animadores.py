from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import date, timedelta
from core.models import AsignacionCoordinador, AnimadorEvento
from core.push_notifications import enviar_notificacion


class Command(BaseCommand):
    help = 'Notifica a coordinadores para calificar a sus animadores al terminar el evento'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dias',
            type=int,
            default=7,
            help='Cuántos días hacia atrás buscar eventos pendientes (default: 7)',
        )

    def handle(self, *args, **options):
        ahora = timezone.now()
        hoy = date.today()
        desde = hoy - timedelta(days=options['dias'])

        asignaciones = AsignacionCoordinador.objects.select_related(
            'renta', 'renta__cliente', 'coordinador'
        ).filter(
            renta__fecha_renta__range=(desde, hoy),
            renta__status='ACTIVO',
            coordinador__isnull=False,
        )

        enviados = 0
        for a in asignaciones:
            if not a.renta.hora_fin:
                continue

            from datetime import datetime
            hora_fin = datetime.combine(a.renta.fecha_renta, a.renta.hora_fin)
            hora_fin_aware = timezone.make_aware(hora_fin)

            if ahora < hora_fin_aware:
                continue

            animadores_sin_calificar = AnimadorEvento.objects.filter(
                asignacion=a,
                estado='ACEPTADO',
            ).exclude(
                calificacion_coordinador__isnull=False
            ).count()

            if animadores_sin_calificar == 0:
                continue

            try:
                enviar_notificacion(
                    a.coordinador,
                    '⭐ Califica a tu equipo',
                    f'El evento de {a.renta.cliente.nombre} terminó. ¡Califica a tus {animadores_sin_calificar} animador(es)!',
                    f'/coordinador/eventos/{a.id}',
                )
                enviados += 1
            except Exception as e:
                self.stdout.write(f'Error notificando a {a.coordinador.username}: {e}')

        self.stdout.write(f'Notificaciones enviadas: {enviados}')
