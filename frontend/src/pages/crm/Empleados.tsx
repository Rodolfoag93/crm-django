import { useEffect, useState, useCallback, useMemo } from 'react'
import api from '../../lib/api'

interface Empleado {
  id: number
  nombre: string
  telefono: string
  correo: string | null
  tipo_empleado: string
  activo: boolean
  sueldo_diario: string
  comentarios: string | null
  es_eventual: boolean
  usuario_username: string | null
}

const TIPOS: Record<string, string> = {
  REPARTIDOR: 'Repartidor',
  COORDINADOR: 'Coordinador',
  ENCARGADO: 'Encargado de Material',
  ANIMADOR: 'Animador',
}

const TIPO_COLORS: Record<string, { bg: string; text: string }> = {
  REPARTIDOR:  { bg: '#dbeafe', text: '#1d4ed8' },
  COORDINADOR: { bg: '#fef9c3', text: '#854d0e' },
  ENCARGADO:   { bg: '#dcfce7', text: '#166534' },
  ANIMADOR:    { bg: '#fce7f3', text: '#9d174d' },
}

const AVATAR_COLORS = ['#16a34a', '#2563eb', '#9333ea', '#db2777', '#ea580c', '#0891b2']

function initials(nombre: string) {
  return nombre.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}
function avatarColor(id: number) { return AVATAR_COLORS[id % AVATAR_COLORS.length] }

const FORM_EMPTY = {
  nombre: '', telefono: '', correo: '', tipo_empleado: 'REPARTIDOR',
  sueldo_diario: '', comentarios: '', es_eventual: false, activo: true,
}

