import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  PENDIENTE: { label: 'Por confirmar', color: 'bg-yellow-100 text-yellow-700' },
  ACEPTADO: { label: 'Confirmado', color: 'bg-green-100 text-green-700' },
  RECHAZADO: { label: 'Rechazado', color: 'bg-red-100 text-red-500' },
}

export default function ListaEventosAnimador() {
  const navigate = useNavigate()
  const [eventos, setEventos] = useState<EventoAnimador[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'proximos' | 'todos'>('proximos')

  useEffect(() => {
    api.get('/animador/eventos/')
      .then(res => setEventos(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const hoy = new Date().toISOString().split('T')[0]
  const esHoy = (fecha: string) => fecha === hoy

  const eventosFiltrados = filtro === 'proximos'
    ? eventos.filter(e => e.fecha >= hoy && e.estado !== 'RECHAZADO')
    : eventos

  const formatFecha = (fecha: string) => {
    return new Date(fecha + 'T00:00:00').toLocaleDateString('es-MX', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-green-300 text-xl">←</button>
        <h1 className="text-lg font-bold">Mis Eventos</h1>
      </div>

      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">

        {/* Filtro */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1 flex">
          <button
            onClick={() => setFiltro('proximos')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              filtro === 'proximos' ? 'bg-green-700 text-white' : 'text-gray-500'
            }`}
          >
            Próximos
          </button>
          <button
            onClick={() => setFiltro('todos')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              filtro === 'todos' ? 'bg-green-700 text-white' : 'text-gray-500'
            }`}
          >
            Todos
          </button>
        </div>

        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Cargando...</div>
        ) : eventosFiltrados.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-4xl mb-3">🎭</p>
            <p className="text-sm">No hay eventos {filtro === 'proximos' ? 'próximos' : ''}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {eventosFiltrados.map(evento => {
              const config = ESTADO_CONFIG[evento.estado] || ESTADO_CONFIG.PENDIENTE
              return (
                <div
                  key={evento.animador_evento_id}
                  onClick={() => navigate(`/animador/eventos/${evento.animador_evento_id}`)}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer active:scale-95 transition-transform"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${config.color}`}>
                      {config.label}
                    </span>
                    {evento.tiene_calificacion && (
                      <span className="text-xs text-green-600 font-medium">✓ Calificado</span>
                    )}
                    {!evento.tiene_calificacion && evento.fecha < hoy && evento.estado === 'ACEPTADO' && (
                      <span className="text-xs text-amber-500 font-medium">⭐ Pendiente calificar</span>
                    )}
                  </div>
                  <p className="font-bold text-gray-900">
                    {esHoy(evento.fecha) ? '🟢 Hoy' : formatFecha(evento.fecha)}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Coordinador: {evento.coordinador}</p>
                  {evento.hora_cita && (
                    <p className="text-sm text-gray-600 mt-1">🕐 Cita: {evento.hora_cita}</p>
                  )}
                  {evento.tipo_llegada && (
                    <p className="text-xs text-blue-600 mt-0.5">
                      📍 {evento.tipo_llegada === 'BODEGA' ? 'Llega a bodega' : 'Llega al local'}
                    </p>
                  )}
                  <p className="text-xs text-green-600 font-medium mt-2 text-right">Ver detalle →</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}