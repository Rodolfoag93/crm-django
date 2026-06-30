from rest_framework.routers import DefaultRouter
from core.api.views import (
    ClienteViewSet, ProductoViewSet, RentaViewSet,
    EmpleadoViewSet, NominaViewSet, GastoViewSet,
    MovimientoContableViewSet, AsistenciaViewSet, SolicitudRegistroViewSet, HorasExtraViewSet, me, push_suscribir, push_desuscribir, push_vapid_key,
    api_mantenimiento, api_marcar_limpieza, api_dashboard_admin, api_rentas_hoy, api_asistencia_hoy, api_editar_asistencia_admin,
    api_rutas_admin, api_crear_ruta, api_agregar_parada_admin, api_editar_ruta, api_eliminar_parada_admin, api_rentas_disponibles,
    api_nueva_renta, api_buscar_clientes, api_buscar_productos, api_cuentas, api_crear_gasto,
    api_catalogo_pagos_extra, api_crear_pago_extra_nomina, api_eliminar_pago_extra, api_recibo_nomina, api_mapa_entregas, api_mis_eventos, api_evento_detalle,
    api_lista_material_evento, api_agregar_material_evento, api_quitar_material_evento, api_catalogo_materiales,
    api_listas_material_encargado, api_lista_material_detalle_encargado, api_surtir_lista, api_confirmar_llegada_coordinador,
    api_recibir_lista_bodega, api_subir_evidencia, api_evidencias_lista, api_enviar_lista_coordinador, api_mis_eventos_animador,
    api_responder_evento_animador, api_calificar_coordinador,
    api_ranking_coordinadores, api_mi_calificacion_coordinador, api_animadores_disponibles, api_asignar_animador, api_quitar_animador,
    api_calificar_animador, api_ranking_animadores, api_animadores_por_calificar, api_registro_solicitud,
    api_rankings_eventos, api_actualizar_ubicacion,
    api_eventos_animacion, api_coordinadores_crm, api_asignar_coordinador_crm,
    api_calificar_encargado, api_calificar_coordinador_encargado, api_estado_calificaciones_lista,
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


urlpatterns = [
    path('nomina/pagos-extra-catalogo/', api_catalogo_pagos_extra),
    path('nomina/<int:nomina_id>/pagos-extra/', api_crear_pago_extra_nomina),
    path('nomina/pagos-extra/<int:pago_id>/eliminar/', api_eliminar_pago_extra),
    path('nomina/<int:nomina_id>/recibo/', api_recibo_nomina),
    path('mapa-entregas/', api_mapa_entregas),
    path('ubicacion/', api_actualizar_ubicacion),
] + router.urls + [
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
    path('asistencia/editar/', api_editar_asistencia_admin, name='api_editar_asistencia_admin'),
    path('rutas-admin/', api_rutas_admin, name='api_rutas_admin'),
    path('rutas-admin/crear/', api_crear_ruta, name='api_crear_ruta'),
    path('rutas-admin/<int:ruta_id>/parada/', api_agregar_parada_admin, name='api_agregar_parada_admin'),
    path('rutas-admin/<int:ruta_id>/editar/', api_editar_ruta, name='api_editar_ruta'),
    path('rutas-admin/parada/<int:parada_id>/eliminar/', api_eliminar_parada_admin, name='api_eliminar_parada_admin'),
    path('rentas-disponibles/', api_rentas_disponibles, name='api_rentas_disponibles'),
    path('nueva-renta/', api_nueva_renta, name='api_nueva_renta'),
    path('clientes-buscar/', api_buscar_clientes, name='api_buscar_clientes'),
    path('productos-buscar/', api_buscar_productos, name='api_buscar_productos'),
    path('cuentas/', api_cuentas, name='api_cuentas'),
    path('crear-gasto/', api_crear_gasto, name='api_crear_gasto'),
    path('coordinador/eventos/', api_mis_eventos),
    path('coordinador/eventos/<int:asignacion_id>/', api_evento_detalle),
    path('coordinador/eventos/<int:asignacion_id>/material/', api_lista_material_evento),
    path('coordinador/eventos/<int:asignacion_id>/material/agregar/', api_agregar_material_evento),
    path('coordinador/material/<int:item_id>/quitar/', api_quitar_material_evento),
    path('coordinador/catalogo-materiales/', api_catalogo_materiales),
    path('coordinador/eventos/<int:asignacion_id>/material/enviar/', api_enviar_lista_coordinador),
    path('encargado/listas/', api_listas_material_encargado),
    path('encargado/listas/<int:lista_id>/', api_lista_material_detalle_encargado),
    path('encargado/listas/<int:lista_id>/surtir/', api_surtir_lista),
    path('encargado/listas/<int:lista_id>/recibir/', api_recibir_lista_bodega),
    path('encargado/listas/<int:lista_id>/evidencias/', api_evidencias_lista),
    path('encargado/listas/<int:lista_id>/evidencias/subir/', api_subir_evidencia),
    path('coordinador/listas/<int:lista_id>/confirmar-llegada/', api_confirmar_llegada_coordinador),
    path('animador/eventos/', api_mis_eventos_animador),
    path('animador/eventos/<int:animador_evento_id>/responder/', api_responder_evento_animador),
    path('animador/eventos/<int:animador_evento_id>/calificar/', api_calificar_coordinador),
    path('animador/ranking/', api_ranking_coordinadores),
    path('coordinador/mi-calificacion/', api_mi_calificacion_coordinador),
    path('coordinador/animadores/', api_animadores_disponibles),
    path('coordinador/eventos/<int:asignacion_id>/animadores/asignar/', api_asignar_animador),
    path('coordinador/animadores/<int:animador_evento_id>/quitar/', api_quitar_animador),
    path('coordinador/eventos/<int:asignacion_id>/animadores/calificar/', api_animadores_por_calificar),
    path('coordinador/animadores/<int:animador_evento_id>/calificar/', api_calificar_animador),
    path('animador/ranking-animadores/', api_ranking_animadores),
    path('registro/', api_registro_solicitud),
    path('crm/rankings/', api_rankings_eventos, name='api_rankings_eventos'),
    path('crm/animacion/eventos/', api_eventos_animacion, name='api_eventos_animacion'),
    path('crm/animacion/coordinadores/', api_coordinadores_crm, name='api_coordinadores_crm'),
    path('crm/animacion/asignar-coordinador/', api_asignar_coordinador_crm, name='api_asignar_coordinador_crm'),
    path('encargado/listas/<int:lista_id>/calificar-coordinador/', api_calificar_coordinador_encargado),
    path('coordinador/listas/<int:lista_id>/calificar-encargado/', api_calificar_encargado),
    path('listas/<int:lista_id>/calificaciones/', api_estado_calificaciones_lista),
]