// ── Helpers de fecha ───────────────────────────────────────────────────────────
function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function sumarDias(iso: string, dias: number) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function formatFechaLarga(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function extractHora(isoStr: string | null) {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleTimeString('es-MX', {
      timeZone: 'America/Mexico_City',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return ''
  }
}

// ── Interfaces asistencia ──────────────────────────────────────────────────────
interface RegistroAsistencia {
  empleado_id: number
  nombre: string
  tipo: string
  tiene_entrada: boolean
  tiene_salida: boolean
  hora_entrada: string | null
  hora_salida: string | null
  horas_trabajadas: string | null
}

interface AsistenciaData {
  fecha: string
  total: number
  con_entrada: number
  con_salida: number
  empleados: RegistroAsistencia[]
}

export default function Empleados() {
  const [tab, setTab] = useState<'empleados' | 'asistencia'>('empleados')

  // ── Estado empleados ───────────────────────────────────────────────────────
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [detalle, setDetalle] = useState<Empleado | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<Empleado | null>(null)
  const [form, setForm] = useState({ ...FORM_EMPTY })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  // ── Estado asistencia ──────────────────────────────────────────────────────
  const [fechaAsist, setFechaAsist] = useState(hoyISO())
  const [asistData, setAsistData] = useState<AsistenciaData | null>(null)
  const [loadingAsist, setLoadingAsist] = useState(false)
  const [modalAsist, setModalAsist] = useState<RegistroAsistencia | null>(null)
  const [editEntrada, setEditEntrada] = useState('')
  const [editSalida, setEditSalida] = useState('')
  const [guardandoAsist, setGuardandoAsist] = useState(false)
  const [errorAsist, setErrorAsist] = useState('')

  const cargarAsistencia = useCallback(() => {
    setLoadingAsist(true)
    api.get('/asistencia-hoy/', { params: { fecha: fechaAsist } })
      .then(r => setAsistData(r.data))
      .catch(console.error)
      .finally(() => setLoadingAsist(false))
  }, [fechaAsist])

  useEffect(() => { if (tab === 'asistencia') cargarAsistencia() }, [tab, cargarAsistencia])

  const ausentes = useMemo(() =>
    asistData ? asistData.total - asistData.con_entrada : 0
  , [asistData])

  function abrirModalAsist(r: RegistroAsistencia) {
    setModalAsist(r)
    setEditEntrada(extractHora(r.hora_entrada))
    setEditSalida(extractHora(r.hora_salida))
    setErrorAsist('')
  }

  async function guardarAsistencia() {
    if (!modalAsist) return
    if (!editEntrada) { setErrorAsist('La hora de entrada es requerida.'); return }
    setGuardandoAsist(true); setErrorAsist('')
    try {
      await api.post('/asistencia/editar/', {
        empleado_id: modalAsist.empleado_id,
        fecha: fechaAsist,
        hora_entrada: editEntrada,
        hora_salida: editSalida || null,
      })
      setModalAsist(null)
      cargarAsistencia()
    } catch {
      setErrorAsist('Error al guardar.')
    } finally {
      setGuardandoAsist(false)
    }
  }

  const cargar = useCallback(() => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (busqueda) params.search = busqueda
    if (filtroTipo) params.tipo_empleado = filtroTipo
    api.get('/empleados/', { params })
      .then(r => {
        const data = Array.isArray(r.data) ? r.data : (r.data.results ?? [])
        setEmpleados(data)
      })
      .finally(() => setLoading(false))
  }, [busqueda, filtroTipo])

  useEffect(() => { cargar() }, [cargar])

  // Stats derivados
  const stats = {
    total: empleados.length,
    repartidores: empleados.filter(e => e.tipo_empleado === 'REPARTIDOR').length,
    encargados: empleados.filter(e => e.tipo_empleado === 'ENCARGADO').length,
    animadores: empleados.filter(e => e.tipo_empleado === 'ANIMADOR').length,
    coordinadores: empleados.filter(e => e.tipo_empleado === 'COORDINADOR').length,
  }

  function abrirNuevo() {
    setEditando(null)
    setForm({ ...FORM_EMPTY })
    setError('')
    setShowForm(true)
  }

  function abrirEditar(emp: Empleado) {
    setEditando(emp)
    setForm({
      nombre: emp.nombre,
      telefono: emp.telefono ?? '',
      correo: emp.correo ?? '',
      tipo_empleado: emp.tipo_empleado,
      sueldo_diario: emp.sueldo_diario ?? '',
      comentarios: emp.comentarios ?? '',
      es_eventual: emp.es_eventual,
      activo: emp.activo,
    })
    setError('')
    setShowForm(true)
  }

  async function guardar() {
    if (!form.nombre.trim()) { setError('El nombre es requerido.'); return }
    setGuardando(true); setError('')
    try {
      const payload = {
        nombre: form.nombre.trim(),
        telefono: form.telefono.trim(),
        correo: form.correo.trim() || null,
        tipo_empleado: form.tipo_empleado,
        sueldo_diario: parseFloat(form.sueldo_diario) || 0,
        comentarios: form.comentarios.trim() || null,
        es_eventual: form.es_eventual,
        activo: form.activo,
      }
      if (editando) {
        const res = await api.patch(`/empleados/${editando.id}/`, payload)
        setDetalle(res.data)
      } else {
        await api.post('/empleados/', payload)
      }
      setShowForm(false)
      cargar()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: Record<string, string[]> } })?.response?.data
      if (msg) {
        const first = Object.values(msg).flat()[0]
        setError(typeof first === 'string' ? first : 'Error al guardar.')
      } else {
        setError('Error al guardar.')
      }
    } finally {
      setGuardando(false)
    }
  }

  const tc = (e: Empleado) => TIPO_COLORS[e.tipo_empleado] ?? { bg: '#f3f4f6', text: '#374151' }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* ── Panel izquierdo ────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '24px' }}>

        {/* Pestañas */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e5ede5', paddingBottom: 0 }}>
          {(['empleados', 'asistencia'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 20px', fontSize: 14, fontWeight: tab === t ? 700 : 500,
                color: tab === t ? '#16a34a' : '#8fa890',
                borderBottom: tab === t ? '2px solid #16a34a' : '2px solid transparent',
                marginBottom: -2, textTransform: 'capitalize',
              }}
            >
              {t === 'empleados' ? 'Empleados' : 'Asistencia'}
            </button>
          ))}
        </div>

        {/* ── VISTA ASISTENCIA ───────────────────────────── */}
        {tab === 'asistencia' && (
          <>
            {/* Navegación fecha */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <button onClick={() => setFechaAsist(sumarDias(fechaAsist, -1))}
                style={{ background: 'white', border: '1px solid #d1e0d1', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 16 }}>
                ←
              </button>
              <input type="date" value={fechaAsist} onChange={e => setFechaAsist(e.target.value)}
                style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '7px 12px', fontSize: 14, outline: 'none' }} />
              <button onClick={() => setFechaAsist(sumarDias(fechaAsist, 1))}
                style={{ background: 'white', border: '1px solid #d1e0d1', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 16 }}>
                →
              </button>
              <span style={{ fontSize: 14, color: '#8fa890', flex: 1 }}>{formatFechaLarga(fechaAsist)}</span>
              {fechaAsist !== hoyISO() && (
                <button onClick={() => setFechaAsist(hoyISO())}
                  style={{ background: 'white', border: '1px solid #16a34a', borderRadius: 8, padding: '7px 14px', fontSize: 13, color: '#16a34a', cursor: 'pointer', fontWeight: 600 }}>
                  Hoy
                </button>
              )}
            </div>

            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Total', value: asistData?.total ?? '—', color: '#162016' },
                { label: 'Presentes', value: asistData?.con_entrada ?? '—', color: '#16a34a' },
                { label: 'Ausentes', value: ausentes || (asistData ? 0 : '—'), color: '#dc2626' },
              ].map(s => (
                <div key={s.label} style={{ background: 'white', borderRadius: 10, border: '1px solid #e5ede5', padding: '14px 16px' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: '#8fa890', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Tabla asistencia */}
            <div style={{ flex: 1, overflowY: 'auto', background: 'white', border: '1px solid #e5ede5', borderRadius: 12 }}>
              {loadingAsist ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #ddeadd', borderTopColor: '#16a34a', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ fontSize: 14, color: '#8fa890' }}>Cargando…</span>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5ede5' }}>
                      {['Empleado', 'Tipo', 'Entrada', 'Salida', 'Horas', 'Estado', ''].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 12, fontWeight: 600, color: '#8fa890', background: '#f9fdf9', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(asistData?.empleados ?? []).map(r => {
                      const estado = r.tiene_entrada && r.tiene_salida ? 'completo'
                        : r.tiene_entrada ? 'en_turno' : 'ausente'
                      const estadoColor = { completo: { bg: '#dcfce7', text: '#166534', label: 'Completo' }, en_turno: { bg: '#fef9c3', text: '#854d0e', label: 'En turno' }, ausente: { bg: '#fee2e2', text: '#991b1b', label: 'Ausente' } }[estado]
                      return (
                        <tr key={r.empleado_id} style={{
                          borderBottom: '1px solid #f0f4f0',
                          background: estado === 'ausente' ? '#fff9f9' : estado === 'en_turno' ? '#fffef0' : 'white',
                        }}>
                          <td style={{ padding: '11px 16px', fontWeight: 600, fontSize: 14, color: '#162016' }}>{r.nombre}</td>
                          <td style={{ padding: '11px 16px', fontSize: 13, color: '#8fa890' }}>{r.tipo}</td>
                          <td style={{ padding: '11px 16px', fontSize: 14, fontVariantNumeric: 'tabular-nums', color: '#374151' }}>
                            {extractHora(r.hora_entrada) || <span style={{ color: '#ccc' }}>—</span>}
                          </td>
                          <td style={{ padding: '11px 16px', fontSize: 14, fontVariantNumeric: 'tabular-nums', color: '#374151' }}>
                            {extractHora(r.hora_salida) || <span style={{ color: '#ccc' }}>—</span>}
                          </td>
                          <td style={{ padding: '11px 16px', fontSize: 14, color: '#374151' }}>
                            {r.horas_trabajadas ? `${parseFloat(r.horas_trabajadas).toFixed(1)} hrs` : <span style={{ color: '#ccc' }}>—</span>}
                          </td>
                          <td style={{ padding: '11px 16px' }}>
                            <span style={{ background: estadoColor.bg, color: estadoColor.text, borderRadius: 6, padding: '3px 9px', fontSize: 12, fontWeight: 600 }}>
                              {estadoColor.label}
                            </span>
                          </td>
                          <td style={{ padding: '11px 16px' }}>
                            <button
                              onClick={() => abrirModalAsist(r)}
                              style={{ background: 'none', border: '1px solid #d1e0d1', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', color: '#374151' }}>
                              Editar
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {asistData?.empleados.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#8fa890', fontSize: 14 }}>Sin registros para esta fecha.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ── VISTA EMPLEADOS ────────────────────────────── */}
        {tab === 'empleados' && (<>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#162016', margin: 0 }}>Empleados</h1>
            <p style={{ fontSize: 13, color: '#8fa890', margin: 0 }}>{empleados.length} activos</p>
          </div>
          <button
            onClick={abrirNuevo}
            style={{
              background: '#16a34a', color: 'white', border: 'none',
              borderRadius: 8, padding: '9px 18px', fontSize: 14,
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Nuevo empleado
          </button>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total', value: stats.total, color: '#162016' },
            { label: 'Repartidores', value: stats.repartidores, color: '#1d4ed8' },
            { label: 'Encargados', value: stats.encargados, color: '#166534' },
            { label: 'Animadores', value: stats.animadores, color: '#9d174d' },
            { label: 'Coordinadores', value: stats.coordinadores, color: '#854d0e' },
          ].map(s => (
            <div key={s.label} style={{
              background: 'white', borderRadius: 10, border: '1px solid #e5ede5',
              padding: '14px 16px',
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#8fa890', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Búsqueda + filtro tipo */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input
            placeholder="Buscar por nombre..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{
              flex: 1, border: '1px solid #d1e0d1', borderRadius: 8,
              padding: '8px 12px', fontSize: 14, outline: 'none',
            }}
          />
          <select
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
            style={{
              border: '1px solid #d1e0d1', borderRadius: 8, padding: '8px 12px',
              fontSize: 14, background: 'white', outline: 'none', minWidth: 160,
            }}
          >
            <option value="">Todos los tipos</option>
            {Object.entries(TIPOS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Tabla */}
        <div style={{
          flex: 1, overflowY: 'auto', background: 'white',
          border: '1px solid #e5ede5', borderRadius: 12,
        }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10 }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                border: '2px solid #ddeadd', borderTopColor: '#16a34a', animation: 'spin 0.8s linear infinite',
              }} />
              <span style={{ fontSize: 14, color: '#8fa890' }}>Cargando…</span>
            </div>
          ) : empleados.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
              <span style={{ fontSize: 14, color: '#8fa890' }}>No hay empleados.</span>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5ede5' }}>
                  {['Empleado', 'Tipo', 'Teléfono', 'Sueldo diario', 'Usuario PWA', 'Estado'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '10px 16px',
                      fontSize: 12, fontWeight: 600, color: '#8fa890',
                      background: '#f9fdf9', letterSpacing: '0.04em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {empleados.map(emp => (
                  <tr
                    key={emp.id}
                    onClick={() => setDetalle(emp)}
                    style={{
                      borderBottom: '1px solid #f0f4f0', cursor: 'pointer',
                      background: detalle?.id === emp.id ? '#f0fdf4' : 'white',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (detalle?.id !== emp.id) (e.currentTarget as HTMLElement).style.background = '#f9fdf9' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = detalle?.id === emp.id ? '#f0fdf4' : 'white' }}
                  >
                    {/* Nombre + avatar */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: '50%',
                          background: avatarColor(emp.id),
                          color: 'white', fontWeight: 700, fontSize: 13,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {initials(emp.nombre)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: '#162016' }}>{emp.nombre}</div>
                          {emp.es_eventual && (
                            <div style={{ fontSize: 11, color: '#8fa890' }}>Eventual</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Tipo */}
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        background: tc(emp).bg, color: tc(emp).text,
                        borderRadius: 6, padding: '3px 9px', fontSize: 12, fontWeight: 600,
                      }}>
                        {TIPOS[emp.tipo_empleado] ?? emp.tipo_empleado}
                      </span>
                    </td>

                    {/* Teléfono */}
                    <td style={{ padding: '12px 16px', fontSize: 14, color: '#374151' }}>
                      {emp.telefono || <span style={{ color: '#ccc' }}>—</span>}
                    </td>

                    {/* Sueldo */}
                    <td style={{ padding: '12px 16px', fontSize: 14, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                      ${parseFloat(emp.sueldo_diario).toLocaleString('es-MX')}/día
                    </td>

                    {/* Usuario PWA */}
                    <td style={{ padding: '12px 16px' }}>
                      {emp.usuario_username ? (
                        <span style={{
                          background: '#dcfce7', color: '#166534',
                          borderRadius: 6, padding: '3px 9px', fontSize: 12, fontWeight: 500,
                        }}>
                          {emp.usuario_username}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#ccc' }}>Sin cuenta</span>
                      )}
                    </td>

                    {/* Estado */}
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        background: emp.activo ? '#dcfce7' : '#fee2e2',
                        color: emp.activo ? '#166534' : '#991b1b',
                        borderRadius: 6, padding: '3px 9px', fontSize: 12, fontWeight: 500,
                      }}>
                        {emp.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </>)}
      </div>

      {/* ── Panel derecho: detalle ─────────────────────────── */}
      {detalle && (
        <div style={{
          width: 340, borderLeft: '1px solid #e5ede5', background: 'white',
          display: 'flex', flexDirection: 'column', overflowY: 'auto',
        }}>
          {/* Header detalle */}
          <div style={{
            padding: '20px 20px 16px', borderBottom: '1px solid #e5ede5',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: avatarColor(detalle.id), color: 'white',
                fontWeight: 700, fontSize: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {initials(detalle.nombre)}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#162016' }}>{detalle.nombre}</div>
                <span style={{
                  background: tc(detalle).bg, color: tc(detalle).text,
                  borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600,
                }}>
                  {TIPOS[detalle.tipo_empleado] ?? detalle.tipo_empleado}
                </span>
              </div>
            </div>
            <button
              onClick={() => setDetalle(null)}
              style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#8fa890', lineHeight: 1 }}
            >×</button>
          </div>

          {/* Datos */}
          <div style={{ padding: '16px 20px', flex: 1 }}>
            {[
              { label: 'Teléfono', value: detalle.telefono || '—' },
              { label: 'Correo', value: detalle.correo || '—' },
              { label: 'Sueldo diario', value: `$${parseFloat(detalle.sueldo_diario).toLocaleString('es-MX')}` },
              { label: 'Usuario PWA', value: detalle.usuario_username || 'Sin cuenta' },
            ].map(row => (
              <div key={row.label} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#8fa890', letterSpacing: '0.06em', marginBottom: 2 }}>
                  {row.label.toUpperCase()}
                </div>
                <div style={{ fontSize: 14, color: '#162016' }}>{row.value}</div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#8fa890', letterSpacing: '0.06em', marginBottom: 2 }}>ESTADO</div>
                <span style={{
                  background: detalle.activo ? '#dcfce7' : '#fee2e2',
                  color: detalle.activo ? '#166534' : '#991b1b',
                  borderRadius: 6, padding: '3px 9px', fontSize: 12, fontWeight: 500,
                }}>
                  {detalle.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              {detalle.es_eventual && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8fa890', letterSpacing: '0.06em', marginBottom: 2 }}>TIPO</div>
                  <span style={{
                    background: '#fef3c7', color: '#92400e',
                    borderRadius: 6, padding: '3px 9px', fontSize: 12, fontWeight: 500,
                  }}>Eventual</span>
                </div>
              )}
            </div>

            {detalle.comentarios && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#8fa890', letterSpacing: '0.06em', marginBottom: 4 }}>COMENTARIOS</div>
                <div style={{
                  fontSize: 13, color: '#374151', background: '#f9fdf9',
                  borderRadius: 8, padding: '10px 12px', lineHeight: 1.5,
                }}>
                  {detalle.comentarios}
                </div>
              </div>
            )}
          </div>

          {/* Botón editar */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid #e5ede5' }}>
            <button
              onClick={() => abrirEditar(detalle)}
              style={{
                width: '100%', background: '#162016', color: 'white', border: 'none',
                borderRadius: 8, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Editar empleado
            </button>
          </div>
        </div>
      )}

      {/* ── Overlay formulario ─────────────────────────────── */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: 20,
        }}>
          <div style={{
            background: 'white', borderRadius: 16, width: '100%', maxWidth: 500,
            maxHeight: '90vh', overflowY: 'auto', padding: 28,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#162016' }}>
                {editando ? 'Editar empleado' : 'Nuevo empleado'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#8fa890' }}
              >×</button>
            </div>

            {/* Campos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#8fa890' }}>NOMBRE *</span>
                <input
                  value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Nombre completo"
                  style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#8fa890' }}>TIPO</span>
                <select
                  value={form.tipo_empleado} onChange={e => setForm(f => ({ ...f, tipo_empleado: e.target.value }))}
                  style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '9px 12px', fontSize: 14, background: 'white', outline: 'none' }}
                >
                  {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#8fa890' }}>TELÉFONO</span>
                  <input
                    value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                    placeholder="Teléfono"
                    style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#8fa890' }}>SUELDO DIARIO</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.sueldo_diario} onChange={e => setForm(f => ({ ...f, sueldo_diario: e.target.value }))}
                    placeholder="0.00"
                    style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none' }}
                  />
                </label>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#8fa890' }}>CORREO</span>
                <input
                  type="email"
                  value={form.correo} onChange={e => setForm(f => ({ ...f, correo: e.target.value }))}
                  placeholder="correo@ejemplo.com"
                  style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#8fa890' }}>COMENTARIOS</span>
                <textarea
                  rows={3}
                  value={form.comentarios} onChange={e => setForm(f => ({ ...f, comentarios: e.target.value }))}
                  placeholder="Notas sobre el empleado (opcional)"
                  style={{
                    border: '1px solid #d1e0d1', borderRadius: 8, padding: '9px 12px',
                    fontSize: 14, outline: 'none', resize: 'vertical',
                  }}
                />
              </label>

              <div style={{ display: 'flex', gap: 24 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#162016' }}>
                  <input
                    type="checkbox" checked={form.es_eventual}
                    onChange={e => setForm(f => ({ ...f, es_eventual: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: '#16a34a' }}
                  />
                  Empleado eventual
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#162016' }}>
                  <input
                    type="checkbox" checked={form.activo}
                    onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: '#16a34a' }}
                  />
                  Activo
                </label>
              </div>
            </div>

            {error && (
              <div style={{
                marginTop: 16, background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#991b1b',
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  flex: 1, background: 'white', border: '1px solid #d1e0d1',
                  borderRadius: 8, padding: '10px', fontSize: 14, cursor: 'pointer', color: '#374151',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={guardando}
                style={{
                  flex: 2, background: guardando ? '#86efac' : '#16a34a', color: 'white',
                  border: 'none', borderRadius: 8, padding: '10px', fontSize: 14,
                  fontWeight: 600, cursor: guardando ? 'not-allowed' : 'pointer',
                }}
              >
                {guardando ? 'Guardando…' : (editando ? 'Guardar cambios' : 'Crear empleado')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal editar asistencia ──────────────────────── */}
      {modalAsist && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 420, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#162016' }}>Editar asistencia</h2>
                <p style={{ margin: 0, fontSize: 13, color: '#8fa890' }}>{modalAsist.nombre} · {formatFechaLarga(fechaAsist)}</p>
              </div>
              <button onClick={() => setModalAsist(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#8fa890' }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#8fa890' }}>HORA ENTRADA *</span>
                <input type="time" value={editEntrada} onChange={e => setEditEntrada(e.target.value)}
                  style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '9px 12px', fontSize: 15, outline: 'none' }} />
              </label>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#8fa890' }}>HORA SALIDA</span>
                <input type="time" value={editSalida} onChange={e => setEditSalida(e.target.value)}
                  style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '9px 12px', fontSize: 15, outline: 'none' }} />
              </label>
            </div>

            {errorAsist && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#991b1b', marginBottom: 14 }}>
                {errorAsist}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModalAsist(null)}
                style={{ flex: 1, background: 'white', border: '1px solid #d1e0d1', borderRadius: 8, padding: 10, fontSize: 14, cursor: 'pointer', color: '#374151' }}>
                Cancelar
              </button>
              <button onClick={guardarAsistencia} disabled={guardandoAsist}
                style={{ flex: 2, background: guardandoAsist ? '#86efac' : '#16a34a', color: 'white', border: 'none', borderRadius: 8, padding: 10, fontSize: 14, fontWeight: 600, cursor: guardandoAsist ? 'not-allowed' : 'pointer' }}>
                {guardandoAsist ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
