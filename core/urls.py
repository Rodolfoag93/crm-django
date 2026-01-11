from django.urls import path, include

import dashboard
from . import views
from django.conf.urls.static import static
from django.conf import settings
from django.contrib.auth import views as django_auth_views
from core.auth import views as auth_views  # vistas personalizadas (register)
from django.urls import reverse_lazy
from django.contrib import admin
urlpatterns = [
    path('admin/', admin.site.urls),
    # 🔐 LOGIN como página principal
    path(
        '',
        django_auth_views.LoginView.as_view(template_name='core/login.html'),
        name='login'
    ),

    # 🏠 Home del sistema
    path('home/', views.home, name='home'),
    path('ventas/', views.dashboard_ventas, name='dashboard_ventas'),
    path('administracion/', views.dashboard_admin, name='dashboard_admin'),
    path('dashboard/', include('dashboard.urls')),

    # 👥 Clientes
    path('clientes/', views.lista_clientes, name='lista_clientes'),
    path('clientes/nuevo/', views.nuevo_cliente, name='nuevo_cliente'),
    path("api/clientes/", views.api_clientes, name='api_clientes'),
    path('clientes/editar/<int:cliente_id>/', views.editar_cliente, name='editar_cliente'),
    path('clientes/eliminar/<int:cliente_id>/', views.eliminar_cliente, name='eliminar_cliente'),

    # 📦 Productos
    path('productos/', views.lista_productos, name='lista_productos'),
    path('productos/nuevo/', views.nuevo_producto, name='nuevo_producto'),
    path('api/productos/', views.api_productos, name='api_productos'),
    path('productos/editar/<int:producto_id>/', views.editar_producto, name='editar_producto'),

    # 📅 Rentas
    path('rentas/', views.lista_rentas, name='lista_rentas'),
    path('rentas/nueva/', views.nueva_renta, name='nueva_renta'),
    path('rentas/ticket/<int:renta_id>/', views.ticket_pdf, name='ticket_pdf'),
    path('rentas/<int:renta_id>/editar/', views.editar_renta, name='editar_renta'),
    path(
        'rentas/<int:renta_id>/cancelar/',
        views.cancelar_renta,
        name='cancelar_renta'
    ),
    path('inventario/ocupacion/', views.ocupacion_productos, name='ocupacion_productos'),
    path('ruta/<int:ruta_id>/iniciar/', views.iniciar_ruta, name='iniciar_ruta'),
    path('ruta/<int:ruta_id>/finalizar/', views.finalizar_ruta, name='finalizar_ruta'),
    path('mi-ruta/', views.mi_ruta, name='mi_ruta'),
    path(
    'ruta/<int:ruta_id>/asignar-rentas/',
    views.asignar_rentas_a_ruta,
    name='asignar_rentas_ruta'
),
    path('rutas/', views.lista_rutas, name='lista_rutas'),
    path('rutas/crear/', views.crear_ruta, name='crear_ruta'),
    path('ocupacion-productos/',views.ocupacion_productos,name='ocupacion_productos'),

    # 💰 Contabilidad
    path('contabilidad/', views.contabilidad_home, name='contabilidad'),
    path('gastos/', views.lista_gastos, name='lista_gastos'),
    path('compas/', views.lista_compras, name='lista_compras'),
    path('contabilidad/pagar/<int:renta_id>/', views.marcar_pagado, name='cont_pagar'),
    path('contabilidad/pendiente/<int:renta_id>/', views.marcar_pendiente, name='cont_pendiente'),
    path('contabilidad/pedidos-semana/', views.pedidos_semana, name='pedidos_semana'),
    path('contabilidad/gastos/nuevo/', views.nuevo_gasto, name='nuevo_gasto'),
    path('contabilidad/compras/nueva/', views.nueva_compra, name='nueva_compra'),
    path('rentas/<int:renta_id>/asignar-cargador/', views.asignar_cargador, name='asignar_cargador'),
    # 👤 Usuarios
    path(
        'accounts/login/',
        django_auth_views.LoginView.as_view(
            template_name='core/login.html',
            redirect_authenticated_user=True
        ),
        name='login'
    ),
    path('accounts/logout/', django_auth_views.LogoutView.as_view(), name='logout'),
    path('accounts/register/', auth_views.register, name='register'),
    path(
    'accounts/login/',
    django_auth_views.LoginView.as_view(
        template_name='core/login.html',
        redirect_authenticated_user=True,
        success_url=reverse_lazy('home')
    ),
    name='login'
),

# Empleados
    path('empleados/', views.lista_empleados, name='lista_empleados'),
    path('empleados/nuevo/', views.nuevo_empleado, name='nuevo_empleado'),
    path('empleados/<int:pk>/editar/', views.editar_empleado, name='editar_empleado'),

    # Nómina
    path('nomina/', views.lista_nomina, name='lista_nomina'),
    path('nomina/nueva/', views.nueva_nomina, name='nueva_nomina'),
    path('nomina/<int:pk>/editar/', views.editar_nomina, name='editar_nomina'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)