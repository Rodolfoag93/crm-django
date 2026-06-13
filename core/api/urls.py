from rest_framework.routers import DefaultRouter
from core.api.views import (
    ClienteViewSet, ProductoViewSet, RentaViewSet,
    EmpleadoViewSet, NominaViewSet, GastoViewSet,
    MovimientoContableViewSet, AsistenciaViewSet, SolicitudRegistroViewSet, HorasExtraViewSet, me, push_suscribir, push_desuscribir, push_vapid_key,
    api_mantenimiento, api_marcar_limpieza, api_dashboard_admin
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
    path('push/suscribir/', push_suscribir, name='push_suscribir'),
    path('push/desuscribir/', push_desuscribir, name='push_desuscribir'),
    path('push/vapid-key/', push_vapid_key, name='push_vapid_key'),
    path('mantenimiento/', api_mantenimiento, name='api_mantenimiento'),
    path('mantenimiento/<int:producto_id>/limpiar/', api_marcar_limpieza, name='api_marcar_limpieza'),
    path('dashboard/admin/', api_dashboard_admin, name='api_dashboard_admin'),
]