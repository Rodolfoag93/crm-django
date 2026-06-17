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

    def perform_create(self, serializer):
        nomina = serializer.save()
        nomina.save()

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            qs = Nomina.objects.select_related('empleado').order_by('-fecha_inicio')
        else:
            try:
                empleado = user.empleado
                qs = Nomina.objects.filter(empleado=empleado).order_by('-fecha_inicio')
            except Exception:
                return Nomina.objects.none()

        # Filtro por empleado (solo admin)
        empleado_id = self.request.query_params.get('empleado_id')
        if empleado_id and user.is_staff:
            qs = qs.filter(empleado_id=empleado_id)

        # Filtro por semana — todas las nóminas que caigan dentro del rango lunes-domingo
        fecha_inicio = self.request.query_params.get('fecha_inicio')
        if fecha_inicio:
            from datetime import date, timedelta
            lunes = date.fromisoformat(fecha_inicio)
            domingo = lunes + timedelta(days=6)
            qs = qs.filter(fecha_inicio__gte=lunes, fecha_fin__lte=domingo)

        return qs


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
        'es_coordinador': 'Coordinador' in grupos or empleado_data.get('tipo_empleado') == 'COORDINADOR',
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
        asistencia, _ = Asistencia.objects.get_or_create(
            empleado=empleado,
            fecha=hoy,
        )

        from core.models import TurnoAsistencia
        # Verificar si hay un turno abierto (sin checkout)
        turno_abierto = asistencia.turnos.filter(hora_salida__isnull=True).first()
        if turno_abierto:
            return Response({'error': 'Ya tienes un turno activo. Registra tu salida primero.'}, status=status.HTTP_400_BAD_REQUEST)

        # Crear nuevo turno
        numero = asistencia.turnos.count() + 1
        turno = TurnoAsistencia.objects.create(
            asistencia=asistencia,
            numero_turno=numero,
            hora_entrada=timezone.now(),
            ubicacion_entrada=ubicacion,
        )

        # Actualizar hora_entrada del registro principal si es el primer turno
        if numero == 1:
            asistencia.hora_entrada = turno.hora_entrada
            asistencia.ubicacion_entrada = ubicacion
            asistencia.save()

        serializer = self.get_serializer(asistencia)
        return Response({
            **serializer.data,
            'turno': numero,
            'mensaje': f'Entrada registrada (turno {numero})'
        }, status=status.HTTP_201_CREATED)

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

        from core.models import TurnoAsistencia
        # Buscar turno abierto
        turno_abierto = asistencia.turnos.filter(hora_salida__isnull=True).first()
        if not turno_abierto:
            return Response({'error': 'No tienes un turno activo para cerrar'}, status=status.HTTP_400_BAD_REQUEST)

        turno_abierto.hora_salida = timezone.now()
        turno_abierto.ubicacion_salida = ubicacion
        # Calcular horas del turno
        delta = turno_abierto.hora_salida - turno_abierto.hora_entrada
        turno_abierto.horas_trabajadas = round(delta.total_seconds() / 3600, 2)
        turno_abierto.save()

        # Actualizar hora_salida del registro principal
        asistencia.hora_salida = turno_abierto.hora_salida
        asistencia.ubicacion_salida = ubicacion
        # Sumar horas de todos los turnos
        total_horas = sum(
            t.horas_trabajadas for t in asistencia.turnos.all() if t.horas_trabajadas
        )
        asistencia.horas_trabajadas = total_horas
        asistencia.save()

        serializer = self.get_serializer(asistencia)
        return Response({
            **serializer.data,
            'turno': turno_abierto.numero_turno,
            'horas_turno': float(turno_abierto.horas_trabajadas),
            'horas_total': float(total_horas),
            'mensaje': f'Salida registrada (turno {turno_abierto.numero_turno})'
        })

    @action(detail=False, methods=['get'])
    def hoy(self, request):
        from core.models import TurnoAsistencia, RutaRenta
        hoy = timezone.localdate()
        asistencias = self.get_queryset().filter(fecha=hoy)
        serializer = self.get_serializer(asistencias, many=True)
        data = serializer.data

        try:
            empleado = request.user.empleado
            asistencia = asistencias.first()

            turno_activo = False
            if asistencia:
                turno_activo = asistencia.turnos.filter(hora_salida__isnull=True).exists()

            tiene_recogida_pendiente = RutaRenta.objects.filter(
                ruta__fecha=hoy,
                ruta__tipo='recogida',
                ruta__empleados__empleado=empleado,
                estado='pendiente'
            ).exists()

            if data and len(data) > 0:
                data[0]['turno_activo'] = turno_activo
                data[0]['tiene_recogida_pendiente'] = tiene_recogida_pendiente
            elif not data:
                return Response([{
                    'turno_activo': False,
                    'tiene_recogida_pendiente': tiene_recogida_pendiente
                }])
        except Exception:
            pass

        return Response(data)

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
@permission_classes([AllowAny])
def push_vapid_key(request):
    """Devuelve la clave pública VAPID para el cliente."""
    return Response({'vapid_public_key': VAPID_PUBLIC_KEY})

