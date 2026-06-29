import { useEffect, useState } from 'react'
import api from '../../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Parada {
  id: number
  orden: number
  cliente: string
  folio: string
  estado: string
  direccion: string
}

interface RutaEmpleado {
  nombre: string
  es_lider: boolean
}

interface Ruta {
  id: number
  nombre: string
  tipo: string
  estado: string
  fecha: string
  empleados: RutaEmpleado[]
  paradas: Parada[]
  total_paradas: number
  pendientes: number
}

interface RentaDisponible {
  id: number
  folio: string
  cliente: string
  fecha_renta: string
  hora_inicio: string | null
  direccion: string
  estado_entrega: string
}

interface EmpleadoOption {
  id: number
  nombre: string
  tipo_empleado: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalIso(d: Date) {
  return d.toLocaleDateString('sv-SE')
}

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const ESTADO_RUTA: Record<string, { label: string; bg: string; text: string }> = {
  pendiente:  { label: 'Pendiente',  bg: 'bg-amber-100',  text: 'text-amber-700' },
  en_camino:  { label: 'En camino',  bg: 'bg-blue-100',   text: 'text-blue-700'  },
  completada: { label: 'Completada', bg: 'bg-green-100',  text: 'text-green-700' },
}

const ESTADO_PARADA: Record<string, { label: string; bg: string; text: string }> = {
  pendiente: { label: 'Pendiente',  bg: 'bg-gray-100',  text: 'text-gray-600'  },
  entregado: { label: 'Entregado',  bg: 'bg-green-100', text: 'text-green-700' },
  recogido:  { label: 'Recogido',   bg: 'bg-blue-100',  text: 'text-blue-700'  },
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, barColor }: { label: string; value: number; barColor: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex gap-3 items-stretch">
      <div className={`w-1 rounded-full ${barColor} flex-shrink-0`} />
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-400 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Rutas() {
  const [fecha, setFecha] = useState(toLocalIso(new Date()))
  const [rutas, setRutas] = useState<Ruta[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Ruta | null>(null)
  const [showNueva, setShowNueva] = useState(false)

  useEffect(() => {
    cargar()
  }, [fecha])

  const cargar = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/rutas-admin/?fecha=${fecha}`)
      const lista: Ruta[] = res.data
      setRutas(lista)
      if (selected) {
        const updated = lista.find(r => r.id === selected.id)
        setSelected(updated || null)
      }
    } catch {
      console.error('Error cargando rutas')
    } finally {
      setLoading(false)
    }
  }

  const prevDay = () => {
    const d = new Date(fecha + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    setFecha(toLocalIso(d))
    setSelected(null)
  }

  const nextDay = () => {
    const d = new Date(fecha + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    setFecha(toLocalIso(d))
    setSelected(null)
  }

  const total      = rutas.length
  const pendientes = rutas.filter(r => r.estado === 'pendiente').length
  const enCamino   = rutas.filter(r => r.estado === 'en_camino').length
  const completadas = rutas.filter(r => r.estado === 'completada').length

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left pane ─────────────────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col overflow-hidden ${selected ? 'hidden md:flex' : 'flex'}`}>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-gray-900">Rutas</h1>
            <button
              onClick={() => setShowNueva(true)}
              className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
            >
              + Nueva ruta
            </button>
          </div>

          {/* Date nav */}
          <div className="flex items-center gap-3">
            <button onClick={prevDay} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
              ←
            </button>
            <input
              type="date"
              value={fecha}
              onChange={e => { setFecha(e.target.value); setSelected(null) }}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <button onClick={nextDay} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
              →
            </button>
            <span className="text-xs text-gray-400">{formatFecha(fecha)}</span>
          </div>
        </div>

        {/* Stat cards */}
        <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total rutas"  value={total}      barColor="bg-indigo-400" />
          <StatCard label="Pendientes"   value={pendientes} barColor="bg-amber-400"  />
          <StatCard label="En camino"    value={enCamino}   barColor="bg-blue-400"   />
          <StatCard label="Completadas"  value={completadas} barColor="bg-green-400" />
        </div>

        {/* Ruta list */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-gray-400 text-sm">Cargando...</p>
            </div>
          ) : rutas.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🚚</p>
              <p className="text-gray-500 font-medium">Sin rutas para esta fecha</p>
              <p className="text-gray-400 text-sm mt-1">Crea la primera ruta del día</p>
              <button
                onClick={() => setShowNueva(true)}
                className="mt-4 bg-indigo-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700"
              >
                + Nueva ruta
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {rutas.map(ruta => {
                const est = ESTADO_RUTA[ruta.estado] || ESTADO_RUTA.pendiente
                const completadas = ruta.paradas.filter(p => p.estado !== 'pendiente').length
                const progress = ruta.total_paradas > 0
                  ? Math.round((completadas / ruta.total_paradas) * 100)
                  : 0
                const isActive = selected?.id === ruta.id

                return (
                  <div
                    key={ruta.id}
                    onClick={() => setSelected(isActive ? null : ruta)}
                    className={`bg-white rounded-2xl border p-4 cursor-pointer transition-all ${
                      isActive
                        ? 'border-indigo-400 shadow-md'
                        : 'border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-gray-900">{ruta.nombre}</p>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${est.bg} ${est.text}`}>
                        {est.label}
                      </span>
                    </div>

                    {/* Progress bar */}
                    {ruta.total_paradas > 0 && (
                      <div className="mb-2">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>{completadas}/{ruta.total_paradas} paradas</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-400 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Empleados */}
                    {ruta.empleados.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {ruta.empleados.map((e, i) => (
                          <span key={i} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                            {e.es_lider ? '⭐ ' : ''}{e.nombre}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Detail panel ──────────────────────────────────────────────── */}
      {selected && (
        <DetallePanel
          ruta={selected}
          fecha={fecha}
          onClose={() => setSelected(null)}
          onRefresh={cargar}
        />
      )}

      {/* ── Nueva ruta panel ──────────────────────────────────────────── */}
      {showNueva && (
        <NuevaRutaPanel
          fecha={fecha}
          onClose={() => setShowNueva(false)}
          onCreada={() => { setShowNueva(false); cargar() }}
        />
      )}
    </div>
  )
}

// ── Detail panel ───────────────────────────────────────────────────────────────

function DetallePanel({ ruta, fecha, onClose, onRefresh }: {
  ruta: Ruta
  fecha: string
  onClose: () => void
  onRefresh: () => void
}) {
  const [rentasDisponibles, setRentasDisponibles] = useState<RentaDisponible[]>([])
  const [showAgregar, setShowAgregar] = useState(false)
  const [showEditar, setShowEditar] = useState(false)
  const [loadingRentas, setLoadingRentas] = useState(false)
  const [cambiandoEstado, setCambiandoEstado] = useState(false)

  const cargarRentasDisponibles = async () => {
    setLoadingRentas(true)
    try {
      const res = await api.get(`/rentas-disponibles/?fecha=${fecha}&ruta_id=${ruta.id}`)
      setRentasDisponibles(res.data)
    } catch {
      console.error('Error cargando rentas')
    } finally {
      setLoadingRentas(false)
    }
  }

  const abrirAgregar = () => {
    setShowAgregar(true)
    cargarRentasDisponibles()
  }

  const agregarParada = async (rentaId: number) => {
    try {
      await api.post(`/rutas-admin/${ruta.id}/parada/`, { renta_id: rentaId })
      await onRefresh()
      setRentasDisponibles(prev => prev.filter(r => r.id !== rentaId))
    } catch {
      alert('Error al agregar parada')
    }
  }

  const eliminarParada = async (paradaId: number) => {
    if (!confirm('¿Eliminar esta parada?')) return
    try {
      await api.delete(`/rutas-admin/parada/${paradaId}/eliminar/`)
      await onRefresh()
    } catch {
      alert('No se pudo eliminar la parada')
    }
  }

  const cambiarEstado = async (nuevoEstado: string) => {
    if (ruta.estado === nuevoEstado) return
    setCambiandoEstado(true)
    try {
      await api.patch(`/rutas-admin/${ruta.id}/editar/`, { estado: nuevoEstado })
      await onRefresh()
    } catch {
      alert('Error al cambiar estado')
    } finally {
      setCambiandoEstado(false)
    }
  }

  return (
    <>
      <div className="w-full md:w-[420px] border-l border-gray-100 bg-white flex flex-col overflow-hidden">
        {/* Panel header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h2 className="font-bold text-gray-900 text-lg leading-tight">{ruta.nombre}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{ruta.fecha}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditar(true)}
              className="text-xs text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-xl hover:bg-indigo-50"
            >
              Editar
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

          {/* Estado */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">ESTADO DE LA RUTA</p>
            <div className="flex gap-2">
              {(['pendiente', 'en_camino', 'completada'] as const).map(e => {
                const info = ESTADO_RUTA[e]
                const active = ruta.estado === e
                return (
                  <button
                    key={e}
                    onClick={() => cambiarEstado(e)}
                    disabled={cambiandoEstado}
                    className={`flex-1 text-xs py-2 rounded-xl font-medium transition-all border ${
                      active
                        ? `${info.bg} ${info.text} border-transparent`
                        : 'text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {info.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Empleados */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">EQUIPO</p>
            {ruta.empleados.length === 0 ? (
              <p className="text-sm text-gray-400">Sin repartidores asignados</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {ruta.empleados.map((e, i) => (
                  <span key={i} className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full">
                    {e.es_lider ? '⭐ ' : ''}{e.nombre}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Paradas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-500">PARADAS ({ruta.paradas.length})</p>
              <button
                onClick={abrirAgregar}
                className="text-xs text-indigo-600 font-medium hover:underline"
              >
                + Agregar
              </button>
            </div>

            {ruta.paradas.length === 0 ? (
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-sm text-gray-400">Sin paradas aún</p>
                <button
                  onClick={abrirAgregar}
                  className="mt-2 text-xs text-indigo-600 font-medium hover:underline"
                >
                  Agregar pedidos a esta ruta
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {ruta.paradas.map(p => {
                  const est = ESTADO_PARADA[p.estado] || ESTADO_PARADA.pendiente
                  return (
                    <div key={p.id} className="bg-gray-50 rounded-xl p-3 flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {p.orden}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 truncate">{p.cliente}</p>
                        <p className="text-xs text-gray-400">{p.folio}</p>
                        <p className="text-xs text-gray-400 truncate">📍 {p.direccion}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${est.bg} ${est.text}`}>
                          {est.label}
                        </span>
                        {p.estado === 'pendiente' && (
                          <button
                            onClick={() => eliminarParada(p.id)}
                            className="text-xs text-red-400 hover:text-red-600"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Agregar parada overlay */}
      {showAgregar && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center">
          <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-3xl max-h-[80vh] overflow-y-auto px-5 py-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-900">Agregar pedido</h3>
              <button onClick={() => setShowAgregar(false)} className="text-gray-400 text-2xl">×</button>
            </div>
            {loadingRentas ? (
              <p className="text-gray-400 text-sm text-center py-6">Cargando pedidos...</p>
            ) : rentasDisponibles.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">
                No hay pedidos disponibles para esta fecha y tipo.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {rentasDisponibles.map(r => {
                  const esRecogida = r.estado_entrega === 'ENTREGADO'
                  return (
                    <div key={r.id} className="bg-gray-50 rounded-xl p-3 flex justify-between items-center gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-medium text-sm text-gray-900 truncate">{r.cliente}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                            esRecogida
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-amber-100 text-amber-600'
                          }`}>
                            {esRecogida ? '🔄 Recoger' : '📦 Entregar'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">{r.folio} · {r.fecha_renta}{r.hora_inicio ? ` · ${r.hora_inicio}` : ''}</p>
                        <p className="text-xs text-gray-400 truncate">📍 {r.direccion}</p>
                      </div>
                      <button
                        onClick={() => agregarParada(r.id)}
                        className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-xl font-medium whitespace-nowrap hover:bg-indigo-700"
                      >
                        + Agregar
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Editar ruta overlay */}
      {showEditar && (
        <EditarRutaOverlay
          ruta={ruta}
          onClose={() => setShowEditar(false)}
          onGuardada={() => { setShowEditar(false); onRefresh() }}
        />
      )}
    </>
  )
}

// ── Nueva ruta panel ──────────────────────────────────────────────────────────

function NuevaRutaPanel({ fecha, onClose, onCreada }: {
  fecha: string
  onClose: () => void
  onCreada: () => void
}) {
  const [nombre, setNombre]           = useState('')
  const [fechaRuta, setFechaRuta]     = useState(fecha)
  const [notas, setNotas]             = useState('')
  const [empleados, setEmpleados]     = useState<EmpleadoOption[]>([])
  const [seleccionados, setSeleccionados] = useState<number[]>([])
  const [lider, setLider]             = useState<number | ''>('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    api.get('/empleados/?tipo_empleado=REPARTIDOR').then(res => {
      setEmpleados(res.data.results || res.data)
    })
  }, [])

  const toggleEmp = (id: number) => {
    setSeleccionados(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    )
    if (lider === id) setLider('')
  }

  const crear = async () => {
    if (!nombre.trim()) { setError('El nombre es requerido.'); return }
    setLoading(true); setError('')
    try {
      await api.post('/rutas-admin/crear/', {
        nombre: nombre.trim(),
        fecha: fechaRuta,
        notas,
        empleados: seleccionados,
        lider_id: lider || null,
      })
      onCreada()
    } catch {
      setError('Error al crear la ruta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center">
      <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-3xl max-h-[90vh] overflow-y-auto px-5 py-5">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-gray-900 text-lg">Nueva ruta</h3>
          <button onClick={onClose} className="text-gray-400 text-2xl">×</button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">NOMBRE</label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Ruta Norte"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">FECHA</label>
            <input
              type="date"
              value={fechaRuta}
              onChange={e => setFechaRuta(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">REPARTIDORES</label>
            <div className="border border-gray-200 rounded-xl p-3 max-h-40 overflow-y-auto flex flex-col gap-2">
              {empleados.length === 0 ? (
                <p className="text-sm text-gray-400">Cargando...</p>
              ) : empleados.map(emp => (
                <label key={emp.id} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={seleccionados.includes(emp.id)}
                    onChange={() => toggleEmp(emp.id)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm text-gray-800">{emp.nombre}</span>
                </label>
              ))}
            </div>
          </div>

          {seleccionados.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">LÍDER</label>
              <select
                value={lider}
                onChange={e => setLider(e.target.value ? Number(e.target.value) : '')}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="">Sin líder</option>
                {seleccionados.map(id => {
                  const emp = empleados.find(e => e.id === id)
                  return emp ? <option key={id} value={id}>{emp.nombre}</option> : null
                })}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">NOTAS (OPCIONAL)</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={2}
              placeholder="Instrucciones especiales..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

        <button
          onClick={crear}
          disabled={loading}
          className="mt-5 w-full bg-indigo-600 text-white py-3 rounded-2xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Creando...' : 'Crear ruta'}
        </button>
      </div>
    </div>
  )
}

// ── Editar ruta overlay ────────────────────────────────────────────────────────

function EditarRutaOverlay({ ruta, onClose, onGuardada }: {
  ruta: Ruta
  onClose: () => void
  onGuardada: () => void
}) {
  const [nombre, setNombre]           = useState(ruta.nombre)
  const [fecha, setFecha]             = useState(ruta.fecha)
  const [notas, setNotas]             = useState('')
  const [empleados, setEmpleados]     = useState<EmpleadoOption[]>([])
  const [seleccionados, setSeleccionados] = useState<number[]>([])
  const [lider, setLider]             = useState<number | ''>('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    api.get('/empleados/?tipo_empleado=REPARTIDOR').then(res => {
      const lista: EmpleadoOption[] = res.data.results || res.data
      setEmpleados(lista)
      const nombresActuales = ruta.empleados.map(e => e.nombre)
      const idsActuales = lista.filter(e => nombresActuales.includes(e.nombre)).map(e => e.id)
      setSeleccionados(idsActuales)
      const liderActual = ruta.empleados.find(e => e.es_lider)
      if (liderActual) {
        const empLider = lista.find(e => e.nombre === liderActual.nombre)
        if (empLider) setLider(empLider.id)
      }
    })
  }, [])

  const toggleEmp = (id: number) => {
    setSeleccionados(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    )
  }

  const guardar = async () => {
    if (!nombre.trim()) { setError('El nombre es requerido.'); return }
    setLoading(true); setError('')
    try {
      await api.patch(`/rutas-admin/${ruta.id}/editar/`, {
        nombre: nombre.trim(),
        fecha,
        notas,
        empleados: seleccionados,
        lider_id: lider || null,
      })
      onGuardada()
    } catch {
      setError('Error al guardar los cambios.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center">
      <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-3xl max-h-[90vh] overflow-y-auto px-5 py-5">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-gray-900 text-lg">Editar ruta</h3>
          <button onClick={onClose} className="text-gray-400 text-2xl">×</button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">NOMBRE</label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">FECHA</label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">REPARTIDORES</label>
            <div className="border border-gray-200 rounded-xl p-3 max-h-40 overflow-y-auto flex flex-col gap-2">
              {empleados.length === 0 ? (
                <p className="text-sm text-gray-400">Cargando...</p>
              ) : empleados.map(emp => (
                <label key={emp.id} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={seleccionados.includes(emp.id)}
                    onChange={() => toggleEmp(emp.id)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm text-gray-800">{emp.nombre}</span>
                </label>
              ))}
            </div>
          </div>

          {seleccionados.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">LÍDER</label>
              <select
                value={lider}
                onChange={e => setLider(e.target.value ? Number(e.target.value) : '')}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="">Sin líder</option>
                {seleccionados.map(id => {
                  const emp = empleados.find(e => e.id === id)
                  return emp ? <option key={id} value={id}>{emp.nombre}</option> : null
                })}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">NOTAS (OPCIONAL)</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={2}
              placeholder="Instrucciones especiales..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

        <button
          onClick={guardar}
          disabled={loading}
          className="mt-5 w-full bg-indigo-600 text-white py-3 rounded-2xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}
