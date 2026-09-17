import { useCallback, useEffect, useState } from 'react'
import api from '../lib/api'

export interface TemporadaAlta {
  id: number
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  activo: boolean
  notas: string
}

type Step = 'lista' | 'datos' | 'confirmar'

const EMPTY_FORM = () => ({
  nombre: '',
  fecha_inicio: '',
  fecha_fin: '',
  activo: true,
  notas: '',
})

function formatFecha(iso: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function TemporadaAltaWizard({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>('lista')
  const [items, setItems] = useState<TemporadaAlta[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(EMPTY_FORM())

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/temporadas-alta/')
      const raw = res.data
      setItems(Array.isArray(raw) ? raw : (raw.results ?? []))
    } catch {
      setError('No se pudieron cargar las temporadas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setStep('lista')
    setEditingId(null)
    setForm(EMPTY_FORM())
    setError('')
    cargar()
  }, [open, cargar])

  if (!open) return null

  const startCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM())
    setError('')
    setStep('datos')
  }

  const startEdit = (t: TemporadaAlta) => {
    setEditingId(t.id)
    setForm({
      nombre: t.nombre,
      fecha_inicio: t.fecha_inicio,
      fecha_fin: t.fecha_fin,
      activo: t.activo,
      notas: t.notas || '',
    })
    setError('')
    setStep('datos')
  }

  const validateDatos = () => {
    if (!form.nombre.trim()) return 'El nombre es obligatorio.'
    if (!form.fecha_inicio || !form.fecha_fin) return 'Indica fecha inicio y fin.'
    if (form.fecha_fin < form.fecha_inicio) return 'La fecha fin debe ser ≥ fecha inicio.'
    return ''
  }

  const goConfirmar = () => {
    const err = validateDatos()
    if (err) {
      setError(err)
      return
    }
    setError('')
    setStep('confirmar')
  }

  const guardar = async () => {
    setSaving(true)
    setError('')
    const payload = {
      nombre: form.nombre.trim(),
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin,
      activo: form.activo,
      notas: form.notas.trim(),
    }
    try {
      if (editingId) {
        await api.patch(`/temporadas-alta/${editingId}/`, payload)
      } else {
        await api.post('/temporadas-alta/', payload)
      }
      await cargar()
      setStep('lista')
      setEditingId(null)
      setForm(EMPTY_FORM())
    } catch (e: unknown) {
      const data = (e as { response?: { data?: Record<string, unknown> } })?.response?.data
      const msg =
        (typeof data?.detalle === 'string' && data.detalle)
        || (typeof data?.detail === 'string' && data.detail)
        || (typeof data?.fecha_fin === 'string' && data.fecha_fin)
        || (Array.isArray(data?.fecha_fin) && String(data.fecha_fin[0]))
        || (typeof data?.nombre === 'string' && data.nombre)
        || (Array.isArray(data?.nombre) && String(data.nombre[0]))
        || 'No se pudo guardar la temporada.'
      setError(String(msg))
      setStep('datos')
    } finally {
      setSaving(false)
    }
  }

  const toggleActivo = async (t: TemporadaAlta) => {
    try {
      await api.patch(`/temporadas-alta/${t.id}/`, { activo: !t.activo })
      await cargar()
    } catch {
      setError('No se pudo actualizar el estado.')
    }
  }

  const eliminar = async (t: TemporadaAlta) => {
    if (!confirm(`¿Eliminar la temporada "${t.nombre}"?`)) return
    try {
      await api.delete(`/temporadas-alta/${t.id}/`)
      await cargar()
    } catch {
      setError('No se pudo eliminar.')
    }
  }

  const stepLabel =
    step === 'lista' ? 'Temporadas configuradas'
      : step === 'datos' ? (editingId ? 'Editar temporada' : 'Nueva temporada')
        : 'Confirmar'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(22,32,22,0.45)' }}>
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-xl flex flex-col max-h-[90vh]"
        style={{ border: '1px solid #ddeadd' }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #ddeadd' }}>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8fa890' }}>
              Wizard · paso {step === 'lista' ? '1' : step === 'datos' ? '2' : '3'} de 3
            </div>
            <h2 className="font-bold text-lg" style={{ color: '#162016' }}>{stepLabel}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-2 py-1 rounded-lg"
            style={{ color: '#5a7060' }}
          >
            Cerrar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 text-sm px-3 py-2 rounded-lg" style={{ background: '#fff1f2', color: '#b91c1c', border: '1px solid #fca5a5' }}>
              {error}
            </div>
          )}

          {step === 'lista' && (
            <div className="flex flex-col gap-3">
              <p className="text-sm" style={{ color: '#5a7060' }}>
                En estas fechas el bot reserva stock, pero un asesor debe confirmar logística (repartidores/camionetas).
              </p>
              {loading ? (
                <div className="text-sm py-8 text-center" style={{ color: '#8fa890' }}>Cargando…</div>
              ) : items.length === 0 ? (
                <div className="text-sm py-8 text-center rounded-xl border" style={{ color: '#8fa890', borderColor: '#ddeadd', background: '#f8fbf8' }}>
                  Aún no hay temporadas. Crea la primera.
                </div>
              ) : (
                items.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-xl border p-3 flex flex-col gap-2"
                    style={{ borderColor: '#ddeadd', background: t.activo ? '#f8fbf8' : '#fafafa' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-sm" style={{ color: '#162016' }}>{t.nombre}</div>
                        <div className="text-xs mt-0.5" style={{ color: '#5a7060' }}>
                          {formatFecha(t.fecha_inicio)} → {formatFecha(t.fecha_fin)}
                        </div>
                        {t.notas ? (
                          <div className="text-xs mt-1" style={{ color: '#8fa890' }}>{t.notas}</div>
                        ) : null}
                      </div>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                        style={{
                          background: t.activo ? '#dcfce7' : '#f3f4f6',
                          color: t.activo ? '#15803d' : '#6b7280',
                        }}
                      >
                        {t.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(t)}
                        className="flex-1 text-xs font-medium py-1.5 rounded-lg border"
                        style={{ borderColor: '#ddeadd', color: '#5a7060' }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActivo(t)}
                        className="flex-1 text-xs font-medium py-1.5 rounded-lg border"
                        style={{ borderColor: '#ddeadd', color: '#5a7060' }}
                      >
                        {t.activo ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminar(t)}
                        className="text-xs font-medium py-1.5 px-3 rounded-lg border"
                        style={{ borderColor: '#fca5a5', color: '#b91c1c', background: '#fff1f2' }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {step === 'datos' && (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold" style={{ color: '#5a7060' }}>Nombre</span>
                <input
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej. Semana Santa 2026"
                  className="border rounded-lg px-3 py-2 text-sm"
                  style={{ borderColor: '#ddeadd' }}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold" style={{ color: '#5a7060' }}>Fecha inicio</span>
                  <input
                    type="date"
                    value={form.fecha_inicio}
                    onChange={(e) => setForm((f) => ({ ...f, fecha_inicio: e.target.value }))}
                    className="border rounded-lg px-3 py-2 text-sm"
                    style={{ borderColor: '#ddeadd' }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold" style={{ color: '#5a7060' }}>Fecha fin</span>
                  <input
                    type="date"
                    value={form.fecha_fin}
                    onChange={(e) => setForm((f) => ({ ...f, fecha_fin: e.target.value }))}
                    className="border rounded-lg px-3 py-2 text-sm"
                    style={{ borderColor: '#ddeadd' }}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm" style={{ color: '#162016' }}>
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                />
                Activa (aplica al bot de inmediato)
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold" style={{ color: '#5a7060' }}>Notas (opcional)</span>
                <textarea
                  value={form.notas}
                  onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                  rows={3}
                  placeholder="Capacidad limitada de camionetas / repartidores…"
                  className="border rounded-lg px-3 py-2 text-sm resize-none"
                  style={{ borderColor: '#ddeadd' }}
                />
              </label>
            </div>
          )}

          {step === 'confirmar' && (
            <div className="flex flex-col gap-3">
              <p className="text-sm" style={{ color: '#5a7060' }}>
                Revisa los datos antes de guardar. Las rentas con fecha en este rango pedirán visto bueno de logística.
              </p>
              <div className="rounded-xl border p-4 flex flex-col gap-2 text-sm" style={{ borderColor: '#ddeadd', background: '#f8fbf8' }}>
                <div><span style={{ color: '#8fa890' }}>Nombre: </span><strong style={{ color: '#162016' }}>{form.nombre}</strong></div>
                <div><span style={{ color: '#8fa890' }}>Periodo: </span><strong style={{ color: '#162016' }}>{formatFecha(form.fecha_inicio)} → {formatFecha(form.fecha_fin)}</strong></div>
                <div><span style={{ color: '#8fa890' }}>Estado: </span><strong style={{ color: form.activo ? '#15803d' : '#6b7280' }}>{form.activo ? 'Activa' : 'Inactiva'}</strong></div>
                {form.notas ? (
                  <div><span style={{ color: '#8fa890' }}>Notas: </span><span style={{ color: '#162016' }}>{form.notas}</span></div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4" style={{ borderTop: '1px solid #ddeadd' }}>
          {step === 'lista' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 text-sm font-medium py-2.5 rounded-lg border"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}
              >
                Listo
              </button>
              <button
                type="button"
                onClick={startCreate}
                className="flex-1 text-sm font-semibold py-2.5 rounded-lg"
                style={{ background: '#16a34a', color: 'white' }}
              >
                Nueva temporada
              </button>
            </>
          )}
          {step === 'datos' && (
            <>
              <button
                type="button"
                onClick={() => { setError(''); setStep('lista') }}
                className="flex-1 text-sm font-medium py-2.5 rounded-lg border"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={goConfirmar}
                className="flex-1 text-sm font-semibold py-2.5 rounded-lg"
                style={{ background: '#16a34a', color: 'white' }}
              >
                Continuar
              </button>
            </>
          )}
          {step === 'confirmar' && (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => setStep('datos')}
                className="flex-1 text-sm font-medium py-2.5 rounded-lg border disabled:opacity-50"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}
              >
                Atrás
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={guardar}
                className="flex-1 text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50"
                style={{ background: '#16a34a', color: 'white' }}
              >
                {saving ? 'Guardando…' : (editingId ? 'Guardar cambios' : 'Crear temporada')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