# ── Mantenimiento ──────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_mantenimiento(request):
    """
    Devuelve todos los brincolines con su estado de mantenimiento,
    ordenados por próxima renta más cercana.
    """
    from core.models import BitacoraMantenimiento, Producto, RentaProducto
    from datetime import date
    hoy = date.today()

    brincolines = Producto.objects.filter(tipo='BR', activo=True)
    for p in brincolines:
        BitacoraMantenimiento.objects.get_or_create(producto=p)

    bitacoras = BitacoraMantenimiento.objects.select_related('producto').filter(
        producto__tipo='BR',
        producto__activo=True
    )

    resultado = []
    for b in bitacoras:
        proxima = RentaProducto.objects.filter(
            producto=b.producto,
            renta__fecha_renta__gte=hoy,
            renta__status='ACTIVO'
        ).order_by('renta__fecha_renta').first()

        proxima_renta = str(proxima.renta.fecha_renta) if proxima else None
        ultima_renta_fecha = RentaProducto.obtener_fecha_ultima_renta(b.producto)
        ultima_renta = str(ultima_renta_fecha) if ultima_renta_fecha else None
        ultima_limpieza = str(b.fecha_ultimo_mantenimiento) if b.fecha_ultimo_mantenimiento else None

        necesita_limpieza = (
            ultima_renta_fecha and (
                not b.fecha_ultimo_mantenimiento or
                b.fecha_ultimo_mantenimiento < ultima_renta_fecha
            )
        )

        resultado.append({
            'id': b.producto.id,
            'nombre': b.producto.nombre,
            'proxima_renta': proxima_renta,
            'ultima_renta': ultima_renta,
            'ultima_limpieza': ultima_limpieza,
            'necesita_limpieza': necesita_limpieza,
            'notas': b.notas or '',
        })

    resultado.sort(key=lambda x: (
        x['proxima_renta'] is None,
        x['proxima_renta'] or '9999-99-99'
    ))

    return Response(resultado)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_marcar_limpieza(request, producto_id):
    """
    El repartidor marca un brincolin como limpio.
    """
    from core.models import BitacoraMantenimiento, Producto, RentaProducto
    producto = get_object_or_404(Producto, id=producto_id, tipo='BR')
    notas = request.data.get('notas', '')
    fecha_ultima_renta = RentaProducto.obtener_fecha_ultima_renta(producto)

    mant, _ = BitacoraMantenimiento.objects.update_or_create(
        producto=producto,
        defaults={
            'fecha_ultima_renta': fecha_ultima_renta,
            'fecha_ultimo_mantenimiento': timezone.now().date(),
            'notas': notas,
        }
    )

    return Response({
        'ok': True,
        'fecha_ultimo_mantenimiento': str(mant.fecha_ultimo_mantenimiento),
    })

