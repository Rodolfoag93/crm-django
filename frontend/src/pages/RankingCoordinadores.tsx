import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import api from '../lib/api'

interface RankingItem {
  coordinador: string
  promedio: number
  puntaje_final?: number
  promedio_encuesta?: number | null
  total_eventos: number
  puntaje_encuesta_componente?: number
  puntaje_eventos_componente?: number
}

interface MiCalificacion {
  sin_calificaciones: boolean
  promedio_general?: number | null
  detalle?: Record<string, number | null>
  total_encuestas?: number
  puntaje_final?: number | null
  total_eventos?: number
}

const CRITERIOS: Record<string, { label: string; emoji: string }> = {
  comunicacion_previo: { label: 'Comunicación previa', emoji: '💬' },
  atencion_coordinador: { label: 'Atención en evento', emoji: '👀' },
  juegos_aceptacion: { label: 'Juegos y dinámicas', emoji: '🎮' },
  staff_servicio: { label: 'Servicio del staff', emoji: '🤝' },
  material_estado: { label: 'Estado del material', emoji: '📦' },
}

export default function RankingCoordinadores() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [ranking, setRanking] = useState<RankingItem[]>([])
  const [miCalificacion, setMiCalificacion] = useState<MiCalificacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'ranking' | 'mi_cal'>('ranking')

  useEffect(() => {
    const requests = [api.get('/animador/ranking/')]
    if (user?.es_coordinador) {
      requests.push(api.get('/coordinador/mi-calificacion/'))
    }

    Promise.all(requests)
      .then(([rankingRes, miCalRes]) => {
        setRanking(rankingRes.data)
        if (miCalRes) setMiCalificacion(miCalRes.data)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

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

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-green-300 text-xl">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Ranking Coordinadores</h1>
          <p className="text-green-300 text-xs">Top 10 · 70% encuesta + 30% eventos</p>
        </div>
      </div>

      {/* Tabs — solo si es coordinador */}
      {user?.es_coordinador && (
        <div className="bg-white border-b border-gray-100 px-4 flex">
          <button
            onClick={() => setTab('ranking')}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              tab === 'ranking' ? 'border-green-700 text-green-700' : 'border-transparent text-gray-400'
            }`}
          >
            🏆 Ranking
          </button>
          <button
            onClick={() => setTab('mi_cal')}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              tab === 'mi_cal' ? 'border-green-700 text-green-700' : 'border-transparent text-gray-400'
            }`}
          >
            ⭐ Mi calificación
          </button>
        </div>
      )}

      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">

        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Cargando...</div>
        ) : (
          <>
            {/* TAB RANKING */}
            {tab === 'ranking' && (
              <>
                {ranking.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <p className="text-4xl mb-3">🏆</p>
                    <p className="text-sm">Aún no hay calificaciones</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {ranking.map((item, index) => (
                      <div
                        key={index}
                        className={`bg-white rounded-2xl shadow-sm border p-4 flex items-center gap-3 ${
                          index === 0 ? 'border-yellow-300 bg-yellow-50' :
                          index === 1 ? 'border-gray-300 bg-gray-50' :
                          index === 2 ? 'border-amber-200 bg-amber-50' :
                          'border-gray-100'
                        }`}
                      >
                        <span className="text-2xl w-8 text-center">{getMedalla(index)}</span>
                        <div className="flex-1">
                          <p className="font-bold text-gray-900">{item.coordinador}</p>
                          <p className="text-xs text-gray-400">
                            {item.total_eventos} eventos
                            {item.promedio_encuesta != null && (
                              <> · encuesta {item.promedio_encuesta.toFixed(1)}</>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-2xl font-bold ${getColor(item.promedio)}`}>
                            {(item.puntaje_final ?? item.promedio).toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-400">puntaje</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* TAB MI CALIFICACIÓN */}
            {tab === 'mi_cal' && miCalificacion && (
              <>
                {miCalificacion.sin_calificaciones ? (
                  <div className="text-center py-10 text-gray-400">
                    <p className="text-4xl mb-3">⭐</p>
                    <p className="text-sm">Aún no hay encuestas de clientes</p>
                    {miCalificacion.puntaje_final != null && (
                      <p className="text-sm mt-3 text-gray-600">
                        Puntaje por eventos: <strong>{miCalificacion.puntaje_final.toFixed(2)}</strong>
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Promedio general */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
                      <p className="text-xs text-gray-500 mb-1">Puntaje compuesto (año)</p>
                      <p className={`text-5xl font-bold ${getColor(miCalificacion.puntaje_final || 0)}`}>
                        {miCalificacion.puntaje_final?.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        Promedio encuesta: {miCalificacion.promedio_general?.toFixed(1)} ·{' '}
                        {miCalificacion.total_encuestas} encuesta(s) · {miCalificacion.total_eventos} evento(s)
                      </p>
                    </div>

                    {/* Detalle por criterio */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
                      <p className="text-xs text-gray-500 font-medium">Encuesta cliente por criterio</p>
                      {Object.entries(CRITERIOS).map(([key, { label, emoji }]) => {
                        const val = miCalificacion.detalle?.[key] || 0
                        return (
                          <div key={key} className="flex items-center gap-3">
                            <span className="text-lg w-6">{emoji}</span>
                            <div className="flex-1">
                              <div className="flex justify-between items-center mb-1">
                                <p className="text-xs text-gray-600">{label}</p>
                                <p className={`text-xs font-bold ${getColor(val)}`}>{val.toFixed(1)}</p>
                              </div>
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    val >= 4.5 ? 'bg-green-500' :
                                    val >= 3.5 ? 'bg-yellow-400' :
                                    'bg-red-400'
                                  }`}
                                  style={{ width: `${(val / 5) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}