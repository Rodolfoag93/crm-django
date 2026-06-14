import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'

interface Parada {
  id: number
  orden: number
  cliente: string
  folio: string
  estado: string
  direccion: string
}

interface Empleado {
  nombre: string
  es_lider: boolean
}

interface Ruta {
  id: number
  nombre: string
  tipo: string
  estado: string
  fecha: string
  empleados: Empleado[]
  paradas: Parada[]
  total_paradas: number
  pendientes: number
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'bg-gray-100 text-gray-600',
  en_camino: 'bg-blue-100 text-blue-700',
  completada: 'bg-green-100 text-green-700',
}

export default function RutasAdmin() {
  const navigate = useNavigate()
  const [rutas, setRutas] = useState<Ruta[]>([])
  const [loading, setLoading] = useState(true)
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [mostrarFormulario, setMostrarFormulario] = useState(false)

  useEffect(() => {
    cargar()
  }, [fecha])

  const cargar = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/rutas-admin/?fecha=${fecha}`)
      setRutas(res.data)
    } catch {
      console.error('Error cargando rutas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate('/home')} className="text-green-300 text-xl">←</button>
        <h1 className="text-xl font-bold">🚚 Rutas</h1>
        <button
          onClick={() => setMostrarFormulario(true)}
          className="ml-auto bg-green-700 px-3 py-1.5 rounded-lg text-sm font-medium"
        >
          + Nueva
        </button>
      </div>

      <div className="p-4 max-w-lg mx-auto">
        {/* Selector de fecha */}
        <input
          type="date"
          value={fecha}
          onChange={e => setFecha(e.target.value)}
          className="w-full border rounded-xl px-4 py-2 text-sm mb-4"
        />

        {loading ? (
          <p className="text-center text-gray-400 py-8">Cargando...</p>
        ) : rutas.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">🚚</p>
            <p className="text-gray-500">No hay rutas para esta fecha</p>
            <button
              onClick={() => setMostrarFormulario(true)}
              className="mt-4 bg-green-700 text-white px-6 py-2 rounded-xl text-sm font-medium"
            >
              Crear primera ruta
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rutas.map(ruta => (
              <div
                key={ruta.id}
                onClick={() => navigate(`/admin/rutas/${ruta.id}?fecha=${fecha}`)}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{ruta.nombre}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {ruta.tipo === 'entrega' ? '📦 Entrega' : '🔄 Recogida'}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTADO_COLOR[ruta.estado] || 'bg-gray-100 text-gray-600'}`}>
                    {ruta.estado === 'pendiente' ? 'Pendiente' : ruta.estado === 'en_camino' ? 'En camino' : 'Completada'}
                  </span>
                </div>

                <div className="flex gap-4 text-xs text-gray-500 mb-2">
                  <span>🛑 {ruta.total_paradas} paradas</span>
                  <span>⏳ {ruta.pendientes} pendientes</span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {ruta.empleados.map((e, i) => (
                    <span key={i} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                      {e.es_lider ? '⭐' : ''}{e.nombre}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal crear ruta */}
      {mostrarFormulario && (
        <CrearRutaModal
          fecha={fecha}
          onClose={() => setMostrarFormulario(false)}
          onCreada={() => { setMostrarFormulario(false); cargar() }}
        />
      )}
    </div>
  )
}


// ── Modal crear ruta ───────────────────────────────────────────────────────────

interface EmpleadoOption {
  id: number
  nombre: string
  tipo_empleado: string
}

function CrearRutaModal({ fecha, onClose, onCreada }: {
  fecha: string
  onClose: () => void
  onCreada: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('entrega')
  const [notas, setNotas] = useState('')
  const [empleados, setEmpleados] = useState<EmpleadoOption[]>([])
  const [seleccionados, setSeleccionados] = useState<number[]>([])
  const [lider, setLider] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/empleados/?tipo_empleado=REPARTIDOR').then(res => {
      setEmpleados(res.data.results || res.data)
    })
  }, [])

  const toggleEmpleado = (id: number) => {
    setSeleccionados(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    )
  }

  const crear = async () => {
    if (!nombre || !fecha) { setError('Nombre y fecha son requeridos.'); return }
    setLoading(true)
    setError('')
    try {
      await api.post('/rutas-admin/crear/', {
        nombre,
        tipo,
        fecha,
        notas,
        empleados: seleccionados,
        lider_id: lider,
      })
      onCreada()
    } catch {
      setError('Error al crear la ruta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="bg-white w-full rounded-t-3xl max-h-[90vh] overflow-y-auto px-6 py-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">🚚 Nueva ruta</h3>
          <button onClick={onClose} className="text-gray-400 text-2xl">×</button>
        </div>

        <div className="flex flex-col gap-3 mb-4">
          <div>
            <label className="text-sm text-gray-500 mb-1 block">Nombre</label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Ruta Norte"
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setTipo('entrega')}
              className={`flex-1 text-sm py-2 rounded-xl border font-medium ${tipo === 'entrega' ? 'bg-green-700 text-white' : 'text-gray-600'}`}
            >
              📦 Entrega
            </button>
            <button
              onClick={() => setTipo('recogida')}
              className={`flex-1 text-sm py-2 rounded-xl border font-medium ${tipo === 'recogida' ? 'bg-blue-500 text-white' : 'text-gray-600'}`}
            >
              🔄 Recogida
            </button>
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-1 block">Repartidores</label>
            <div className="border rounded-xl p-3 max-h-40 overflow-y-auto flex flex-col gap-2">
              {empleados.map(emp => (
                <label key={emp.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={seleccionados.includes(emp.id)}
                    onChange={() => toggleEmpleado(emp.id)}
                  />
                  <span className="text-sm">{emp.nombre}</span>
                </label>
              ))}
            </div>
          </div>

          {seleccionados.length > 0 && (
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Líder</label>
              <select
                value={lider || ''}
                onChange={e => setLider(Number(e.target.value))}
                className="w-full border rounded-xl px-3 py-2 text-sm"
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
            <label className="text-sm text-gray-500 mb-1 block">Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm"
              rows={2}
              placeholder="Instrucciones especiales..."
            />
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <button
          onClick={crear}
          disabled={loading}
          className="w-full bg-green-700 text-white py-3 rounded-2xl font-semibold text-sm disabled:opacity-50"
        >
          {loading ? 'Creando...' : 'Crear ruta'}
        </button>
      </div>
    </div>
  )
}