# ── Dashboard Admin ────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_dashboard_admin(request):
    """Resumen del día para el admin en la PWA."""
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    from core.models import Renta, Asistencia, SolicitudRegistro, Ruta
    from datetime import date
    hoy = date.today()

    # Pedidos del día
    rentas_hoy = Renta.objects.filter(fecha_renta=hoy, status='ACTIVO')
    pedidos_por_enviar = rentas_hoy.filter(estado_entrega='PENDIENTE').count()
    pedidos_enviados = rentas_hoy.filter(estado_entrega='ENTREGADO').count()
    pedidos_total = rentas_hoy.count()

    # Rutas del día
    rutas_hoy = Ruta.objects.filter(fecha=hoy)
    rutas_pendientes = rutas_hoy.filter(estado='pendiente').count()
    rutas_en_camino = rutas_hoy.filter(estado='en_camino').count()

    # Asistencia
    asistencias_hoy = Asistencia.objects.filter(fecha=hoy)
    con_entrada = asistencias_hoy.filter(hora_entrada__isnull=False).count()
    con_salida = asistencias_hoy.filter(hora_salida__isnull=False).count()

    # Solicitudes pendientes
    solicitudes_pendientes = SolicitudRegistro.objects.filter(estado='PENDIENTE').count()

    return Response({
        'pedidos': {
            'total': pedidos_total,
            'por_enviar': pedidos_por_enviar,
            'enviados': pedidos_enviados,
        },
        'rutas': {
            'total': rutas_hoy.count(),
            'pendientes': rutas_pendientes,
            'en_camino': rutas_en_camino,
        },
        'asistencia': {
            'con_entrada': con_entrada,
            'con_salida': con_salida,
        },
        'solicitudes_pendientes': solicitudes_pendientes,
    })

# ── Rentas del día (admin) ─────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_rentas_hoy(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    from core.models import Renta
    from datetime import date
    hoy = date.today()

    rentas = Renta.objects.filter(
        fecha_renta=hoy,
        status='ACTIVO'
    ).select_related('cliente').prefetch_related('rentaproductos__producto').order_by('hora_inicio')

    data = []
    for r in rentas:
        productos = [
            f"{rp.cantidad}× {rp.producto.nombre}"
            for rp in r.rentaproductos.all()
        ]
        data.append({
            'id': r.id,
            'folio': r.folio,
            'cliente': r.cliente.nombre,
            'telefono': r.cliente.telefono,
            'direccion': f"{r.calle_y_numero}, {r.colonia}, {r.ciudad_o_municipio}",
            'hora_inicio': str(r.hora_inicio) if r.hora_inicio else None,
            'hora_fin': str(r.hora_fin) if r.hora_fin else None,
            'estado_entrega': r.estado_entrega,
            'pagado': r.pagado,
            'total': str(r.precio_total) if r.precio_total else '0',
            'productos': productos,
        })

    return Response(data)

# ── Asistencia del día (admin) ─────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_asistencia_hoy(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    from core.models import Asistencia, Empleado
    from datetime import date
    hoy = date.today()

    # Todos los empleados activos
    empleados = Empleado.objects.filter(
        activo=True,
        tipo_empleado__in=['REPARTIDOR', 'ENCARGADO']
    ).select_related('user')

    # Asistencias de hoy
    asistencias_hoy = Asistencia.objects.filter(fecha=hoy).select_related('empleado')
    asistencias_dict = {a.empleado_id: a for a in asistencias_hoy}

    data = []
    for emp in empleados:
        asistencia = asistencias_dict.get(emp.id)
        data.append({
            'empleado_id': emp.id,
            'nombre': emp.nombre,
            'tipo': emp.get_tipo_empleado_display(),
            'tiene_entrada': asistencia is not None and asistencia.hora_entrada is not None,
            'tiene_salida': asistencia is not None and asistencia.hora_salida is not None,
            'hora_entrada': str(asistencia.hora_entrada) if asistencia and asistencia.hora_entrada else None,
            'hora_salida': str(asistencia.hora_salida) if asistencia and asistencia.hora_salida else None,
            'horas_trabajadas': str(asistencia.horas_trabajadas) if asistencia and asistencia.horas_trabajadas else None,
        })

    # Ordenar: primero los que ya entraron, luego los que no
    data.sort(key=lambda x: (not x['tiene_entrada'], x['nombre']))

    return Response({
        'fecha': str(hoy),
        'total': len(data),
        'con_entrada': sum(1 for d in data if d['tiene_entrada']),
        'con_salida': sum(1 for d in data if d['tiene_salida']),
        'empleados': data,
    })

