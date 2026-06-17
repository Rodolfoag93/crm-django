import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../lib/api'

interface ItemMaterial {
  id: number
  material_id: number
  material_nombre: string
  material_foto: string | null
  cantidad: number
  nota: string
  despachado: boolean
  recibido: boolean
}

interface MaterialCatalogo {
  id: number
  nombre: string
  descripcion: string
  tipo: string
  stock_disponible: number
  foto: string | null
}

export default function ListaMaterial() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [items, setItems] = useState<ItemMaterial[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [catalogo, setCatalogo] = useState<MaterialCatalogo[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/coordinador/eventos/${id}/material/`)
      .then(res => setItems(res.data.items || []))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (busqueda.length < 2) {
      setCatalogo([])
      return
    }
    api.get(`/coordinador/catalogo-materiales/?q=${busqueda}`)
      .then(res => setCatalogo(res.data))
  }, [busqueda])

  const agregarMaterial = async (material: MaterialCatalogo) => {
    setGuardando(true)
    setError('')
    try {
      await api.post(`/coordinador/eventos/${id}/material/agregar/`, {
        material_id: material.id,
        cantidad: 1,
      })
      // Recargar lista
      const res = await api.get(`/coordinador/eventos/${id}/material/`)
      setItems(res.data.items || [])
      setBusqueda('')
    } catch {
      setError('Error al agregar material')
    } finally {
      setGuardando(false)
    }
  }

  const cambiarCantidad = async (item: ItemMaterial, cantidad: number) => {
    if (cantidad < 1) return
    try {
      await api.post(`/coordinador/eventos/${id}/material/agregar/`, {
        material_id: item.material_id,
        cantidad,
        nota: item.nota,
      })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, cantidad } : i))
    } catch {
      setError('Error al actualizar cantidad')
    }
  }

  const quitarMaterial = async (item: ItemMaterial) => {
    try {
      await api.delete(`/coordinador/material/${item.id}/quitar/`)
      setItems(prev => prev.filter(i => i.id !== item.id))
    } catch {
      setError('Error al quitar material')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-green-300 text-xl">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Lista de Material</h1>
          <p className="text-green-300 text-xs">{items.length} artículo(s)</p>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">

    {/* Buscador catálogo */}
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <label className="text-xs text-gray-500 font-medium">Agregar material</label>
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Escribe al menos 2 letras..."
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          />

          {busqueda.length >= 2 && (
            <div className="mt-2 border border-gray-100 rounded-xl overflow-hidden">
              {catalogo.length === 0 ? (
                <p className="text-xs text-gray-400 px-3 py-2">Sin resultados</p>
              ) : (
                catalogo.slice(0, 6).map(m => (
                  <button
                    key={m.id}
                    onClick={() => agregarMaterial(m)}
                    disabled={guardando}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-green-50 border-b border-gray-50 last:border-0 text-left"
                  >
                    {m.foto ? (
                      <img src={m.foto} alt={m.nombre} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-sm shrink-0">📦</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{m.nombre}</p>
                      <p className="text-xs text-gray-400">Stock: {m.stock_disponible}</p>
                    </div>
                    <span className="text-green-600 text-lg shrink-0">+</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Lista actual */}
        {items.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-sm">Busca materiales para agregar a la lista</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
            <p className="text-xs text-gray-500 font-medium">Material en lista</p>
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                {item.material_foto ? (
                  <img src={item.material_foto} alt={item.material_nombre} className="w-10 h-10 rounded-xl object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400">📦</div>
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{item.material_nombre}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => cambiarCantidad(item, item.cantidad - 1)}
                    className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 font-bold text-sm flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="text-sm font-semibold w-4 text-center">{item.cantidad}</span>
                  <button
                    onClick={() => cambiarCantidad(item, item.cantidad + 1)}
                    className="w-7 h-7 rounded-full bg-green-100 text-green-700 font-bold text-sm flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => quitarMaterial(item)}
                  className="text-red-400 text-lg leading-none pl-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}