import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import api from '../../lib/api'

interface Lista {
  id: number
  estado: string
  folio: string
  cliente: string
  fecha: string
  hora_inicio: string | null
  coordinador: string
  total_items: number
}

const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  BORRADOR: { label: 'Borrador', color: 'bg-gray-100 text-gray-500' },
  ENVIADA: { label: 'Por surtir', color: 'bg-yellow-100 text-yellow-700' },
  SURTIDA: { label: 'Surtida', color: 'bg-blue-100 text-blue-700' },
  EN_EVENTO: { label: 'En evento', color: 'bg-purple-100 text-purple-700' },
  REGRESADA: { label: 'Regresada', color: 'bg-orange-100 text-orange-700' },
  REVISADA: { label: 'Revisada', color: 'bg-green-100 text-green-700' },
  PENDIENTE: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700' },
  PREPARADA: { label: 'Preparada', color: 'bg-blue-100 text-blue-700' },
  RECIBIDA: { label: 'Recibida', color: 'bg-green-100 text-green-700' },
}

export default function HomeEncargado() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [listas, setListas] = useState<Lista[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('ENVIADA')

  const cargar = () => {
    setLoading(true)
    api.get(`/encargado/listas/?estado=${filtro}`)
      .then(res => setListas(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    cargar()
  }, [filtro])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const formatFecha = (fecha: string) => {
    return new Date(fecha + 'T00:00:00').toLocaleDateString('es-MX', {
      weekday: 'short', day: '2-digit', month: 'short'
    })
  }

  const filtros = [
    { key: 'ENVIADA', label: 'Por surtir' },
    { key: 'SURTIDA', label: 'Surtidas' },
    { key: 'REGRESADA', label: 'Regresadas' },
    { key: '', label: 'Todas' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-green-300 text-xl">←</button>
            <div>
              <p className="text-green-300 text-sm">Encargado de Material</p>
              <h1 className="text-xl font-bold">{user?.nombre}</h1>
            </div>
          </div>
          <button onClick={handleLogout} className="bg-green-800 px-3 py-2 rounded-lg text-sm">
            Salir
          </button>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">

        {/* Filtros */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1 flex gap-1 overflow-x-auto">
          {filtros.map(f => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                filtro === f.key
                  ? 'bg-green-700 text-white'
                  : 'text-gray-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Cargando...</div>
        ) : listas.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-sm">No hay listas en este estado</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {listas.map(lista => {
              const config = ESTADO_CONFIG[lista.estado] || { label: lista.estado, color: 'bg-gray-100 text-gray-500' }
              return (
                <div
                  key={lista.id}
                  onClick={() => navigate(`/encargado/listas/${lista.id}`)}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer active:scale-95 transition-transform"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${config.color}`}>
                      {config.label}
                    </span>
                    <span className="text-xs text-gray-400">{lista.folio}</span>
                  </div>
                  <p className="font-bold text-gray-900">{lista.cliente}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Coordinador: {lista.coordinador}</p>
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-sm text-gray-600">{formatFecha(lista.fecha)}{lista.hora_inicio ? ` · ${lista.hora_inicio}` : ''}</p>
                    <p className="text-xs text-green-600 font-medium">Ver lista →</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}