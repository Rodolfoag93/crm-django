import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'

interface Material {
  id: number
  nombre: string
  descripcion: string
  tipo: string
  stock_disponible: number
  foto: string | null
}

export default function CatalogoMateriales() {
  const navigate = useNavigate()
  const [materiales, setMateriales] = useState<Material[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(false)
  const [todos, setTodos] = useState<Material[]>([])
  const [fotoExpandida, setFotoExpandida] = useState<{ url: string; nombre: string } | null>(null)

  useEffect(() => {
    setLoading(true)
    api.get('/coordinador/catalogo-materiales/')
      .then(res => {
        setMateriales(res.data)
        setTodos(res.data)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (busqueda.length === 0) {
      setMateriales(todos)
      return
    }
    setMateriales(
      todos.filter(m => m.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    )
  }, [busqueda, todos])

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case 'REUTILIZABLE': return 'bg-green-50 text-green-600'
      case 'CONSUMIBLE': return 'bg-orange-50 text-orange-600'
      default: return 'bg-gray-100 text-gray-500'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Modal foto expandida */}
      {fotoExpandida && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 z-50 flex flex-col items-center justify-center p-4"
          onClick={() => setFotoExpandida(null)}
        >
          <img
            src={fotoExpandida.url}
            alt={fotoExpandida.nombre}
            className="max-w-full max-h-[80vh] rounded-2xl object-contain"
          />
          <p className="text-white text-sm mt-3 font-medium">{fotoExpandida.nombre}</p>
          <p className="text-gray-400 text-xs mt-1">Toca para cerrar</p>
        </div>
      )}

      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-green-300 text-xl">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Catálogo de Material</h1>
          <p className="text-green-300 text-xs">{materiales.length} artículos</p>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">

        {/* Buscador */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar material..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Cargando...</div>
        ) : materiales.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-sm">Sin resultados</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {materiales.map(m => (
              <div key={m.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex gap-3">
                {m.foto ? (
                  <img
                    src={m.foto}
                    alt={m.nombre}
                    onClick={() => setFotoExpandida({ url: m.foto!, nombre: m.nombre })}
                    className="w-16 h-16 rounded-xl object-cover shrink-0 cursor-pointer active:scale-95 transition-transform"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center text-2xl shrink-0">📦</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <p className="font-semibold text-gray-900 text-sm">{m.nombre}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${getTipoBadge(m.tipo)}`}>
                      {m.tipo}
                    </span>
                  </div>
                  {m.descripcion && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{m.descripcion}</p>
                  )}
                  <p className="text-xs font-semibold text-green-700 mt-2">
                    Stock: {m.stock_disponible}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}