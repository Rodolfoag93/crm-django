import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../lib/api'

interface EventoDetalle {
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

export default function EventoAnimador() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [evento, setEvento] = useState<EventoDetalle | null>(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [tipoLlegada, setTipoLlegada] = useState<'BODEGA' | 'LOCAL' | ''>('')
  const [error, setError] = useState('')

  const cargar = () => {
    api.get('/animador/eventos/')
      .then(res => {
        const e = res.data.find((ev: EventoDetalle) => String(ev.animador_evento_id) === id)
        setEvento(e || null)
        if (e?.tipo_llegada) setTipoLlegada(e.tipo_llegada)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    cargar()
  }, [id])

  const responder = async (estado: 'ACEPTADO' | 'RECHAZADO') => {
    if (estado === 'ACEPTADO' && !tipoLlegada) {
      setError('Selecciona cómo vas a llegar')
      return
    }
    setGuardando(true)
    setError('')
    try {
      await api.post(`/animador/eventos/${id}/responder/`, {
        estado,
        tipo_llegada: tipoLlegada || undefined,
      })
      cargar()
    } catch {
      setError('Error al responder')
    } finally {
      setGuardando(false)
    }
  }

  const formatFecha = (fecha: string) => {
    return new Date(fecha + 'T00:00:00').toLocaleDateString('es-MX', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    })
  }

  const ahora = new Date()
  const fechaHoraFin = evento?.hora_fin
    ? new Date(`${evento.fecha}T${evento.hora_fin}`)
    : evento
    ? new Date(`${evento.fecha}T23:59:59`)
    : new Date()
  const eventoTerminado = evento ? ahora > fechaHoraFin : false

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  if (!evento) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Evento no encontrado</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-green-300 text-xl">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Detalle del Evento</h1>
          <p className="text-green-300 text-xs">{formatFecha(evento.fecha)}</p>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">

        {/* Info evento */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-2">
          <p className="text-xs text-gray-500 font-medium">Coordinador</p>
          <p className="font-semibold text-gray-900">{evento.coordinador}</p>

          <p className="text-xs text-gray-500 font-medium mt-2">Fecha y hora</p>
          <p className="text-sm text-gray-700">{formatFecha(evento.fecha)}</p>
          {evento.hora_inicio && (
            <p className="text-sm text-gray-600">🕐 {evento.hora_inicio} — {evento.hora_fin}</p>
          )}
          {evento.hora_cita && (
            <p className="text-sm text-amber-600 font-medium">📌 Tu cita: {evento.hora_cita}</p>
          )}

          <p className="text-xs text-gray-500 font-medium mt-2">Ubicación</p>
          <a href={'https://maps.google.com/?q=' + encodeURIComponent(evento.direccion)} target="_blank" rel="noopener noreferrer" className="text-blue-500 text-sm">{'📍 ' + evento.direccion}</a>
        </div>

        {/* Estado */}
        <div className={`rounded-2xl p-4 text-center ${
          evento.estado === 'ACEPTADO' ? 'bg-green-50 border border-green-200' :
          evento.estado === 'RECHAZADO' ? 'bg-red-50 border border-red-200' :
          'bg-yellow-50 border border-yellow-200'
        }`}>
          <p className={`font-bold text-lg ${
            evento.estado === 'ACEPTADO' ? 'text-green-700' :
            evento.estado === 'RECHAZADO' ? 'text-red-600' :
            'text-yellow-700'
          }`}>
            {evento.estado === 'ACEPTADO' ? '✅ Confirmado' :
             evento.estado === 'RECHAZADO' ? '❌ Rechazado' :
             '⏳ Pendiente de confirmar'}
          </p>
          {evento.tipo_llegada && (
            <p className="text-sm text-gray-600 mt-1">
              {evento.tipo_llegada === 'BODEGA' ? '📦 Llegas a bodega' : '📍 Llegas al local'}
            </p>
          )}
        </div>

        {/* Confirmar asistencia */}
        {evento.estado === 'PENDIENTE' && !eventoTerminado && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
            <p className="text-sm font-semibold text-gray-700">¿Puedes ir al evento?</p>

            <p className="text-xs text-gray-500">Si vas, ¿cómo llegas?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTipoLlegada('BODEGA')}
                className={`py-3 rounded-xl text-sm font-medium border-2 transition-colors ${
                  tipoLlegada === 'BODEGA'
                    ? 'border-green-600 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-500'
                }`}
              >
                📦 A bodega
              </button>
              <button
                onClick={() => setTipoLlegada('LOCAL')}
                className={`py-3 rounded-xl text-sm font-medium border-2 transition-colors ${
                  tipoLlegada === 'LOCAL'
                    ? 'border-green-600 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-500'
                }`}
              >
                📍 Al local
              </button>
            </div>

            {error && (
              <p className="text-red-500 text-xs">{error}</p>
            )}

            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                onClick={() => responder('RECHAZADO')}
                disabled={guardando}
                className="py-3 rounded-xl text-sm font-semibold bg-red-50 text-red-600 border border-red-200 disabled:opacity-50"
              >
                ❌ No puedo ir
              </button>
              <button
                onClick={() => responder('ACEPTADO')}
                disabled={guardando}
                className="py-3 rounded-xl text-sm font-semibold bg-green-700 text-white disabled:opacity-50"
              >
                ✅ Confirmar
              </button>
            </div>
          </div>
        )}

        {/* Botón calificar */}
        {evento.estado === 'ACEPTADO' && eventoTerminado && !evento.tiene_calificacion && (
          <button
            onClick={() => navigate(`/animador/eventos/${id}/calificar`)}
            className="w-full bg-amber-500 text-white py-3.5 rounded-2xl font-semibold text-sm"
          >
            ⭐ Calificar al coordinador
          </button>
        )}

        {evento.tiene_calificacion && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
            <p className="text-green-700 font-semibold text-sm">✓ Ya calificaste este evento</p>
          </div>
        )}

      </div>
    </div>
  )
}