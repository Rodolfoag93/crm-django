import api from '../api'

export interface Gasto {
  id: number
  tipo: string
  tipo_display: string
  categoria: string
  categoria_display: string
  cuenta: number | null
  cuenta_nombre: string
  descripcion: string
  monto: string
  fecha: string
  referencia: string | null
  comprobante_url: string | null
  nomina: number | null
}

export interface GastoCatalogo {
  tipos: { value: string; label: string }[]
  categorias: { value: string; label: string }[]
  cuentas: { id: number; nombre: string; tipo: string; banco: string | null; saldo: string }[]
  saldo_efectivo: string
  presupuestos: Record<string, PresupuestoInfo>
}

export interface PresupuestoInfo {
  categoria: string
  presupuesto: string | null
  gastado: string
  disponible: string | null
  porcentaje: number
  excedido: boolean
  sin_limite?: boolean
}

export interface GastoStats {
  semana_inicio: string
  semana_fin: string
  total_semana: string
  total_mes: string
  count_semana: number
  por_categoria: { categoria: string; total: string; count: number }[]
}

export interface GastoFilters {
  semana_inicio?: string
  tipo?: string
  categoria?: string
  search?: string
}

export interface GastoPayload {
  tipo: string
  categoria: string
  cuenta_id: string
  descripcion: string
  monto: string
  fecha: string
  referencia: string
  comprobante?: File | null
}

export interface DuplicadoGasto {
  id: number
  fecha: string
  descripcion: string
  monto: string
  categoria: string
  categoria_display: string
}

function buildFormData(payload: GastoPayload): FormData {
  const fd = new FormData()
  fd.append('tipo', payload.tipo)
  fd.append('categoria', payload.categoria)
  fd.append('descripcion', payload.descripcion)
  fd.append('monto', payload.monto)
  fd.append('fecha', payload.fecha)
  fd.append('referencia', payload.referencia || '')
  if (payload.cuenta_id) {
    fd.append('cuenta', payload.cuenta_id)
  }
  if (payload.comprobante) {
    fd.append('comprobante', payload.comprobante)
  }
  return fd
}

export const gastosService = {
  getGastos: (filters: GastoFilters = {}) =>
    api.get<Gasto[]>('/gastos/', { params: filters }),

  getStats: (semana_inicio?: string) =>
    api.get<GastoStats>('/gastos/stats/', { params: semana_inicio ? { semana_inicio } : {} }),

  getCatalogo: () => api.get<GastoCatalogo>('/gastos/catalogo/'),

  getPresupuesto: (categoria: string, excluirId?: number) =>
    api.get<PresupuestoInfo>('/gastos/presupuesto/', {
      params: { categoria, ...(excluirId ? { excluir_id: excluirId } : {}) },
    }),

  checkDuplicados: (params: {
    descripcion: string
    monto: string
    categoria: string
    excluir_id?: number
  }) =>
    api.get<{ duplicados: DuplicadoGasto[]; tiene_duplicados: boolean }>(
      '/gastos/duplicados/',
      { params },
    ),

  createGasto: (payload: GastoPayload) => {
    const fd = buildFormData(payload)
    return api.post<Gasto>('/gastos/', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  updateGasto: (id: number, payload: GastoPayload) => {
    const fd = buildFormData(payload)
    return api.put<Gasto>(`/gastos/${id}/`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  deleteGasto: (id: number) => api.delete(`/gastos/${id}/`),
}
