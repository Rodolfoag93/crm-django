from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth.models import User
from core.push_notifications import enviar_notificacion, enviar_notificacion_todos
from core.models import Ruta, RutaEmpleado
import datetime


class Command(BaseCommand):
    help = 'Envía notificaciones push programadas'

    def add_arguments(self, parser):
        parser.add_argument('tipo', type=str, choices=[
            'checkin', 'checkout', 'rutas_hoy', 'recogidas_hoy'
        ])

    def handle(self, *args, **options):
        tipo = options['tipo']
        hoy = timezone.localdate()

        if tipo == 'checkin':
            # Notificar a todos los empleados con usuario activo
            usuarios = User.objects.filter(
                is_active=True,
                empleado__tipo_empleado__in=['REPARTIDOR', 'ENCARGADO'],
                push_suscripciones__isnull=False
            ).distinct()
            enviar_notificacion_todos(
                usuarios,
                titulo='⏰ Registra tu entrada',
                cuerpo='No olvides marcar tu checkin del día.',
                url='/asistencia'
            )
            self.stdout.write(f'Checkin enviado a {usuarios.count()} usuarios')

        elif tipo == 'checkout':
            usuarios = User.objects.filter(
                is_active=True,
                empleado__tipo_empleado__in=['REPARTIDOR', 'ENCARGADO'],
                push_suscripciones__isnull=False
            ).distinct()
            enviar_notificacion_todos(
                usuarios,
                titulo='🔴 Registra tu salida',
                cuerpo='No olvides marcar tu checkout antes de salir.',
                url='/asistencia'
            )
            self.stdout.write(f'Checkout enviado a {usuarios.count()} usuarios')
        elif tipo == 'rutas_hoy':
            # Notificar a repartidores con ruta hoy
            ruta_empleados = RutaEmpleado.objects.filter(
                ruta__fecha=hoy,
                ruta__tipo='entrega',
                ruta__estado='pendiente',
                empleado__tipo_empleado__in=['REPARTIDOR', 'ENCARGADO'],
                empleado__user__isnull=False,
                empleado__user__push_suscripciones__isnull=False
            ).select_related('empleado__user', 'ruta').distinct()

            for re in ruta_empleados:
                enviar_notificacion(
                    re.empleado.user,
                    titulo='🚚 Tienes una ruta hoy',
                    cuerpo=f'Ruta: {re.ruta.nombre}. Revisa tus entregas.',
                    url='/entregas'
                )
            self.stdout.write(f'Rutas notificadas: {ruta_empleados.count()}')

        elif tipo == 'recogidas_hoy':
            # Notificar a repartidores con recogidas hoy
            from core.models import RecogidaProgramada
            recogidas = RecogidaProgramada.objects.filter(
                fecha_recogida=hoy,
                ruta_renta_entrega__ruta__empleados__empleado__user__isnull=False,
            ).select_related(
                'ruta_renta_entrega__ruta'
            ).distinct()

            usuarios_notificados = set()
            for recogida in recogidas:
                ruta = recogida.ruta_renta_entrega.ruta
                for re in ruta.empleados.filter(empleado__user__isnull=False):
                    user = re.empleado.user
                    if user.id not in usuarios_notificados:
                        enviar_notificacion(
                            user,
                            titulo='📦 Tienes recogidas hoy',
                            cuerpo='Hay pedidos programados para recoger hoy.',
                            url='/entregas'
                        )
                        usuarios_notificados.add(user.id)
            self.stdout.write(f'Recogidas notificadas: {len(usuarios_notificados)} usuarios')