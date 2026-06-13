from django.urls import path, include
from django.conf.urls.static import static
from django.conf import settings
from django.contrib.auth import views as django_auth_views
from core.auth import views as auth_views
from . import views

urlpatterns = [

    # ─── Autenticación ───────────────────────────────────────────────
    path(
        '',
        django_auth_views.LoginView.as_view(
            template_name='core/login.html',
            redirect_authenticated_user=True,
            next_page='home'
        ),
        name='login'
    ),
    path('accounts/logout/', django_auth_views.LogoutView.as_view(), name='logout'),
    path('accounts/register/', auth_views.register, name='register'),

    # ─── Home y Dashboards ───────────────────────────────────────────
    path('home/', views.home, name='home'),
    path('ventas/', views.dashboard_ventas, name='dashboard_ventas'),
    path('administracion/', views.dashboard_admin, name='dashboard_admin'),
    path('dashboard/', include('dashboard.urls')),

    # ─── Clientes ────────────────────────────────────────────────────
    path('clientes/', views.lista_clientes, name='lista_clientes'),
    path('clientes/nuevo/', views.nuevo_cliente, name='nuevo_cliente'),
    path('clientes/editar/<int:cliente_id>/', views.editar_cliente, name='editar_cliente'),
    path('clientes/eliminar/<int:cliente_id>/', views.eliminar_cliente, name='eliminar_cliente'),
    path('api/clientes/', views.api_clientes, name='api_clientes'),

    # ─── Productos ───────────────────────────────────────────────────
    path('productos/', views.lista_productos, name='lista_productos'),
    path('productos/nuevo/', views.nuevo_producto, name='nuevo_producto'),
    path('productos/editar/<int:producto_id>/', views.editar_producto, name='editar_producto'),
    path('api/productos/', views.api_productos, name='api_productos'),
    path('productos/crear-ajax/', views.crear_producto_ajax, name='crear_producto_ajax'),

    # ─── Rentas ──────────────────────────────────────────────────────
    path('rentas/', views.lista_rentas, name='lista_rentas'),
    path('rentas/nueva/', views.nueva_renta, name='nueva_renta'),
    path('rentas/ticket/<int:renta_id>/', views.ticket_pdf, name='ticket_pdf'),
    path('rentas/<int:renta_id>/editar/', views.editar_renta, name='editar_renta'),
    path('rentas/<int:renta_id>/cancelar/', views.cancelar_renta, name='cancelar_renta'),
    path('rentas/<int:renta_id>/asignar-coordinador/', views.asignar_coordinador_animacion, name='asignar_coordinador_animacion'),
    path('rentas/<int:pk>/marcar-recolectado/', views.marcar_recolectado, name='marcar_recolectado'),

    # ─── Rutas de entrega ────────────────────────────────────────────
    path('rutas/', views.lista_rutas, name='lista_rutas'),
    path('rutas/crear/', views.crear_ruta, name='crear_ruta'),
    path('rutas/<int:ruta_id>/', views.detalle_ruta, name='detalle_ruta'),
    path('rutas/<int:ruta_id>/parada/', views.agregar_parada, name='agregar_parada'),
    path('rutas/<int:ruta_id>/estado/', views.cambiar_estado_ruta, name='cambiar_estado_ruta'),
    path('rutas/recogidas/', views.lista_recogidas, name='lista_recogidas'),
    path('rutas/mis-rutas/', views.api_mis_rutas, name='api_mis_rutas'),
    path('rutas/<int:parada_id>/entregar/', views.api_confirmar_entrega, name='api_confirmar_entrega'),
    path('rutas/<int:parada_id>/recoger/', views.api_confirmar_recogida, name='api_confirmar_recogida'),

    # ─── Inventario / Ocupación ──────────────────────────────────────
    path('inventario/ocupacion/', views.ocupacion_productos, name='ocupacion_productos'),
    path('ocupacion/<str:fecha>/', views.ocupacion_por_fecha, name='ocupacion_por_fecha'),

    # ─── Bitácora mantenimiento ──────────────────────────────────────
    path('bitacora/', views.bitacora_list, name='bitacora_list'),
    path('marcar_mantenimiento/', views.marcar_mantenimiento, name='marcar_mantenimiento'),

    # ─── Contabilidad ────────────────────────────────────────────────
    path('contabilidad/', views.contabilidad_home, name='contabilidad'),
    path('contabilidad/pagar/<int:renta_id>/', views.marcar_pagado, name='cont_pagar'),
    path('contabilidad/pendiente/<int:renta_id>/', views.marcar_pendiente, name='cont_pendiente'),
    path('contabilidad/pedidos-semana/', views.pedidos_semana, name='pedidos_semana'),

    # ─── Gastos ──────────────────────────────────────────────────────
    path('gastos/', views.lista_gastos, name='lista_gastos'),
    path('gastos/nuevo/', views.nuevo_gasto, name='nuevo_gasto'),
    path('gastos/<int:gasto_id>/editar/', views.editar_gasto, name='editar_gasto'),
    path('gastos/<int:gasto_id>/eliminar/', views.eliminar_gasto, name='eliminar_gasto'),

    # ─── Compras ─────────────────────────────────────────────────────
    path('compras/', views.lista_compras, name='lista_compras'),
    path('compras/nueva/', views.nueva_compra, name='nueva_compra'),
    path('compras/<int:compra_id>/editar/', views.editar_compra, name='editar_compra'),
    path('compras/<int:compra_id>/eliminar/', views.eliminar_compra, name='eliminar_compra'),

    # ─── Finanzas ────────────────────────────────────────────────────
    path('finanzas/', views.balance_cuentas, name='balance_cuentas'),
    path('finanzas/cuenta/<int:cuenta_id>/', views.movimientos_cuenta, name='movimientos_cuenta'),
    path('finanzas/movimiento/nuevo/', views.registrar_movimiento, name='registrar_movimiento'),
    path('finanzas/transferencia/', views.transferencia_cuentas, name='transferencia_cuentas'),
    path('finanzas/efectivo/', views.movimientos_efectivo, name='movimientos_efectivo'),
    path('finanzas/traspaso/', views.traspaso_efectivo_banco, name='traspaso_efectivo_banco'),

    # ─── Cuentas ─────────────────────────────────────────────────────
    path('cuentas/', views.lista_cuentas, name='lista_cuentas'),
    path('cuentas/nueva/', views.nueva_cuenta, name='nueva_cuenta'),

    # ─── Empleados ───────────────────────────────────────────────────
    path('empleados/', views.lista_empleados, name='lista_empleados'),
    path('empleados/nuevo/', views.nuevo_empleado, name='nuevo_empleado'),
    path('empleados/<int:pk>/editar/', views.editar_empleado, name='editar_empleado'),

    # ─── Solicitudes de registro ──────────────────────────────────────────
    path('empleados/solicitudes/', views.lista_solicitudes, name='lista_solicitudes'),
    path('empleados/solicitudes/<int:solicitud_id>/aprobar/', views.aprobar_solicitud, name='aprobar_solicitud'),
    path('empleados/solicitudes/<int:solicitud_id>/rechazar/', views.rechazar_solicitud, name='rechazar_solicitud'),

    # ─── Nómina ──────────────────────────────────────────────────────
    path('nomina/', views.lista_nomina, name='lista_nomina'),
    path('nomina/nueva/', views.nueva_nomina, name='nueva_nomina'),
    path('nomina/<int:pk>/editar/', views.editar_nomina, name='editar_nomina'),
    path('nomina/<int:nomina_id>/recibo/', views.recibo_nomina_pdf, name='recibo_nomina_pdf'),
    path('nomina/<int:nomina_id>/pagos-extra/', views.pagos_extra_nomina, name='pagos_extra_nomina'),

    # ─── Horas extra ─────────────────────────────────────────────────
    path('horas-extra/', views.lista_horas_extra, name='lista_horas_extra'),
    path('horas-extra/nueva/', views.crear_horas_extra, name='crear_horas_extra'),
    path('horas-extra/<int:id>/pagar/', views.pagar_horas_extra, name='pagar_horas_extra'),
    path('horas-extra/<int:horas_id>/recibo/', views.recibo_horas_extra_pdf, name='recibo_horas_extra_pdf'),

    # ─── Catálogo pagos extra nómina ─────────────────────────────────
    path('catalogo-pagos-extra/', views.catalogo_pagos_extra, name='catalogo_pagos_extra'),
    path('catalogo-pagos-extra/nuevo/', views.crear_editar_tipo_pago_extra, name='crear_tipo_pago_extra'),
    path('catalogo-pagos-extra/<int:tipo_id>/', views.crear_editar_tipo_pago_extra, name='editar_tipo_pago_extra'),
    path('catalogo-pagos-extra/<int:tipo_id>/eliminar/', views.eliminar_tipo_pago_extra, name='eliminar_tipo_pago_extra'),
    path('pago-extra/<int:pago_id>/eliminar/', views.eliminar_pago_extra, name='eliminar_pago_extra'),

    # ─── Animación - Admin ───────────────────────────────────────────
    path('animacion/catalogo/', views.catalogo_materiales, name='catalogo_materiales'),
    path('animacion/catalogo/nuevo/', views.nuevo_material, name='nuevo_material'),
    path('animacion/catalogo/<int:material_id>/editar/', views.editar_material, name='editar_material'),
    path('animacion/catalogo/ver', views.catalogo_materiales_coordinador, name='catalogo_materiales_coordinador'),

    # ─── Animación - Coordinador ─────────────────────────────────────
    path('mis-eventos/', views.mis_eventos, name='mis_eventos'),
    path('mis-eventos/<int:asignacion_id>/', views.detalle_evento, name='detalle_evento'),
    path('mis-eventos/<int:asignacion_id>/agregar-material/', views.agregar_material_evento, name='agregar_material_evento'),
    path('material-evento/<int:material_evento_id>/eliminar/', views.eliminar_material_evento, name='eliminar_material_evento'),

    # ─── Encargado de material ───────────────────────────────────────
    path('encargado/', views.home_encargado, name='home_encargado'),
    path('encargado/listas/', views.todas_listas_material, name='todas_listas_material'),
    path('encargado/listas/<int:lista_id>/', views.detalle_lista_material, name='detalle_lista_material'),
    path('encargado/listas/<int:lista_id>/estado/', views.cambiar_estado_lista, name='cambiar_estado_lista'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)