import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import api from '../../lib/api'

interface EventoAnimador {
  animador_evento_id: number
  asignacion_id: number
  estado: string
  fecha: string
  hora_cita: string | null
  tipo_llegada: string | null
  coordinador: string
  direccion: string
  hora_inicio: string | null
  hora_fin: string | null
  tiene_calificacion: boolean
}

interface RankingItem {
  coordinador: string
  promedio: number
  total_eventos: number
}

const getMedalla = (index: number) => {
  if (index === 0) return '🥇'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return `${index + 1}.`
}

const getColor = (promedio: number) => {
  if (promedio >= 4.5) return 'text-green-600'
  if (promedio >= 3.5) return 'text-yellow-600'
  return 'text-red-500'
}

export default function HomeAnimador() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [eventos, setEventos] = useState<EventoAnimador[]>([])
  const [ranking, setRanking] = useState<RankingItem[]>([])
  const [loadingEventos, setLoadingEventos] = useState(true)
  const [loadingRanking, setLoadingRanking] = useState(true)
  const [rankingAnimadores, setRankingAnimadores] = useState<any[]>([])
  const [loadingRankingAnimadores, setLoadingRankingAnimadores] = useState(true)

  useEffect(() => {
    api.get('/animador/eventos/')
      .then(res => setEventos(res.data))
      .catch(console.error)
      .finally(() => setLoadingEventos(false))
      
      api.get('/animador/ranking-animadores/')
      .then(res => setRankingAnimadores(res.data))
      .catch(console.error)
      .finally(() => setLoadingRankingAnimadores(false))

    api.get('/animador/ranking/')
      .then(res => setRanking(res.data))
      .catch(console.error)
      .finally(() => setLoadingRanking(false))
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const hoy = new Date().toISOString().split('T')[0]
  const eventosPendientes = eventos.filter(e => e.fecha >= hoy && e.estado !== 'RECHAZADO')
  const pendienteCalificar = eventos.filter(e => e.fecha < hoy && e.estado === 'ACEPTADO' && !e.tiene_calificacion).length

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-green-300 text-sm">Animador</p>
            <h1 className="text-xl font-bold">{user?.nombre}</h1>
          </div>
          <button onClick={handleLogout} className="bg-green-800 px-3 py-2 rounded-lg text-sm">
            Salir
          </button>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">

        {/* Dashboard estadísticas */}
        {!loadingEventos && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="font-bold text-gray-800 mb-3">📊 Mi historial</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center bg-blue-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-blue-700">{eventos.length}</p>
                <p className="text-xs text-blue-600">Total</p>
              </div>
              <div className="text-center bg-green-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-green-700">
                  {eventos.filter(e => e.estado === 'ACEPTADO').length}
                </p>
                <p className="text-xs text-green-600">Aceptados</p>
              </div>
              <div className="text-center bg-red-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-red-500">
                  {eventos.filter(e => e.estado === 'RECHAZADO').length}
                </p>
                <p className="text-xs text-red-500">Rechazados</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="text-center bg-amber-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-amber-600">
                  {eventos.filter(e => e.tiene_calificacion).length}
                </p>
                <p className="text-xs text-amber-600">Calificados</p>
              </div>
              <div className="text-center bg-purple-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-purple-600">
                  {new Set(eventos.map(e => e.coordinador)).size}
                </p>
                <p className="text-xs text-purple-600">Coordinadores</p>
              </div>
            </div>
          </div>
        )}

        {/* Card Mis Eventos */}
        <div
          onClick={() => navigate('/animador/eventos')}
          className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4 cursor-pointer border border-gray-100"
        >
          <div className="bg-purple-100 p-3 rounded-xl text-2xl">🎭</div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900">Mis Eventos</h2>
            <p className="text-gray-500 text-sm">
              {loadingEventos ? 'Cargando...' : `${eventosPendientes.length} próximos`}
            </p>
          </div>
          {pendienteCalificar > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full">
              {pendienteCalificar} ⭐
            </span>
          )}
          <div className="text-gray-400">›</div>
        </div>
        
        {/* Ranking Animadores */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🎭</span>
            <p className="font-bold text-gray-800">Ranking Animadores</p>
          </div>

          {loadingRankingAnimadores ? (
            <p className="text-center text-gray-400 text-sm py-4">Cargando...</p>
          ) : rankingAnimadores.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-4">Aún no hay calificaciones</p>
          ) : (
            <div className="flex flex-col gap-2">
              {rankingAnimadores.map((item, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-3 p-3 rounded-xl ${
                    index === 0 ? 'bg-yellow-50' :
                    index === 1 ? 'bg-gray-50' :
                    index === 2 ? 'bg-amber-50' :
                    'bg-gray-50'
                  }`}
                >
                  <span className="text-lg w-6 text-center">{getMedalla(index)}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{item.animador}</p>
                    <p className="text-xs text-gray-400">{item.total_eventos} evaluaciones</p>
                  </div>
                  <p className={`text-lg font-bold ${getColor(item.promedio)}`}>
                    {item.promedio.toFixed(1)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ranking desplegado */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🏆</span>
            <p className="font-bold text-gray-800">Ranking Coordinadores</p>
          </div>

          {loadingRanking ? (
            <p className="text-center text-gray-400 text-sm py-4">Cargando...</p>
          ) : ranking.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-4">Aún no hay calificaciones</p>
          ) : (
            <div className="flex flex-col gap-2">
              {ranking.map((item, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-3 p-3 rounded-xl ${
                    index === 0 ? 'bg-yellow-50' :
                    index === 1 ? 'bg-gray-50' :
                    index === 2 ? 'bg-amber-50' :
                    'bg-gray-50'
                  }`}
                >
                  <span className="text-lg w-6 text-center">{getMedalla(index)}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{item.coordinador}</p>
                    <p className="text-xs text-gray-400">{item.total_eventos} evaluaciones</p>
                  </div>
                  <p className={`text-lg font-bold ${getColor(item.promedio)}`}>
                    {item.promedio.toFixed(1)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}