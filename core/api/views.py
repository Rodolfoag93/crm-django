from rest_framework import viewsets, filters, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.shortcuts import get_object_or_404
from datetime import timedelta
from core.push_notifications import VAPID_PUBLIC_KEY


from core.models import (
    Cliente, Producto, Renta, Empleado,
    Nomina, Gasto, MovimientoContable, Asistencia, SolicitudRegistro, HorasExtra, PushSuscripcion
)
from core.api.serializers import (
    ClienteSerializer, ProductoSerializer, RentaSerializer,
    EmpleadoSerializer, NominaSerializer, GastoSerializer,
    MovimientoContableSerializer, AsistenciaSerializer, SolicitudRegistroSerializer, HorasExtraSerializer
)


class ClienteViewSet(viewsets.ModelViewSet):
    queryset = Cliente.objects.all().order_by('nombre')
    serializer_class = ClienteSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nombre', 'telefono']
    ordering_fields = ['nombre']


class ProductoViewSet(viewsets.ModelViewSet):
    queryset = Producto.objects.filter(activo=True).order_by('nombre')
    serializer_class = ProductoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['nombre', 'tipo']


class RentaViewSet(viewsets.ModelViewSet):
    queryset = Renta.objects.select_related('cliente').prefetch_related(
        'rentaproductos__producto'
    ).order_by('-fecha_renta')
    serializer_class = RentaSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['folio', 'cliente__nombre', 'cliente__telefono']
    ordering_fields = ['fecha_renta', 'precio_total']

    @action(detail=False, methods=['get'])
    def semana_actual(self, request):
        hoy = timezone.localdate()
        lunes = hoy - timedelta(days=hoy.weekday())
        domingo = lunes + timedelta(days=6)
        rentas = self.queryset.filter(
            fecha_renta__range=[lunes, domingo],
            status='ACTIVO'
        )
        serializer = self.get_serializer(rentas, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def sin_pago(self, request):
        rentas = self.queryset.filter(
            status='ACTIVO',
            pagado=False,
            fecha_renta__lt=timezone.localdate()
        )
        serializer = self.get_serializer(rentas, many=True)
        return Response(serializer.data)


class EmpleadoViewSet(viewsets.ModelViewSet):
    queryset = Empleado.objects.filter(activo=True).order_by('nombre')
    serializer_class = EmpleadoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['nombre', 'tipo_empleado']


class NominaViewSet(viewsets.ModelViewSet):
    serializer_class = NominaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return Nomina.objects.select_related('empleado').order_by('-fecha_inicio')
        try:
            empleado = user.empleado
            return Nomina.objects.filter(empleado=empleado).order_by('-fecha_inicio')
        except Exception:
            return Nomina.objects.none()


class GastoViewSet(viewsets.ModelViewSet):
    queryset = Gasto.objects.all().order_by('-fecha')
    serializer_class = GastoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['descripcion', 'tipo', 'categoria']


class MovimientoContableViewSet(viewsets.ModelViewSet):
    queryset = MovimientoContable.objects.all().order_by('-fecha')
    serializer_class = MovimientoContableSerializer
    permission_classes = [IsAuthenticated]

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    grupos = list(user.groups.values_list('name', flat=True))

    empleado_data = {}
    try:
        empleado = user.empleado
        empleado_data = {
            'empleado_id': empleado.id,
            'tipo_empleado': empleado.tipo_empleado,
            'es_eventual': empleado.es_eventual,
            'sueldo_diario': str(empleado.sueldo_diario),
        }
    except Exception:
        pass

    return Response({
        'id': user.id,
        'username': user.username,
        'nombre': f"{user.first_name} {user.last_name}".strip() or user.username,
        'email': user.email,
        'es_admin': user.is_superuser or user.is_staff,
        'grupos': grupos,
        'es_coordinador': 'Coordinador' in grupos,
        'es_cargador': 'cargador' in grupos or 'Cargador' in grupos or empleado_data.get('tipo_empleado') == 'REPARTIDOR',
        'es_encargado_material': 'Encargado Material' in grupos,
        **empleado_data,
    })

class AsistenciaViewSet(viewsets.ModelViewSet):
    serializer_class = AsistenciaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Admin ve todas las asistencias, empleado solo las suyas
        if user.is_staff or user.is_superuser:
            return Asistencia.objects.select_related('empleado').all()
        try:
            empleado = user.empleado
            return Asistencia.objects.filter(empleado=empleado)
        except Exception:
            return Asistencia.objects.none()
    @action(detail=False, methods=['post'])
    def checkin(self, request):
        ubicacion = request.data.get('ubicacion', '')
        try:
            empleado = request.user.empleado
        except Exception:
            empleado_id = request.data.get('empleado_id')
            if not empleado_id:
                return Response({'error': 'Empleado no encontrado'}, status=status.HTTP_404_NOT_FOUND)
            try:
                empleado = Empleado.objects.get(id=empleado_id)
            except Empleado.DoesNotExist:
                return Response({'error': 'Empleado no encontrado'}, status=status.HTTP_404_NOT_FOUND)
        hoy = timezone.localdate()
        asistencia, created = Asistencia.objects.get_or_create(
            empleado=empleado,
            fecha=hoy,
            defaults={
                'hora_entrada': timezone.now(),
                'ubicacion_entrada': ubicacion,
            }
        )
        if not created and asistencia.hora_entrada:
            return Response({'error': 'Ya registraste tu entrada hoy'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = self.get_serializer(asistencia)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def checkout(self, request):
        ubicacion = request.data.get('ubicacion', '')
        try:
            empleado = request.user.empleado
        except Exception:
            empleado_id = request.data.get('empleado_id')
            if not empleado_id:
                return Response({'error': 'Empleado no encontrado'}, status=status.HTTP_404_NOT_FOUND)
            try:
                empleado = Empleado.objects.get(id=empleado_id)
            except Empleado.DoesNotExist:
                return Response({'error': 'Empleado no encontrado'}, status=status.HTTP_404_NOT_FOUND)
        hoy = timezone.localdate()
        try:
            asistencia = Asistencia.objects.get(empleado=empleado, fecha=hoy)
        except Asistencia.DoesNotExist:
            return Response({'error': 'No has registrado tu entrada hoy'}, status=status.HTTP_400_BAD_REQUEST)
        if asistencia.hora_salida:
            return Response({'error': 'Ya registraste tu salida hoy'}, status=status.HTTP_400_BAD_REQUEST)
        asistencia.hora_salida = timezone.now()
        asistencia.ubicacion_salida = ubicacion
        asistencia.save()
        serializer = self.get_serializer(asistencia)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def hoy(self, request):
        hoy = timezone.localdate()
        asistencias = self.get_queryset().filter(fecha=hoy)
        serializer = self.get_serializer(asistencias, many=True)
        return Response(serializer.data)

class HorasExtraViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = HorasExtraSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return HorasExtra.objects.select_related('empleado').order_by('-semana_inicio')
        try:
            empleado = user.empleado
            return HorasExtra.objects.filter(empleado=empleado).order_by('-semana_inicio')
        except Exception:
            return HorasExtra.objects.none()

    @action(detail=False, methods=['get'])
    def semana_actual(self, request):
        """Devuelve el resumen de horas de la semana actual sin guardar."""
        from datetime import date, timedelta
        from core.models import Empleado
        try:
            empleado = request.user.empleado
        except Exception:
            return Response({'error': 'Empleado no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        hoy = date.today()
        lunes = hoy - timedelta(days=hoy.weekday())
        domingo = lunes + timedelta(days=6)

        preview = HorasExtra(
            empleado=empleado,
            semana_inicio=lunes,
            semana_fin=domingo
        )
        preview.calcular()

        return Response({
            'semana_inicio': lunes,
            'semana_fin': domingo,
            'horas_trabajadas': preview.horas_trabajadas,
            'horas_descontadas': preview.horas_descontadas,
            'horas_computables': preview.horas_computables,
            'horas_extra': preview.horas_extra,
            'total_pago': preview.total_pago,
            'es_eventual': empleado.es_eventual,
        })

class SolicitudRegistroViewSet(viewsets.GenericViewSet):
    serializer_class = SolicitudRegistroSerializer

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def registro(self, request):
        serializer = SolicitudRegistroSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(
                {'mensaje': 'Solicitud enviada correctamente. El administrador revisará tu solicitud.'},
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def aprobar(self, request, pk=None):
        solicitud = get_object_or_404(SolicitudRegistro, pk=pk)

        if solicitud.estado != 'PENDIENTE':
            return Response({'error': 'Esta solicitud ya fue procesada'}, status=status.HTTP_400_BAD_REQUEST)

        from django.contrib.auth.models import User
        from django.utils import timezone as tz

        # Crear usuario
        username = solicitud.telefono
        if User.objects.filter(username=username).exists():
            username = f"{solicitud.telefono}_{solicitud.id}"

        user = User(
            username=username,
            first_name=solicitud.nombre.split()[0],
            last_name=' '.join(solicitud.nombre.split()[1:]),
            email=solicitud.email or '',
        )
        user.password = solicitud.password_hash
        user.save()

        # Buscar empleado existente por teléfono
        empleado = Empleado.objects.filter(telefono=solicitud.telefono).first()

        if empleado:
        # Vincular usuario al empleado existente
            empleado.user = user
            empleado.save()
        else:
         # Crear empleado nuevo
            empleado = Empleado.objects.create(
                nombre=solicitud.nombre,
                telefono=solicitud.telefono,
                correo=solicitud.email or '',
                tipo_empleado=solicitud.tipo_empleado,
                sueldo_diario=0,
                activo=True,
                user=user
        )

        # Actualizar solicitud
        solicitud.estado = 'APROBADA'
        solicitud.revisada_por = request.user
        solicitud.fecha_revision = tz.now()
        solicitud.user_creado = user
        solicitud.save()

        return Response({
            'mensaje': f'Solicitud aprobada. Usuario {username} creado correctamente.',
            'user_id': user.id,
            'empleado_id': empleado.id
        })

    @action(detail=False, methods=['post'])
    def checkin(self, request):
        ubicacion = request.data.get('ubicacion', '')

        try:
            empleado = request.user.empleado
        except Exception:
            empleado_id = request.data.get('empleado_id')
            if not empleado_id:
                return Response({'error': 'No tienes un empleado vinculado'}, status=status.HTTP_400_BAD_REQUEST)
            empleado = get_object_or_404(Empleado, id=empleado_id)

        hoy = timezone.localdate()
        asistencia, created = Asistencia.objects.get_or_create(
            empleado=empleado,
            fecha=hoy,
            defaults={
                'hora_entrada': timezone.now(),
                'ubicacion_entrada': ubicacion,
            }
        )

        if not created and asistencia.hora_entrada:
            return Response({'error': 'Ya registraste tu entrada hoy'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(asistencia)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


    @action(detail=False, methods=['post'])
    def checkout(self, request):
        ubicacion = request.data.get('ubicacion', '')

        try:
            empleado = request.user.empleado
        except Exception:
            empleado_id = request.data.get('empleado_id')
            if not empleado_id:
                return Response({'error': 'No tienes un empleado vinculado'}, status=status.HTTP_400_BAD_REQUEST)
            empleado = get_object_or_404(Empleado, id=empleado_id)

        hoy = timezone.localdate()
        try:
            asistencia = Asistencia.objects.get(empleado=empleado, fecha=hoy)
        except Asistencia.DoesNotExist:
            return Response({'error': 'No has registrado tu entrada hoy'}, status=status.HTTP_400_BAD_REQUEST)

        if asistencia.hora_salida:
            return Response({'error': 'Ya registraste tu salida hoy'}, status=status.HTTP_400_BAD_REQUEST)

        asistencia.hora_salida = timezone.now()
        asistencia.ubicacion_salida = ubicacion
        asistencia.save()

        serializer = self.get_serializer(asistencia)
        return Response(serializer.data)

#---------push notificacions---------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def push_suscribir(request):
    """Guarda la suscripción push del dispositivo del usuario."""
    data = request.data
    endpoint = data.get('endpoint')
    p256dh = data.get('keys', {}).get('p256dh')
    auth = data.get('keys', {}).get('auth')

    if not all([endpoint, p256dh, auth]):
        return Response({'error': 'Datos incompletos.'}, status=400)

    PushSuscripcion.objects.update_or_create(
        endpoint=endpoint,
        defaults={
            'user': request.user,
            'p256dh': p256dh,
            'auth': auth,
        }
    )
    return Response({'ok': True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def push_desuscribir(request):
    """Elimina la suscripción push del dispositivo."""
    endpoint = request.data.get('endpoint')
    if endpoint:
        PushSuscripcion.objects.filter(user=request.user, endpoint=endpoint).delete()
    return Response({'ok': True})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def push_vapid_key(request):
    """Devuelve la clave pública VAPID para el cliente."""
    return Response({'vapid_public_key': VAPID_PUBLIC_KEY})