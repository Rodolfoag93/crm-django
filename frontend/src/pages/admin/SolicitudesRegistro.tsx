import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'

interface Solicitud {
  id: number
  nombre: string
  telefono: string
  email: string | null
  tipo_empleado: string
  estado: string
  fecha_solicitud: string
}

const TIPOS: Record<string, string> = {
  REPARTIDOR: 'Repartidor',
  COORDINADOR: 'Coordinador',
  ENCARGADO: 'Encargado de Material',
  ANIMADOR: 'Animador',
}

export default function SolicitudesRegistro() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Solicitud[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [procesando, setProcesando] = useState<number | null>(null)

  const cargar = useCallback(() => {
    setLoading(true)
    setError('')
    api.get('/solicitudes/', { params: { estado: 'PENDIENTE' } })
      .then(r => setItems(Array.isArray(r.data) ? r.data : (r.data.results ?? [])))
      .catch(e => setError(e?.response?.data?.error || 'No se pudieron cargar las solicitudes'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const aprobar = async (s: Solicitud) => {
    if (!window.confirm(`¿Aprobar a ${s.nombre}? Se creará su usuario.`)) return
    setProcesando(s.id)
    try {
      await api.post(`/solicitudes/${s.id}/aprobar/`)
      setItems(prev => prev.filter(x => x.id !== s.id))
    } catch (e: any) {
      alert(e?.response?.data?.error || 'No se pudo aprobar')
    } finally {
      setProcesando(null)
    }
  }

  const rechazar = async (s: Solicitud) => {
    if (!window.confirm(`¿Rechazar a ${s.nombre}?`)) return
    setProcesando(s.id)
    try {
      await api.post(`/solicitudes/${s.id}/rechazar/`)
      setItems(prev => prev.filter(x => x.id !== s.id))
    } catch (e: any) {
      alert(e?.response?.data?.error || 'No se pudo rechazar')
    } finally {
      setProcesando(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-green-900 text-white px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/home')} className="text-green-200 text-sm">←</button>
        <div>
          <h1 className="text-lg font-bold">Solicitudes de registro</h1>
          <p className="text-green-200 text-xs">Pendientes de aprobación</p>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-3">
        {loading && <p className="text-center text-gray-400 text-sm py-8">Cargando…</p>}
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-xl p-3">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-gray-500 text-sm">
            No hay solicitudes pendientes.
          </div>
        )}
        {items.map(s => (
          <div key={s.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex justify-between gap-2 mb-1">
              <h2 className="font-semibold text-gray-900">{s.nombre}</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 self-start">Pendiente</span>
            </div>
            <p className="text-sm text-gray-600">{TIPOS[s.tipo_empleado] || s.tipo_empleado}</p>
            <p className="text-sm text-gray-500">{s.telefono}{s.email ? ` · ${s.email}` : ''}</p>
            <p className="text-xs text-gray-400 mt-1">
              {s.fecha_solicitud ? new Date(s.fecha_solicitud).toLocaleString('es-MX') : ''}
            </p>
            <div className="flex gap-2 mt-3">
              <button
                disabled={procesando === s.id}
                onClick={() => aprobar(s)}
                className="flex-1 bg-green-700 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50"
              >
                Aprobar
              </button>
              <button
                disabled={procesando === s.id}
                onClick={() => rechazar(s)}
                className="flex-1 bg-white border border-red-200 text-red-700 text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50"
              >
                Rechazar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
