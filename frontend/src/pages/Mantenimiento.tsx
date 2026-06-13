import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'

interface Brincolin {
  id: number
  nombre: string
  proxima_renta: string | null
  ultima_renta: string | null
  ultima_limpieza: string | null
  necesita_limpieza: boolean
  notas: string
}

export default function Mantenimiento() {
  const navigate = useNavigate()
  const [brincolines, setBrincolines] = useState<Brincolin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'sucio' | 'limpio'>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [modalActivo, setModalActivo] = useState<Brincolin | null>(null)
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    cargar()
  }, [])

  const cargar = async () => {
    try {
      const res = await api.get('/mantenimiento/')
      setBrincolines(res.data)
    } catch {
      setError('No se pudo cargar la lista.')
    } finally {
      setLoading(false)
    }
  }

  const marcarLimpio = async () => {
    if (!modalActivo) return
    setGuardando(true)
    try {
      await api.post(`/mantenimiento/${modalActivo.id}/limpiar/`, { notas })
      setModalActivo(null)
      setNotas('')
      cargar()
    } catch {
      alert('Error al registrar limpieza')
    } finally {
      setGuardando(false)
    }
  }

  const filtrados = brincolines
    .filter(b => {
      if (filtro === 'sucio') return b.necesita_limpieza
      if (filtro === 'limpio') return !b.necesita_limpieza
      return true
    })
    .filter(b => b.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-gray-500">Cargando...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate('/home')} className="text-green-300 text-xl">←</button>
        <h1 className="text-xl font-bold">🔧 Mantenimiento</h1>
      </div>

      <div className="p-4 max-w-lg mx-auto">

        {/* Búsqueda */}
        <input
          type="text"
          placeholder="Buscar brincolin..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full border rounded-xl px-4 py-2 text-sm mb-3"
        />

        {/* Filtros */}
        <div className="flex gap-2 mb-4">
          {(['todos', 'sucio', 'limpio'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`flex-1 text-sm py-2 rounded-xl border font-medium ${
                filtro === f ? 'bg-green-800 text-white border-green-800' : 'text-gray-600'
              }`}
            >
              {f === 'todos' ? 'Todos' : f === 'sucio' ? '🔴 Sucios' : '🟢 Limpios'}
            </button>
          ))}
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        {/* Lista */}
        <div className="flex flex-col gap-3">
          {filtrados.length === 0 && (
            <p className="text-center text-gray-400 py-8">No hay brincolines con ese filtro.</p>
          )}
          {filtrados.map(b => (
            <div key={b.id} className={`bg-white rounded-2xl shadow-sm border p-4 ${
              b.necesita_limpieza ? 'border-yellow-300' : 'border-gray-100'
            }`}>
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-gray-900">{b.nombre}</h3>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  b.necesita_limpieza
                    ? 'bg-red-100 text-red-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {b.necesita_limpieza ? '🔴 Necesita limpieza' : '🟢 Limpio'}
                </span>
              </div>

              <div className="text-xs text-gray-500 space-y-1 mb-3">
                {b.proxima_renta && (
                  <p>📅 Próxima renta: <span className="font-medium text-blue-600">{b.proxima_renta}</span></p>
                )}
                {b.ultima_renta && (
                  <p>📦 Última renta: {b.ultima_renta}</p>
                )}
                {b.ultima_limpieza && (
                  <p>🧹 Última limpieza: {b.ultima_limpieza}</p>
                )}
                {!b.ultima_limpieza && (
                  <p className="text-gray-400">🧹 Sin registro de limpieza</p>
                )}
              </div>

              <button
                onClick={() => { setModalActivo(b); setNotas('') }}
                className="w-full text-sm bg-green-50 text-green-700 py-2 rounded-xl font-medium border border-green-200"
              >
                ✅ Marcar como limpio
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {modalActivo && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl px-6 py-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">✅ Marcar limpieza</h3>
              <button onClick={() => setModalActivo(null)} className="text-gray-400 text-2xl">×</button>
            </div>
            <p className="font-semibold text-gray-800 mb-3">{modalActivo.nombre}</p>
            <label className="text-sm text-gray-500 mb-1 block">Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm mb-4"
              rows={3}
              placeholder="Observaciones..."
            />
            <button
              onClick={marcarLimpio}
              disabled={guardando}
              className="w-full bg-green-700 text-white py-3 rounded-2xl font-semibold text-sm disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : 'Confirmar limpieza'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}