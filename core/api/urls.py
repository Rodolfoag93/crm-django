from rest_framework.routers import DefaultRouter
from core.api.views import (
    ClienteViewSet, ProductoViewSet, RentaViewSet,
    EmpleadoViewSet, NominaViewSet, GastoViewSet,
    MovimientoContableViewSet, me
)
from django.urls import path

router = DefaultRouter()
router.register(r'clientes', ClienteViewSet)
router.register(r'productos', ProductoViewSet)
router.register(r'rentas', RentaViewSet)
router.register(r'empleados', EmpleadoViewSet)
router.register(r'nomina', NominaViewSet)
router.register(r'gastos', GastoViewSet)
router.register(r'movimientos', MovimientoContableViewSet)

urlpatterns = router.urls + [
    path('auth/me/', me, name='auth-me'),
]