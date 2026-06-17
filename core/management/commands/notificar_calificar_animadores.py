from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import date
from core.models import AsignacionCoordinador, AnimadorEvento
from core.push_notifications import enviar_notificacion


class Command(BaseCommand):
    help = 'Notifica a coordinadores para calificar a sus animadores al terminar el evento'

    def handle(self, *args, **options):
        ahora = timezone.now()
        hoy = date.today()

        # Buscar asignaciones de hoy cuyos eventos ya terminaron
        asignaciones = AsignacionCoordinador.objects.select_related(
            'renta', 'coordinador'
        ).filter(
            renta__fecha_renta=hoy,
            renta__status='ACTIVO',
        )

        enviados = 0
        for a in asignaciones:
            if not a.renta.hora_fin:
                continue

            # Verificar que el evento ya terminó
            from datetime import datetime
            hora_fin = datetime.combine(hoy, a.renta.hora_fin)
            hora_fin_aware = timezone.make_aware(hora_fin)

            if ahora < hora_fin_aware:
                continue

            # Verificar que tiene animadores aceptados sin calificar
            animadores_sin_calificar = AnimadorEvento.objects.filter(
                asignacion=a,
                estado='ACEPTADO',
            ).exclude(
                calificacion_coordinador__isnull=False
            ).count()

            if animadores_sin_calificar == 0:
                continue

            # Notificar al coordinador
            try:
                enviar_notificacion(
                    a.coordinador,
                    '⭐ Califica a tu equipo',
                    f'El evento de {a.renta.cliente.nombre} terminó. ¡Califica a tus {animadores_sin_calificar} animador(es)!',
                    f'/coordinador/eventos/{a.id}'
                )
                enviados += 1
            except Exception as e:
                self.stdout.write(f'Error notificando a {a.coordinador.username}: {e}')

        self.stdout.write(f'Notificaciones enviadas: {enviados}')