# ── Rutas Admin PWA ────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_rutas_admin(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    from core.models import Ruta
    from datetime import date
    fecha_param = request.GET.get('fecha', str(date.today()))

    rutas = Ruta.objects.filter(fecha=fecha_param).prefetch_related(
        'empleados__empleado', 'paradas__renta__cliente'
    ).order_by('nombre')

    data = []
    for ruta in rutas:
        empleados = [
            {'nombre': re.empleado.nombre, 'es_lider': re.es_lider}
            for re in ruta.empleados.all()
        ]
        paradas = [
            {
                'id': p.id,
                'orden': p.orden,
                'cliente': p.renta.cliente.nombre,
                'folio': p.renta.folio,
                'estado': p.estado,
                'direccion': f"{p.renta.calle_y_numero}, {p.renta.colonia}, {p.renta.ciudad_o_municipio}",
            }
            for p in ruta.paradas.all()
        ]
        data.append({
            'id': ruta.id,
            'nombre': ruta.nombre,
            'tipo': ruta.tipo,
            'estado': ruta.estado,
            'fecha': str(ruta.fecha),
            'empleados': empleados,
            'paradas': paradas,
            'total_paradas': len(paradas),
            'pendientes': sum(1 for p in paradas if p['estado'] == 'pendiente'),
        })

    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_crear_ruta(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    from core.models import Ruta, RutaEmpleado, Empleado
    data = request.data

    ruta = Ruta.objects.create(
        nombre=data.get('nombre'),
        tipo=data.get('tipo', 'entrega'),
        fecha=data.get('fecha'),
        notas=data.get('notas', ''),
    )

    for emp_id in data.get('empleados', []):
        lider_id = data.get('lider_id')
        RutaEmpleado.objects.create(
            ruta=ruta,
            empleado_id=emp_id,
            es_lider=(str(emp_id) == str(lider_id))
        )

    return Response({'ok': True, 'ruta_id': ruta.id})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_agregar_parada_admin(request, ruta_id):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    from core.models import Ruta, RutaRenta
    ruta = get_object_or_404(Ruta, id=ruta_id)
    renta_id = request.data.get('renta_id')

    orden = ruta.paradas.count() + 1
    RutaRenta.objects.create(
        ruta=ruta,
        renta_id=renta_id,
        orden=orden,
    )

    return Response({'ok': True})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_rentas_disponibles(request):
    """Rentas sin ruta asignada para una fecha dada."""
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)
    from core.models import Renta
    from datetime import date
    fecha = request.GET.get('fecha', str(date.today()))
    ruta_id = request.GET.get('ruta_id')
    tipo = request.GET.get('tipo', 'entrega')  # 'entrega' o 'recoleccion'

    if tipo in ('recoleccion', 'recogida'):
        # Pedidos ya entregados, pendientes de recolectar
        rentas = Renta.objects.filter(
            status='ACTIVO',
            estado_entrega='ENTREGADO',
        )
    else:
        # Pedidos a entregar en la fecha seleccionada
        rentas = Renta.objects.filter(
            fecha_renta=fecha,
            status='ACTIVO',
            estado_entrega='PENDIENTE',
        )

    if ruta_id:
        rentas = rentas.exclude(rutas__ruta_id=ruta_id)

    rentas = rentas.select_related('cliente').order_by('hora_inicio')

    data = [
        {
            'id': r.id,
            'folio': r.folio,
            'cliente': r.cliente.nombre,
            'fecha_renta': str(r.fecha_renta),
            'hora_inicio': str(r.hora_inicio) if r.hora_inicio else None,
            'direccion': f"{r.calle_y_numero}, {r.colonia}, {r.ciudad_o_municipio}",
            'estado_entrega': r.estado_entrega,
        }
        for r in rentas
    ]
    return Response(data)

