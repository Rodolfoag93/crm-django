import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../lib/api'

interface Criterio {
  key: string
  label: string
  pregunta: string
  emoji: string
}

const CRITERIOS: Criterio[] = [
  { key: 'puntualidad',  label: 'Puntualidad',  pregunta: '¿El coordinador llegó a tiempo y estuvo listo para recibir el material?', emoji: '⏰' },
  { key: 'orden',        label: 'Orden',         pregunta: '¿Tuvo clara la lista de material sin cambios de último momento?',          emoji: '📋' },
  { key: 'comunicacion', label: 'Comunicación',  pregunta: '¿Se comunicó con anticipación sobre lo que necesitaba?',                  emoji: '💬' },
  { key: 'disposicion',  label: 'Disposición',   pregunta: '¿Fue respetuoso y cordial durante el proceso?',                           emoji: '🤝' },
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
  const [yaCalificado, setYaCalificado] = useState<string | null>(null)
  const [calificaciones, setCalificaciones] = useState<Record<string, number>>({
    puntualidad: 0, orden: 0, comunicacion: 0, disposicion: 0,
  })
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/listas/${id}/calificaciones/`)
      .then(r => {
        if (r.data.ya_califico_encargado) {
          setYaCalificado(r.data.promedio_al_coordinador)
        }
      })
      .catch(() => {})
  }, [id])

  const promedio = Object.values(calificaciones).reduce((a, b) => a + b, 0) / CRITERIOS.length

  const handleSubmit = async () => {
    const sinCalificar = CRITERIOS.filter(c => calificaciones[c.key] === 0)
    if (sinCalificar.length > 0) {
      setError(`Falta calificar: ${sinCalificar.map(c => c.label).join(', ')}`)
      return
    }
    setGuardando(true)
    setError('')
    try {
      await api.post(`/encargado/listas/${id}/calificar-coordinador/`, {
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

  if (yaCalificado !== null) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-green-300 text-xl">←</button>
          <h1 className="text-lg font-bold">Calificar Coordinador</h1>
        </div>
        <div className="flex flex-col items-center justify-center p-8 gap-4 mt-12">
          <div className="text-6xl">⭐</div>
          <p className="text-2xl font-bold text-green-700">{yaCalificado}</p>
          <p className="text-gray-500 text-sm text-center">Ya calificaste al coordinador de este evento.</p>
          <button onClick={() => navigate(-1)} className="mt-4 bg-green-700 text-white px-6 py-3 rounded-2xl text-sm font-semibold">
            Volver
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-green-300 text-xl">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Calificar Coordinador</h1>
          <p className="text-green-300 text-xs">¿Cómo fue la coordinación del evento?</p>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Promedio general</p>
          <p className="text-4xl font-bold text-green-700">{promedio.toFixed(1)}</p>
          <div className="flex justify-center gap-1 mt-1">
            {[1, 2, 3, 4, 5].map(s => (
              <span key={s} className="text-lg">{s <= Math.round(promedio) ? '⭐' : '☆'}</span>
            ))}
          </div>
        </div>

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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

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
