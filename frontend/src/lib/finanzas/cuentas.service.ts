import api from '../api'

export interface Cuenta {
  id: number
  nombre: string
  tipo: string
  banco: string
  numero: string
  activa: boolean
  saldo: string
}

export interface ResumenBalances {
  saldo_efectivo: string
  saldo_bancos: string
  total: string
  cuentas: Cuenta[]
}

export interface Movimiento {
  id: number
  tipo: 'INGRESO' | 'EGRESO' | string
  monto: string
  metodo_pago: string
  descripcion: string
  fecha: string | null
  cuenta_id: number | null
  cuenta_nombre: string
  pedido_id: number | null
  gasto_id: number | null
}

export interface MovimientosResponse {
  cuenta: Cuenta
  movimientos: Movimiento[]
}

export interface CuentaPayload {
  nombre: string
  tipo: 'Banco' | 'Efectivo'
  banco?: string
  numero?: string
  activa?: boolean
}

export interface MovimientoPayload {
  cuenta_id: number | string
  tipo: 'INGRESO' | 'EGRESO'
  monto: string
  metodo_pago?: string
  descripcion?: string
}

export interface TransferirPayload {
  origen_id: number | string
  destino_id: number | string
  monto: string
  descripcion?: string
}

export interface TraspasarPayload {
  direccion: 'efectivo_a_banco' | 'banco_a_efectivo'
  cuenta_banco_id: number | string
  monto: string
  descripcion?: string
}

export const cuentasService = {
  listar: (incluirInactivas = false) =>
    api.get<Cuenta[]>('/cuentas/', {
      params: incluirInactivas ? { incluir_inactivas: '1' } : {},
    }),

  resumen: () => api.get<ResumenBalances>('/cuentas/resumen/'),

  crear: (payload: CuentaPayload) => api.post<Cuenta>('/cuentas/', payload),

  actualizar: (id: number, payload: Partial<CuentaPayload>) =>
    api.patch<Cuenta>(`/cuentas/${id}/`, payload),

  movimientos: (id: number, limit = 100) =>
    api.get<MovimientosResponse>(`/cuentas/${id}/movimientos/`, { params: { limit } }),

  registrarMovimiento: (payload: MovimientoPayload) =>
    api.post('/cuentas/movimiento/', payload),

  transferir: (payload: TransferirPayload) =>
    api.post('/cuentas/transferir/', payload),

  traspasar: (payload: TraspasarPayload) =>
    api.post('/cuentas/traspasar/', payload),
}
