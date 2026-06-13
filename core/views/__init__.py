# ── Helpers ───────────────────────────────────────────────────────────
from core.views.helpers import (
    get_caja_efectivo,
    es_admin,
    es_cargador,
    es_encargado_material,
)

# ── Dashboard ─────────────────────────────────────────────────────────
from core.views.dashboard import (
    home,
    dashboard_ventas,
    dashboard_admin,
)

# ── Clientes ──────────────────────────────────────────────────────────
from core.views.clientes import (
    lista_clientes,
    nuevo_cliente,
    editar_cliente,
    eliminar_cliente,
    api_clientes,
)

# ── Productos ─────────────────────────────────────────────────────────
from core.views.productos import (
    lista_productos,
    nuevo_producto,
    editar_producto,
    api_productos,
)

# ── Rentas ────────────────────────────────────────────────────────────
from core.views.rentas import (
    lista_rentas,
    nueva_renta,
    editar_renta,
    cancelar_renta,
    ticket_pdf,
    marcar_recolectado,
    ocupacion_productos,
    ocupacion_por_fecha,
)

# ── Rutas ─────────────────────────────────────────────────────────────
from core.views.rutas import (
    lista_rutas,
    crear_ruta,
    detalle_ruta,
    agregar_parada,
    cambiar_estado_ruta,
    lista_recogidas,
)

# ── Contabilidad ──────────────────────────────────────────────────────
from core.views.contabilidad import (
    contabilidad_home,
    marcar_pagado,
    marcar_pendiente,
    pedidos_semana,
    lista_gastos,
    nuevo_gasto,
    editar_gasto,
    eliminar_gasto,
    lista_compras,
    nueva_compra,
    editar_compra,
    eliminar_compra,
    lista_cuentas,
    nueva_cuenta,
    balance_cuentas,
    movimientos_cuenta,
    registrar_movimiento,
    transferencia_cuentas,
    transferir_entre_cuentas,
    movimientos_efectivo,
    traspaso_efectivo_banco,
    bitacora_list,
    marcar_mantenimiento,
)

# ── Empleados ─────────────────────────────────────────────────────────
from core.views.empleados import (
    lista_empleados,
    nuevo_empleado,
    editar_empleado,
    lista_solicitudes,
    aprobar_solicitud,
    rechazar_solicitud,
)

# ── Nómina ────────────────────────────────────────────────────────────
from core.views.nomina import (
    lista_nomina,
    nueva_nomina,
    editar_nomina,
    recibo_nomina_pdf,
    pagos_extra_nomina,
    crear_pago_extra,
    eliminar_pago_extra,
    catalogo_pagos_extra,
    crear_editar_tipo_pago_extra,
    eliminar_tipo_pago_extra,
    lista_horas_extra,
    crear_horas_extra,
    pagar_horas_extra,
    recibo_horas_extra_pdf,
)

# ── Coordinador ───────────────────────────────────────────────────────
from core.views.coordinador import (
    asignar_coordinador_animacion,
    mis_eventos,
    catalogo_materiales_coordinador,
    detalle_evento,
    agregar_material_evento,
    eliminar_material_evento,
    alertas_coordinador,
)

# ── Materiales ────────────────────────────────────────────────────────
from core.views.materiales import (
    catalogo_materiales,
    nuevo_material,
    editar_material,
    home_encargado,
    todas_listas_material,
    detalle_lista_material,
    cambiar_estado_lista,
)

# ── Productos AJAX ────────────────────────────────────────────────────
from core.views.productos import (
    crear_producto_ajax,
)