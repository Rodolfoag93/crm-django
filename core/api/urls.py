from rest_framework.routers import DefaultRouter
from core.api.views import (
    ClienteViewSet, ProductoViewSet, RentaViewSet,
    EmpleadoViewSet, NominaViewSet, GastoViewSet,
    MovimientoContableViewSet, AsistenciaViewSet, SolicitudRegistroViewSet, HorasExtraViewSet, me, push_suscribir, push_desuscribir, push_vapid_key,
    api_mantenimiento, api_marcar_limpieza, api_dashboard_admin, api_rentas_hoy, api_asistencia_hoy,
    api_rutas_admin, api_crear_ruta, api_agregar_parada_admin, api_rentas_disponibles,
    api_nueva_renta, api_buscar_clientes, api_buscar_productos, api_cuentas, api_crear_gasto

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
    path('rentas-hoy/', api_rentas_hoy, name='api_rentas_hoy'),
    path('asistencia-hoy/', api_asistencia_hoy, name='api_asistencia_hoy'),
    path('rutas-admin/', api_rutas_admin, name='api_rutas_admin'),
    path('rutas-admin/crear/', api_crear_ruta, name='api_crear_ruta'),
    path('rutas-admin/<int:ruta_id>/parada/', api_agregar_parada_admin, name='api_agregar_parada_admin'),
    path('rentas-disponibles/', api_rentas_disponibles, name='api_rentas_disponibles'),
    path('nueva-renta/', api_nueva_renta, name='api_nueva_renta'),
    path('clientes-buscar/', api_buscar_clientes, name='api_buscar_clientes'),
    path('productos-buscar/', api_buscar_productos, name='api_buscar_productos'),
    path('v1/cuentas/', views.api_cuentas, name='api_cuentas'),
    path('v1/crear-gasto/', views.api_crear_gasto, name='api_crear_gasto'),
]