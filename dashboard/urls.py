from django.urls import path
from .views import dashboard_home
from . import views

urlpatterns = [
    path('', dashboard_home, name='dashboard'),
    path("productos-mas-rentados/",views.productos_mas_rentados,name="productos_mas_rentados"),
]