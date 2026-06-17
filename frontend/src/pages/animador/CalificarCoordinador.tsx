import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../lib/api'

interface Criterio {
  key: string
  label: string
  pregunta: string
  emoji: string
}

const CRITERIOS: Criterio[] = [
  { key: 'comunicacion', label: 'Comunicación', pregunta: '¿El coordinador te explicó bien qué hacer y estuvo disponible cuando lo necesitaste?', emoji: '💬' },
  { key: 'organizacion', label: 'Organización', pregunta: '¿El evento estuvo bien organizado y había todo lo necesario?', emoji: '📋' },
  { key: 'trato', label: 'Trato', pregunta: '¿El coordinador te trató bien durante el evento?', emoji: '🤝' },
  { key: 'respeto', label: 'Respeto', pregunta: '¿El coordinador respetó tus tiempos y límites?', emoji: '🙏' },
  { key: 'puntualidad', label: 'Puntualidad', pregunta: '¿El coordinador llegó a tiempo y el evento empezó cuando debía?', emoji: '⏰' },
  { key: 'innovacion', label: 'Innovación', pregunta: '¿El coordinador propuso ideas creativas para los juegos y actividades?', emoji: '💡' },
]

function Estrellas({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className="text-3xl transition-transform active:scale-110"
        >
          {star <= (hover || valor) ? '⭐' : '☆'}
        </button>
      ))}
    </div>
  )
}

export default function CalificarCoordinador() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [calificaciones, setCalificaciones] = useState<Record<string, number>>({
    comunicacion: 0,
    organizacion: 0,
    trato: 0,
    respeto: 0,
    puntualidad: 0,
    innovacion: 0,
  })
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const promedio = Object.values(calificaciones).reduce((a, b) => a + b, 0) / 6

  const handleSubmit = async () => {
    const sinCalificar = CRITERIOS.filter(c => calificaciones[c.key] === 0)
    if (sinCalificar.length > 0) {
      setError(`Falta calificar: ${sinCalificar.map(c => c.label).join(', ')}`)
      return
    }
    setGuardando(true)
    setError('')
    try {
      await api.post(`/animador/eventos/${id}/calificar/`, {
        ...calificaciones,
        comentario,
      })
      alert('✅ ¡Gracias por tu calificación!')
      navigate(-1)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al enviar calificación')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-green-300 text-xl">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Calificar Coordinador</h1>
          <p className="text-green-300 text-xs">Tu opinión es importante</p>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">

        {/* Promedio en tiempo real */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Promedio general</p>
          <p className="text-4xl font-bold text-green-700">{promedio.toFixed(1)}</p>
          <div className="flex justify-center gap-1 mt-1">
            {[1, 2, 3, 4, 5].map(s => (
              <span key={s} className="text-lg">{s <= Math.round(promedio) ? '⭐' : '☆'}</span>
            ))}
          </div>
        </div>

        {/* Criterios */}
        {CRITERIOS.map(criterio => (
          <div key={criterio.key} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{criterio.emoji}</span>
              <p className="font-semibold text-gray-800 text-sm">{criterio.label}</p>
            </div>
            <p className="text-xs text-gray-400 mb-3">{criterio.pregunta}</p>
            <Estrellas
              valor={calificaciones[criterio.key]}
              onChange={v => setCalificaciones(prev => ({ ...prev, [criterio.key]: v }))}
            />
          </div>
        ))}

        {/* Comentario */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <label className="text-xs text-gray-500 font-medium">Comentario (opcional)</label>
          <textarea
            value={comentario}
            onChange={e => setComentario(e.target.value)}
            placeholder="¿Algo más que quieras compartir sobre el coordinador?"
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
            rows={3}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Botón */}
        <button
          onClick={handleSubmit}
          disabled={guardando}
          className="w-full bg-green-700 text-white py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-50"
        >
          {guardando ? 'Enviando...' : '⭐ Enviar calificación'}
        </button>

      </div>
    </div>
  )
}