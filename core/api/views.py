from rest_framework import viewsets, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from datetime import timedelta


from core.models import (
    Cliente, Producto, Renta, Empleado,
    Nomina, Gasto, MovimientoContable
)
from core.api.serializers import (
    ClienteSerializer, ProductoSerializer, RentaSerializer,
    EmpleadoSerializer, NominaSerializer, GastoSerializer,
    MovimientoContableSerializer
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
    queryset = Nomina.objects.select_related('empleado').order_by('-fecha_inicio')
    serializer_class = NominaSerializer
    permission_classes = [IsAuthenticated]


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

    return Response({
        'id': user.id,
        'username': user.username,
        'nombre': f"{user.first_name} {user.last_name}".strip() or user.username,
        'email': user.email,
        'es_admin': user.is_superuser or user.is_staff,
        'grupos': grupos,
        'es_coordinador': 'Coordinador' in grupos,
        'es_cargador': 'cargador' in grupos or 'Cargador' in grupos,
        'es_encargado_material': 'Encargado Material' in grupos,
    })
