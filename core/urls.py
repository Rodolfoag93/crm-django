from django.urls import path, include

import dashboard
from . import views
from django.conf.urls.static import static
from django.conf import settings
from django.contrib.auth import views as django_auth_views
from core.auth import views as auth_views  # vistas personalizadas (register)
from django.urls import reverse_lazy
from django.contrib import admin
from .views import lista_horas_extra, pagar_horas_extra, crear_horas_extra, recibo_horas_extra_pdf, pagos_extra_nomina, catalogo_pagos_extra, crear_editar_tipo_pago_extra, eliminar_tipo_pago_extra, crear_pago_extra

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
    path(
        "rentas/<int:pk>/marcar-recolectado/",
        views.marcar_recolectado,
        name="marcar_recolectado"
    ),

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
    path('finanzas/', views.balance_cuentas, name='balance_cuentas'),
    path('finanzas/cuenta/<int:cuenta_id>/', views.movimientos_cuenta, name='movimientos_cuenta'),
    path('finanzas/movimiento/nuevo/', views.registrar_movimiento, name='registrar_movimiento'),
    path('finanzas/transferencia/', views.transferencia_cuentas, name='transferencia_cuentas'),
    path('finanzas/efectivo/', views.movimientos_efectivo, name='movimientos_efectivo'),
    path(
        'finanzas/traspaso/',
        views.traspaso_efectivo_banco,
        name='traspaso_efectivo_banco'
    ),
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
    path('cuentas/', views.lista_cuentas, name='lista_cuentas'),
    path('cuentas/nueva/', views.nueva_cuenta, name='nueva_cuenta'),
    path('gastos/', views.lista_gastos, name='lista_gastos'),
    path('gastos/nuevo/', views.nuevo_gasto, name='nuevo_gasto'),
    path('gastos/<int:gasto_id>/editar/', views.editar_gasto, name='editar_gasto'),
    path('gastos/<int:gasto_id>/eliminar/', views.eliminar_gasto, name='eliminar_gasto'),
    path('compras/', views.lista_compras, name='lista_compras'),
    path('compras/nueva/', views.nueva_compra, name='nueva_compra'),
    path('compras/<int:compra_id>/editar/', views.editar_compra, name='editar_compra'),
    path('compras/<int:compra_id>/eliminar/', views.eliminar_compra, name='eliminar_compra'),

# Empleados
    path('empleados/', views.lista_empleados, name='lista_empleados'),
    path('empleados/nuevo/', views.nuevo_empleado, name='nuevo_empleado'),
    path('empleados/<int:pk>/editar/', views.editar_empleado, name='editar_empleado'),

    # Nómina
    path('nomina/', views.lista_nomina, name='lista_nomina'),
    path('nomina/nueva/', views.nueva_nomina, name='nueva_nomina'),
    path('nomina/<int:pk>/editar/', views.editar_nomina, name='editar_nomina'),
    path('horas-extra/', lista_horas_extra, name='lista_horas_extra'),
    path('horas-extra/nueva/', crear_horas_extra, name='crear_horas_extra'),
    path('horas-extra/<int:id>/pagar/', pagar_horas_extra, name='pagar_horas_extra'),
    path(
        "horas-extra/<int:horas_id>/recibo/",
        recibo_horas_extra_pdf,
        name="recibo_horas_extra_pdf"
    ),
    path(
        'nomina/<int:nomina_id>/recibo/',
        views.recibo_nomina_pdf,
        name='recibo_nomina_pdf'
    ),
    path('bitacora/', views.bitacora_list, name='bitacora_list'),
    path('ocupacion/<str:fecha>/', views.ocupacion_por_fecha, name='ocupacion_por_fecha'),
    path('marcar_mantenimiento/', views.marcar_mantenimiento, name='marcar_mantenimiento'),
    path("ocupacion/<str:fecha>/", views.ocupacion_por_fecha, name="ocupacion_por_fecha"),
    path('nomina/<int:nomina_id>/pagos-extra/', pagos_extra_nomina, name='pagos_extra_nomina'),
    path('catalogo-pagos-extra/', views.catalogo_pagos_extra, name='catalogo_pagos_extra'),

    # Crear nuevo concepto
    path('catalogo-pagos-extra/nuevo/', views.crear_editar_tipo_pago_extra, name='crear_tipo_pago_extra'),

    # Editar concepto existente
    path('catalogo-pagos-extra/<int:tipo_id>/', views.crear_editar_tipo_pago_extra, name='editar_tipo_pago_extra'),

    # Eliminar concepto
    path('catalogo-pagos-extra/<int:tipo_id>/eliminar/', views.eliminar_tipo_pago_extra,
         name='eliminar_tipo_pago_extra'),

    # Eliminar pago extra en nómina
    path('pago-extra/<int:pago_id>/eliminar/', views.eliminar_pago_extra, name='eliminar_pago_extra'),

]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)