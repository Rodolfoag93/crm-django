import { useEffect, useState, useCallback } from 'react'
import api from '../../lib/api'

// ── Interfaces ─────────────────────────────────────────────────────────────────
interface PagoExtra {
  id: number
  tipo: number
  tipo_nombre: string
  monto: string
}

interface NominaItem {
  id: number
  empleado: number
  empleado_nombre: string
  fecha_inicio: string
  fecha_fin: string
  dias_trabajados: number
  total: string
  pagos_extra: PagoExtra[]
}

interface TipoPagoExtra {
  id: number
  nombre: string
  monto: string
}

// ── Helpers de fecha ───────────────────────────────────────────────────────────
function getLunes(fecha?: Date): Date {
  const d = fecha ? new Date(fecha) : new Date()
  const dia = d.getDay()
  const diff = (dia === 0 ? -6 : 1 - dia)
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}
function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function sumarDias(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function formatFechaCorta(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}
function formatMonto(s: string | number) {
  return `$${parseFloat(String(s)).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

const AVATAR_COLORS = ['#16a34a', '#2563eb', '#9333ea', '#db2777', '#ea580c', '#0891b2']
function initials(nombre: string) {
  return nombre.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}
function avatarColor(id: number) { return AVATAR_COLORS[id % AVATAR_COLORS.length] }

// ── Componente principal ───────────────────────────────────────────────────────
export default function Nomina() {
  const [lunes, setLunes] = useState<Date>(getLunes())
  const [nominas, setNominas] = useState<NominaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [detalle, setDetalle] = useState<NominaItem | null>(null)

  // Formulario nueva/editar nómina
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<NominaItem | null>(null)
  const [empleados, setEmpleados] = useState<{ id: number; nombre: string }[]>([])
  const [form, setForm] = useState({ empleado: '', dias_trabajados: '', fecha_inicio: '', fecha_fin: '' })
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  // Pagos extra
  const [tiposPago, setTiposPago] = useState<TipoPagoExtra[]>([])
  const [showPagoExtra, setShowPagoExtra] = useState(false)
  const [pagoForm, setPagoForm] = useState({ tipo_id: '', monto: '' })
  const [guardandoPago, setGuardandoPago] = useState(false)

  const domingo = sumarDias(lunes, 6)

  const cargar = useCallback(() => {
    setLoading(true)
    api.get('/nomina/', { params: { fecha_inicio: toISO(lunes) } })
      .then(r => {
        const data = Array.isArray(r.data) ? r.data : (r.data.results ?? [])
        setNominas(data)
      })
      .finally(() => setLoading(false))
  }, [lunes])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    api.get('/empleados/').then(r => {
      const data = Array.isArray(r.data) ? r.data : (r.data.results ?? [])
      setEmpleados(data.map((e: { id: number; nombre: string }) => ({ id: e.id, nombre: e.nombre })))
    })
    api.get('/nomina/pagos-extra-catalogo/').then(r => setTiposPago(r.data))
  }, [])

  // Stats
  const totalSemana = nominas.reduce((s, n) => s + parseFloat(n.total), 0)
  const totalExtras = nominas.reduce((s, n) => s + (n.pagos_extra ?? []).reduce((a, p) => a + parseFloat(p.monto), 0), 0)

  function semanaAnterior() { setLunes(getLunes(sumarDias(lunes, -7))) }
  function semanaSiguiente() { setLunes(getLunes(sumarDias(lunes, 7))) }
  function irAHoy() { setLunes(getLunes()) }

  function abrirNueva() {
    setEditando(null)
    setForm({ empleado: '', dias_trabajados: '', fecha_inicio: toISO(lunes), fecha_fin: toISO(domingo) })
    setErrorForm('')
    setShowForm(true)
  }

  function abrirEditar(n: NominaItem) {
    setEditando(n)
    setForm({ empleado: String(n.empleado), dias_trabajados: String(n.dias_trabajados), fecha_inicio: n.fecha_inicio, fecha_fin: n.fecha_fin })
    setErrorForm('')
    setShowForm(true)
  }

  async function guardarNomina() {
    if (!form.empleado) { setErrorForm('Selecciona un empleado.'); return }
    setGuardando(true); setErrorForm('')
    try {
      const payload = {
        empleado: parseInt(form.empleado),
        dias_trabajados: parseInt(form.dias_trabajados) || 0,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin,
        total: 0,
      }
      if (editando) {
        const res = await api.patch(`/nomina/${editando.id}/`, payload)
        setDetalle(res.data)
      } else {
        await api.post('/nomina/', payload)
      }
      setShowForm(false)
      cargar()
    } catch (e: unknown) {
      const data = (e as { response?: { data?: Record<string, string[]> } })?.response?.data
      const first = data ? Object.values(data).flat()[0] : null
      setErrorForm(typeof first === 'string' ? first : 'Error al guardar.')
    } finally { setGuardando(false) }
  }

  async function abrirPagoExtra(n: NominaItem) {
    setDetalle(n)
    setPagoForm({ tipo_id: tiposPago[0] ? String(tiposPago[0].id) : '', monto: tiposPago[0]?.monto ?? '' })
    setShowPagoExtra(true)
  }

  async function guardarPagoExtra() {
    if (!detalle || !pagoForm.tipo_id) return
    setGuardandoPago(true)
    try {
      await api.post(`/nomina/${detalle.id}/pagos-extra/`, { tipo_id: parseInt(pagoForm.tipo_id), monto: parseFloat(pagoForm.monto) })
      setShowPagoExtra(false)
      cargar()
      // Refrescar detalle
      const res = await api.get(`/nomina/${detalle.id}/`)
      setDetalle(res.data)
    } catch { } finally { setGuardandoPago(false) }
  }

  async function eliminarPagoExtra(pagoId: number) {
    if (!window.confirm('¿Eliminar este pago extra?')) return
    await api.delete(`/nomina/pagos-extra/${pagoId}/eliminar/`)
    cargar()
    if (detalle) {
      const res = await api.get(`/nomina/${detalle.id}/`)
      setDetalle(res.data)
    }
  }

  async function abrirRecibo(n: NominaItem) {
    try {
      const resp = await api.get(`/nomina/${n.id}/recibo/`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }))
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      alert('No se pudo cargar el recibo.')
    }
  }

  const lunesHoy = toISO(getLunes())
  const esHoy = toISO(lunes) === lunesHoy

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>

      {/* ── Panel izquierdo ──────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: 24 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#162016', margin: 0 }}>Nómina</h1>
            <p style={{ fontSize: 13, color: '#8fa890', margin: 0 }}>
              {formatFechaCorta(toISO(lunes))} — {formatFechaCorta(toISO(domingo))}
            </p>
          </div>
          <button
            onClick={abrirNueva}
            style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            + Nueva nómina
          </button>
        </div>

        {/* Navegación semanas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={semanaAnterior}
            style={{ background: 'white', border: '1px solid #d1e0d1', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 16 }}>
            ←
          </button>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#162016', flex: 1, textAlign: 'center' }}>
            Semana del {formatFechaCorta(toISO(lunes))} al {formatFechaCorta(toISO(domingo))}
          </span>
          <button onClick={semanaSiguiente}
            style={{ background: 'white', border: '1px solid #d1e0d1', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 16 }}>
            →
          </button>
          {!esHoy && (
            <button onClick={irAHoy}
              style={{ background: 'white', border: '1px solid #16a34a', borderRadius: 8, padding: '7px 14px', fontSize: 13, color: '#16a34a', cursor: 'pointer', fontWeight: 600 }}>
              Esta semana
            </button>
          )}
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Nóminas', value: nominas.length, color: '#162016' },
            { label: 'Pagos extra', value: formatMonto(totalExtras), color: '#2563eb' },
            { label: 'Total semana', value: formatMonto(totalSemana), color: '#16a34a' },
          ].map(s => (
            <div key={s.label} style={{ background: 'white', borderRadius: 10, border: '1px solid #e5ede5', padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#8fa890', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabla */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'white', border: '1px solid #e5ede5', borderRadius: 12 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #ddeadd', borderTopColor: '#16a34a', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: 14, color: '#8fa890' }}>Cargando…</span>
            </div>
          ) : nominas.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 8 }}>
              <span style={{ fontSize: 32 }}>📋</span>
              <span style={{ fontSize: 14, color: '#8fa890' }}>No hay nóminas esta semana.</span>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5ede5' }}>
                  {['Empleado', 'Periodo', 'Días', 'Pagos extra', 'Total', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 12, fontWeight: 600, color: '#8fa890', background: '#f9fdf9', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nominas.map(n => {
                  const extras = (n.pagos_extra ?? []).reduce((s, p) => s + parseFloat(p.monto), 0)
                  return (
                    <tr
                      key={n.id}
                      onClick={() => setDetalle(n)}
                      style={{ borderBottom: '1px solid #f0f4f0', cursor: 'pointer', background: detalle?.id === n.id ? '#f0fdf4' : 'white', transition: 'background 0.1s' }}
                      onMouseEnter={e => { if (detalle?.id !== n.id) (e.currentTarget as HTMLElement).style.background = '#f9fdf9' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = detalle?.id === n.id ? '#f0fdf4' : 'white' }}
                    >
                      {/* Empleado */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColor(n.empleado), color: 'white', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {initials(n.empleado_nombre)}
                          </div>
                          <span style={{ fontWeight: 600, fontSize: 14, color: '#162016' }}>{n.empleado_nombre}</span>
                        </div>
                      </td>
                      {/* Periodo */}
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151' }}>
                        {formatFechaCorta(n.fecha_inicio)}<br />
                        <span style={{ color: '#8fa890', fontSize: 12 }}>al {formatFechaCorta(n.fecha_fin)}</span>
                      </td>
                      {/* Días */}
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#374151', textAlign: 'center' }}>{n.dias_trabajados}</td>
                      {/* Extras */}
                      <td style={{ padding: '12px 16px', fontSize: 14, color: extras > 0 ? '#2563eb' : '#ccc', fontVariantNumeric: 'tabular-nums' }}>
                        {extras > 0 ? formatMonto(extras) : '—'}
                      </td>
                      {/* Total */}
                      <td style={{ padding: '12px 16px', fontSize: 15, fontWeight: 700, color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>
                        {formatMonto(n.total)}
                      </td>
                      {/* Recibo */}
                      <td style={{ padding: '12px 16px' }}>
                        <button
                          onClick={e => { e.stopPropagation(); abrirRecibo(n) }}
                          style={{ background: 'none', border: '1px solid #d1e0d1', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#374151' }}
                        >
                          Recibo
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Panel derecho: detalle ───────────────────────────── */}
      {detalle && (
        <div style={{ width: 360, borderLeft: '1px solid #e5ede5', background: 'white', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          {/* Header */}
          <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #e5ede5', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: avatarColor(detalle.empleado), color: 'white', fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {initials(detalle.empleado_nombre)}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#162016' }}>{detalle.empleado_nombre}</div>
                <div style={{ fontSize: 12, color: '#8fa890' }}>{formatFechaCorta(detalle.fecha_inicio)} al {formatFechaCorta(detalle.fecha_fin)}</div>
              </div>
            </div>
            <button onClick={() => setDetalle(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#8fa890', lineHeight: 1 }}>×</button>
          </div>

          {/* Desglose */}
          <div style={{ padding: '16px 20px' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8fa890', letterSpacing: '0.06em', marginBottom: 6 }}>DESGLOSE</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f4f0', fontSize: 14 }}>
                <span style={{ color: '#374151' }}>Días trabajados</span>
                <span style={{ fontWeight: 600, color: '#162016' }}>{detalle.dias_trabajados} días</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f4f0', fontSize: 14 }}>
                <span style={{ color: '#374151' }}>Sueldo base</span>
                <span style={{ fontWeight: 600, color: '#162016' }}>
                  {formatMonto(parseFloat(detalle.total) - (detalle.pagos_extra ?? []).reduce((s, p) => s + parseFloat(p.monto), 0))}
                </span>
              </div>
            </div>

            {/* Pagos extra */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#8fa890', letterSpacing: '0.06em' }}>PAGOS EXTRA</div>
                <button
                  onClick={() => abrirPagoExtra(detalle)}
                  style={{ background: 'none', border: '1px solid #16a34a', borderRadius: 6, padding: '3px 10px', fontSize: 11, color: '#16a34a', cursor: 'pointer', fontWeight: 600 }}
                >
                  + Agregar
                </button>
              </div>
              {(detalle.pagos_extra ?? []).length === 0 ? (
                <div style={{ fontSize: 13, color: '#ccc', padding: '8px 0' }}>Sin pagos extra.</div>
              ) : (
                (detalle.pagos_extra ?? []).map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f0f4f0' }}>
                    <span style={{ fontSize: 13, color: '#374151' }}>{p.tipo_nombre}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#2563eb' }}>{formatMonto(p.monto)}</span>
                      <button
                        onClick={() => eliminarPagoExtra(p.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16, lineHeight: 1 }}
                      >×</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Total */}
            <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Total</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>{formatMonto(detalle.total)}</span>
            </div>
          </div>

          {/* Acciones */}
          <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
            <button
              onClick={() => abrirEditar(detalle)}
              style={{ background: '#162016', color: 'white', border: 'none', borderRadius: 8, padding: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Editar nómina
            </button>
            <button
              onClick={() => abrirRecibo(detalle)}
              style={{ background: 'white', border: '1px solid #d1e0d1', borderRadius: 8, padding: 10, fontSize: 14, cursor: 'pointer', color: '#374151' }}
            >
              Ver recibo PDF
            </button>
          </div>
        </div>
      )}

      {/* ── Overlay formulario nómina ────────────────────────── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 480, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#162016' }}>
                {editando ? 'Editar nómina' : 'Nueva nómina'}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#8fa890' }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#8fa890' }}>EMPLEADO *</span>
                <select
                  value={form.empleado} onChange={e => setForm(f => ({ ...f, empleado: e.target.value }))}
                  style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '9px 12px', fontSize: 14, background: 'white', outline: 'none' }}
                >
                  <option value="">Selecciona empleado…</option>
                  {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#8fa890' }}>DÍAS TRABAJADOS</span>
                <input
                  type="number" min="0" max="7"
                  value={form.dias_trabajados} onChange={e => setForm(f => ({ ...f, dias_trabajados: e.target.value }))}
                  placeholder="0"
                  style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none' }}
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#8fa890' }}>FECHA INICIO</span>
                  <input type="date" value={form.fecha_inicio} onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))}
                    style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none' }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#8fa890' }}>FECHA FIN</span>
                  <input type="date" value={form.fecha_fin} onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))}
                    style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none' }} />
                </label>
              </div>
            </div>

            {errorForm && (
              <div style={{ marginTop: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#991b1b' }}>
                {errorForm}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button onClick={() => setShowForm(false)}
                style={{ flex: 1, background: 'white', border: '1px solid #d1e0d1', borderRadius: 8, padding: 10, fontSize: 14, cursor: 'pointer', color: '#374151' }}>
                Cancelar
              </button>
              <button onClick={guardarNomina} disabled={guardando}
                style={{ flex: 2, background: guardando ? '#86efac' : '#16a34a', color: 'white', border: 'none', borderRadius: 8, padding: 10, fontSize: 14, fontWeight: 600, cursor: guardando ? 'not-allowed' : 'pointer' }}>
                {guardando ? 'Guardando…' : (editando ? 'Guardar cambios' : 'Crear nómina')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Overlay agregar pago extra ───────────────────────── */}
      {showPagoExtra && detalle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 400, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#162016' }}>Agregar pago extra</h2>
              <button onClick={() => setShowPagoExtra(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#8fa890' }}>×</button>
            </div>
            <p style={{ fontSize: 13, color: '#8fa890', margin: '0 0 16px' }}>{detalle.empleado_nombre}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#8fa890' }}>TIPO DE PAGO</span>
                <select
                  value={pagoForm.tipo_id}
                  onChange={e => {
                    const tipo = tiposPago.find(t => String(t.id) === e.target.value)
                    setPagoForm({ tipo_id: e.target.value, monto: tipo?.monto ?? '' })
                  }}
                  style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '9px 12px', fontSize: 14, background: 'white', outline: 'none' }}
                >
                  {tiposPago.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#8fa890' }}>MONTO</span>
                <input
                  type="number" min="0" step="0.01"
                  value={pagoForm.monto} onChange={e => setPagoForm(f => ({ ...f, monto: e.target.value }))}
                  style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none' }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button onClick={() => setShowPagoExtra(false)}
                style={{ flex: 1, background: 'white', border: '1px solid #d1e0d1', borderRadius: 8, padding: 10, fontSize: 14, cursor: 'pointer', color: '#374151' }}>
                Cancelar
              </button>
              <button onClick={guardarPagoExtra} disabled={guardandoPago}
                style={{ flex: 2, background: guardandoPago ? '#86efac' : '#16a34a', color: 'white', border: 'none', borderRadius: 8, padding: 10, fontSize: 14, fontWeight: 600, cursor: guardandoPago ? 'not-allowed' : 'pointer' }}>
                {guardandoPago ? 'Guardando…' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
