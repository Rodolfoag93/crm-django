from rest_framework.routers import DefaultRouter
from core.api.views import (
    ClienteViewSet, ProductoViewSet, RentaViewSet,
    EmpleadoViewSet, NominaViewSet, GastoViewSet,
    MovimientoContableViewSet, AsistenciaViewSet, SolicitudRegistroViewSet, HorasExtraViewSet, me
)
from core.views.rutas import api_mis_rutas, api_confirmar_entrega, api_confirmar_recogida
from django.urls import path

router = DefaultRouter()
router.register(r'clientes', ClienteViewSet)
router.register(r'productos', ProductoViewSet)
router.register(r'rentas', RentaViewSet)
router.register(r'empleados', EmpleadoViewSet)
router.register(r'nomina', NominaViewSet, basename='nomina')
router.register(r'gastos', GastoViewSet)
router.register(r'movimientos', MovimientoContableViewSet)
router.register(r'asistencias', AsistenciaViewSet, basename='asistencia')
router.register(r'solicitudes', SolicitudRegistroViewSet, basename='solicitud')
router.register(r'horas-extra', HorasExtraViewSet, basename='horas-extra')

urlpatterns = router.urls + [
    path('auth/me/', me, name='auth-me'),
    path('rutas/mis-rutas/', api_mis_rutas, name='api_mis_rutas'),
    path('rutas/<int:parada_id>/entregar/', api_confirmar_entrega, name='api_confirmar_entrega'),
    path('rutas/<int:parada_id>/recoger/', api_confirmar_recogida, name='api_confirmar_recogida'),
]