# ── Nueva Renta (admin PWA) ────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_nueva_renta(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    from core.models import Renta, RentaProducto, Cliente, Producto, MovimientoContable, PedidoFinanzas
    from decimal import Decimal
    import random, string

    data = request.data

    try:
        # Cliente
        cliente_id = data.get('cliente_id')
        if cliente_id:
            cliente = Cliente.objects.get(id=cliente_id)
        else:
            # Crear cliente nuevo
            cliente = Cliente.objects.create(
                nombre=data.get('cliente_nombre', ''),
                telefono=data.get('cliente_telefono', ''),
                calle_y_numero=data.get('cliente_direccion', ''),
                colonia=data.get('cliente_colonia', ''),
                ciudad_o_municipio=data.get('cliente_ciudad', ''),
            )

        # Generar folio
        folio = 'R' + str(int(timezone.now().timestamp()))

        # Crear renta
        renta = Renta.objects.create(
            folio=folio,
            cliente=cliente,
            fecha_renta=data.get('fecha_renta'),
            hora_inicio=data.get('hora_inicio'),
            hora_fin=data.get('hora_fin'),
            calle_y_numero=data.get('calle_y_numero', cliente.calle_y_numero),
            colonia=data.get('colonia', cliente.colonia),
            ciudad_o_municipio=data.get('ciudad_o_municipio', cliente.ciudad_o_municipio),
            precio_total=Decimal(str(data.get('precio_total') or 0)),
            anticipo=Decimal(str(data.get('anticipo') or 0)),
            pagado=data.get('pagado', False),
            status='ACTIVO',
            estado_entrega='PENDIENTE',
        )

        # Productos
        total = Decimal('0')
        for p in data.get('productos', []):
            producto = Producto.objects.get(id=p['id'])
            cantidad = int(p['cantidad'])
            precio_unitario = Decimal(str(p.get('precio_unitario', producto.precio)))
            subtotal = precio_unitario * cantidad
            RentaProducto.objects.create(
                renta=renta,
                producto=producto,
                cantidad=cantidad,
                precio_unitario=precio_unitario,
                subtotal=subtotal,
            )
            total += subtotal

        # Si no se especificó precio, usar total calculado
        if not data.get('precio_total'):
            renta.precio_total = total
            renta.save()

        # Anticipo → movimiento contable
        anticipo = renta.anticipo
        if anticipo > 0:
            metodo_pago = data.get('metodo_pago', 'EFECTIVO')
            MovimientoContable.objects.create(
                tipo='INGRESO',
                monto=anticipo,
                metodo_pago=metodo_pago,
                fecha=timezone.now(),
                descripcion=f'Anticipo renta #{renta.folio}',
            )

        # Pedido finanzas
        try:
            PedidoFinanzas.objects.get_or_create(
                renta=renta,
                defaults={'total': renta.precio_total - renta.anticipo}
            )
        except Exception:
            pass

        # Google Calendar
        try:
            from core.google_calendar import crear_evento_renta
            evento_id = crear_evento_renta(renta)
            if evento_id:
                renta.evento_google_id = evento_id
                renta.save(update_fields=['evento_google_id'])
        except Exception:
            pass

        return Response({
            'ok': True,
            'renta_id': renta.id,
            'folio': renta.folio,
        }, status=201)

    except Exception as e:
        return Response({'error': str(e)}, status=400)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_buscar_clientes(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    from core.models import Cliente
    q = request.GET.get('q', '')
    clientes = Cliente.objects.filter(
        nombre__icontains=q
    ).values('id', 'nombre', 'telefono', 'calle_y_numero', 'colonia', 'ciudad_o_municipio')[:10]
    return Response(list(clientes))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_buscar_productos(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    from core.models import Producto
    q = request.GET.get('q', '')
    productos = Producto.objects.filter(
        nombre__icontains=q,
        activo=True
    ).values('id', 'nombre', 'precio', 'tipo')[:20]
    return Response(list(productos))

# ── Gastos Admin PWA ───────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_cuentas(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)
    from core.models import Cuenta
    cuentas = Cuenta.objects.all().order_by('nombre')
    data = [{'id': c.id, 'nombre': c.nombre, 'tipo': c.tipo} for c in cuentas]
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_crear_gasto(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)
    from core.models import Gasto, Cuenta, MovimientoContable
    from datetime import date
    data = request.data

    try:
        cuenta = Cuenta.objects.get(id=data.get('cuenta_id'))
    except Cuenta.DoesNotExist:
        return Response({'error': 'Cuenta no válida.'}, status=400)

    gasto = Gasto.objects.create(
        tipo=data.get('tipo', 'GASTO'),
        categoria=data.get('categoria', 'INSUMOS'),
        cuenta=cuenta,
        descripcion=data.get('descripcion', ''),
        monto=data.get('monto'),
        fecha=data.get('fecha', str(date.today())),
        referencia=data.get('referencia', ''),
    )

    # Movimiento contable automático

    MovimientoContable.objects.create(
        tipo='EGRESO',
        monto=gasto.monto,
        descripcion=gasto.descripcion,
        fecha=timezone.now(),
        cuenta=cuenta,
    )

    return Response({'ok': True, 'gasto_id': gasto.id})

# ── Nómina: Pagos Extra ────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_catalogo_pagos_extra(request):
    """Lista los tipos de pago extra disponibles."""
    from core.models import TipoPagoExtra
    tipos = TipoPagoExtra.objects.all().order_by('nombre')
    data = [
        {
            'id': t.id,
            'nombre': t.nombre,
            'monto': str(t.monto_default),
            'descuenta_horas': t.descuenta_horas,
            'horas_a_descontar': str(t.horas_a_descontar) if t.horas_a_descontar else '0',
        }
        for t in tipos
    ]
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_crear_pago_extra_nomina(request, nomina_id):
    """Agrega un pago extra a una nómina existente."""
    from core.models import PagoExtraNomina, Nomina, TipoPagoExtra
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    nomina = get_object_or_404(Nomina, id=nomina_id)
    tipo_id = request.data.get('tipo_id')
    monto_override = request.data.get('monto')  # opcional

    tipo = get_object_or_404(TipoPagoExtra, id=tipo_id)

    pago = PagoExtraNomina.objects.create(
        nomina=nomina,
        tipo=tipo,
        monto=monto_override if monto_override else tipo.monto_default,
    )

    # Recalcular total de la nómina
    nomina.save()

    return Response({
        'ok': True,
        'pago_id': pago.id,
        'tipo': tipo.nombre,
        'monto': str(pago.monto),
        'nuevo_total': str(nomina.total),
    }, status=201)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def api_eliminar_pago_extra(request, pago_id):
    """Elimina un pago extra de una nómina."""
    from core.models import PagoExtraNomina
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    pago = get_object_or_404(PagoExtraNomina, id=pago_id)
    nomina = pago.nomina
    pago.delete()

    # Recalcular total
    nomina.save()

    return Response({'ok': True, 'nuevo_total': str(nomina.total)})

# ── Coordinador PWA ────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_mis_eventos(request):
    """Eventos asignados al coordinador logueado."""
    from core.models import AsignacionCoordinador
    
    asignaciones = AsignacionCoordinador.objects.filter(
        coordinador=request.user
    ).select_related(
        'renta', 'renta__cliente'
    ).prefetch_related(
        'renta__rentaproductos__producto'
    ).order_by('-renta__fecha_renta')

    data = []
    for a in asignaciones:
        productos_animacion = [
            rp.producto.nombre
            for rp in a.renta.rentaproductos.all()
            if rp.producto.tipo == 'AN'
        ]
        data.append({
            'asignacion_id': a.id,
            'renta_id': a.renta.id,
            'folio': a.renta.folio,
            'cliente': a.renta.cliente.nombre,
            'telefono': a.renta.cliente.telefono,
            'fecha': str(a.renta.fecha_renta),
            'hora_inicio': str(a.renta.hora_inicio) if a.renta.hora_inicio else None,
            'hora_fin': str(a.renta.hora_fin) if a.renta.hora_fin else None,
            'direccion': f"{a.renta.calle_y_numero}, {a.renta.colonia}, {a.renta.ciudad_o_municipio}",
            'servicios': productos_animacion,
            'notas': a.notas or '',
            'tiene_lista': hasattr(a, 'listamaterialevento'),
        })

    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_evento_detalle(request, asignacion_id):
    """Detalle completo de un evento asignado al coordinador."""
    from core.models import AsignacionCoordinador

    asignacion = get_object_or_404(
        AsignacionCoordinador,
        id=asignacion_id,
        coordinador=request.user
    )
    r = asignacion.renta
    productos = [
        {
            'nombre': rp.producto.nombre,
            'tipo': rp.producto.tipo,
            'cantidad': rp.cantidad,
            'precio_unitario': str(rp.precio_unitario),
        }
        for rp in r.rentaproductos.select_related('producto').all()
    ]

    return Response({
        'asignacion_id': asignacion.id,
        'renta_id': r.id,
        'folio': r.folio,
        'cliente': r.cliente.nombre,
        'telefono': r.cliente.telefono,
        'direccion': f"{r.calle_y_numero}, {r.colonia}, {r.ciudad_o_municipio}",
        'fecha': str(r.fecha_renta),
        'hora_inicio': str(r.hora_inicio) if r.hora_inicio else None,
        'hora_fin': str(r.hora_fin) if r.hora_fin else None,
        'precio_total': str(r.precio_total),
        'anticipo': str(r.anticipo),
        'pagado': r.pagado,
        'comentarios': r.comentarios or '',
        'productos': productos,
        'notas_coordinador': asignacion.notas or '',
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_lista_material_evento(request, asignacion_id):
    """Obtiene la lista de material de un evento."""
    from core.models import AsignacionCoordinador, ListaMaterialEvento, MaterialEvento

    asignacion = get_object_or_404(
        AsignacionCoordinador,
        id=asignacion_id,
        coordinador=request.user
    )

    try:
        lista = ListaMaterialEvento.objects.get(asignacion=asignacion)
    except ListaMaterialEvento.DoesNotExist:
        return Response({
            'existe': False,
            'items': []
        })

    items = MaterialEvento.objects.filter(
        asignacion=asignacion
    ).select_related('material')

    data = [
        {
            'id': item.id,
            'material_id': item.material.id,
            'material_nombre': item.material.nombre,
            'material_foto': request.build_absolute_uri(item.material.foto.url) if item.material.foto else None,
            'cantidad': item.cantidad,
            'nota': item.nota or '',
            'despachado': item.despachado,
            'recibido': item.recibido,
        }
        for item in items
    ]

    return Response({
        'existe': True,
        'lista_id': lista.id,
        'estado': lista.estado,
        'items': data,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_agregar_material_evento(request, asignacion_id):
    """Agrega un material a la lista de un evento."""
    from core.models import AsignacionCoordinador, ListaMaterialEvento, MaterialEvento, MaterialAnimacion

    asignacion = get_object_or_404(
        AsignacionCoordinador,
        id=asignacion_id,
        coordinador=request.user
    )

    # Crear lista si no existe
    lista, _ = ListaMaterialEvento.objects.get_or_create(
        asignacion=asignacion,
        defaults={'estado': 'BORRADOR'}
    )

    material_id = request.data.get('material_id')
    cantidad = request.data.get('cantidad', 1)
    nota = request.data.get('nota', '')

    material = get_object_or_404(MaterialAnimacion, id=material_id)

    # Si ya existe ese material en la lista, actualizar cantidad
    item, created = MaterialEvento.objects.get_or_create(
        asignacion=asignacion,
        material=material,
        defaults={'cantidad': cantidad, 'nota': nota}
    )
    if not created:
        item.cantidad = cantidad
        item.nota = nota
        item.save()

    return Response({
        'ok': True,
        'item_id': item.id,
        'created': created,
    }, status=201 if created else 200)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def api_quitar_material_evento(request, item_id):
    """Elimina un material de la lista del evento."""
    from core.models import MaterialEvento, AsignacionCoordinador

    item = get_object_or_404(MaterialEvento, id=item_id)

    # Verificar que la asignación pertenece al coordinador
    asignacion = get_object_or_404(
        AsignacionCoordinador,
        id=item.asignacion_id,
        coordinador=request.user
    )

    item.delete()
    return Response({'ok': True})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_catalogo_materiales(request):
    """Catálogo de materiales de animación."""
    from core.models import MaterialAnimacion

    q = request.GET.get('q', '')
    materiales = MaterialAnimacion.objects.filter(activo=True)
    if q:
        materiales = materiales.filter(nombre__icontains=q)

    data = [
        {
            'id': m.id,
            'nombre': m.nombre,
            'descripcion': m.descripcion or '',
            'tipo': m.tipo,
            'stock_disponible': m.stock_disponible,
            'foto': request.build_absolute_uri(m.foto.url) if m.foto else None,
        }
        for m in materiales.order_by('nombre')
    ]
    return Response(data)