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
  { key: 'proactividad', label: 'Proactividad', pregunta: '¿El animador tomó iniciativa y propuso ideas sin que se lo pidieran?', emoji: '🚀' },
  { key: 'disposicion', label: 'Disposición', pregunta: '¿El animador estuvo dispuesto a ayudar y realizar las actividades asignadas?', emoji: '😊' },
  { key: 'puntualidad', label: 'Puntualidad', pregunta: '¿El animador llegó a tiempo al evento?', emoji: '⏰' },
  { key: 'compromiso', label: 'Compromiso', pregunta: '¿El animador se comprometió con el evento hasta el final?', emoji: '💪' },
  { key: 'respeto', label: 'Respeto', pregunta: '¿El animador trató con respeto a sus compañeros y coordinador?', emoji: '🙏' },
  { key: 'atencion_clientes', label: 'Atención a clientes', pregunta: '¿El animador atendió bien a los clientes y participantes del evento?', emoji: '🤝' },
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

export default function CalificarAnimador() {
  const navigate = useNavigate()
  const { animadorEventoId } = useParams()
  const [calificaciones, setCalificaciones] = useState<Record<string, number>>({
    proactividad: 0,
    disposicion: 0,
    puntualidad: 0,
    compromiso: 0,
    respeto: 0,
    atencion_clientes: 0,
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
      await api.post(`/coordinador/animadores/${animadorEventoId}/calificar/`, {
        ...calificaciones,
        comentario,
      })
      alert('✅ ¡Calificación enviada!')
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
          <h1 className="text-lg font-bold">Calificar Animador</h1>
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
            placeholder="¿Algo más que quieras compartir sobre el animador?"
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