import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import api from '../lib/api'

interface RankingItem {
  coordinador: string
  promedio: number
  total_eventos: number
}

interface MiCalificacion {
  sin_calificaciones: boolean
  promedio_general?: number
  detalle?: Record<string, number>
  total_evaluaciones?: number
}

const CRITERIOS: Record<string, { label: string; emoji: string }> = {
  comunicacion: { label: 'Comunicación', emoji: '💬' },
  organizacion: { label: 'Organización', emoji: '📋' },
  trato: { label: 'Trato', emoji: '🤝' },
  respeto: { label: 'Respeto', emoji: '🙏' },
  puntualidad: { label: 'Puntualidad', emoji: '⏰' },
  innovacion: { label: 'Innovación', emoji: '💡' },
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
          <p className="text-green-300 text-xs">Top 10</p>
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
                          <p className="text-xs text-gray-400">{item.total_eventos} evaluaciones</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-2xl font-bold ${getColor(item.promedio)}`}>
                            {item.promedio.toFixed(1)}
                          </p>
                          <p className="text-xs text-gray-400">/ 5.0</p>
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
                    <p className="text-sm">Aún no tienes calificaciones</p>
                  </div>
                ) : (
                  <>
                    {/* Promedio general */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
                      <p className="text-xs text-gray-500 mb-1">Tu promedio general</p>
                      <p className={`text-5xl font-bold ${getColor(miCalificacion.promedio_general || 0)}`}>
                        {miCalificacion.promedio_general?.toFixed(1)}
                      </p>
                      <div className="flex justify-center gap-1 mt-2">
                        {[1, 2, 3, 4, 5].map(s => (
                          <span key={s} className="text-xl">
                            {s <= Math.round(miCalificacion.promedio_general || 0) ? '⭐' : '☆'}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        Basado en {miCalificacion.total_evaluaciones} evaluaciones
                      </p>
                    </div>

                    {/* Detalle por criterio */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
                      <p className="text-xs text-gray-500 font-medium">Detalle por criterio</p>
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