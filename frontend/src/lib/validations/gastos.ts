import type { GastoPayload, PresupuestoInfo } from '../finanzas/gastos.service'

const MONTO_COMPROBANTE = 500
const MAX_FILE_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']

export function lunesDe(fecha = new Date()): string {
  const d = new Date(fecha)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

export function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().split('T')[0]
}

export function formatSemanaLabel(inicio: string, fin: string): string {
  const fmt = (iso: string) => {
    const [y, m, day] = iso.split('-').map(Number)
    return new Date(y, m - 1, day).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }
  return `${fmt(inicio)} – ${fmt(fin)}`
}

export function formatMonto(val: string | number): string {
  const n = typeof val === 'string' ? parseFloat(val) : val
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function validateGastoForm(
  form: GastoPayload,
  presupuesto?: PresupuestoInfo | null,
): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {}

  if (!form.descripcion.trim()) {
    errors.descripcion = 'Concepto del gasto es obligatorio.'
  }
  if (!form.categoria) {
    errors.categoria = 'Categoría es obligatoria.'
  }
  if (!form.fecha) {
    errors.fecha = 'Fecha es obligatoria.'
  }

  const monto = parseFloat(form.monto)
  if (!form.monto || isNaN(monto) || monto <= 0) {
    errors.monto = 'Monto debe ser mayor a 0.'
  } else if (!/^\d+(\.\d{1,2})?$/.test(form.monto)) {
    errors.monto = 'Monto debe tener máximo 2 decimales.'
  } else if (
    presupuesto &&
    !presupuesto.sin_limite &&
    presupuesto.disponible !== null &&
    monto > parseFloat(presupuesto.disponible)
  ) {
    errors.presupuesto =
      `El gasto de ${formatMonto(monto)} excede el presupuesto de '${form.categoria}' ` +
      `(${formatMonto(presupuesto.disponible!)} disponibles de ${formatMonto(presupuesto.presupuesto!)}).`
  }

  if (monto > MONTO_COMPROBANTE && !form.comprobante) {
    errors.comprobante = 'Gastos mayores a $500 requieren comprobante.'
  }

  if (form.comprobante) {
    if (form.comprobante.size > MAX_FILE_BYTES) {
      errors.comprobante = 'El comprobante no puede superar 5 MB.'
    } else if (!ALLOWED_TYPES.includes(form.comprobante.type)) {
      errors.comprobante = 'Comprobante debe ser PDF, JPG o PNG.'
    }
  }

  const camposFaltantes = ['descripcion', 'monto', 'categoria', 'fecha'].filter(k => errors[k])
  if (camposFaltantes.length >= 2) {
    errors.general =
      `Completa los campos marcados: ${camposFaltantes.join(', ')}.`
  }

  return { isValid: Object.keys(errors).length === 0, errors }
}
