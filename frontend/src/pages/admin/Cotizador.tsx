import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'

interface Producto {
  id: number
  nombre: string
  precio: string
  tipo: string
}

interface ProductoSeleccionado {
  producto: Producto
  cantidad: number
}

export default function Cotizador() {
  const navigate = useNavigate()
  const [productos, setProductos] = useState<Producto[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [seleccionados, setSeleccionados] = useState<ProductoSeleccionado[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (busqueda.length < 2) {
      setProductos([])
      return
    }
    setLoading(true)
    api.get(`/productos-buscar/?q=${busqueda}`)
      .then(res => setProductos(res.data))
      .finally(() => setLoading(false))
  }, [busqueda])

  const agregarProducto = (producto: Producto) => {
    const existe = seleccionados.find(s => s.producto.id === producto.id)
    if (existe) {
      setSeleccionados(prev =>
        prev.map(s => s.producto.id === producto.id
          ? { ...s, cantidad: s.cantidad + 1 }
          : s
        )
      )
    } else {
      setSeleccionados(prev => [...prev, { producto, cantidad: 1 }])
    }
    setBusqueda('')
  }

  const cambiarCantidad = (id: number, cantidad: number) => {
    if (cantidad < 1) {
      setSeleccionados(prev => prev.filter(s => s.producto.id !== id))
    } else {
      setSeleccionados(prev =>
        prev.map(s => s.producto.id === id ? { ...s, cantidad } : s)
      )
    }
  }

  const quitarProducto = (id: number) => {
    setSeleccionados(prev => prev.filter(s => s.producto.id !== id))
  }

  const limpiar = () => {
    setSeleccionados([])
    setBusqueda('')
  }

  const total = seleccionados.reduce(
    (sum, s) => sum + parseFloat(s.producto.precio) * s.cantidad, 0
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-green-300 text-xl">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Cotizador</h1>
          <p className="text-green-300 text-xs">Consulta de precios</p>
        </div>
        {seleccionados.length > 0 && (
          <button onClick={limpiar} className="text-green-300 text-xs underline">
            Limpiar
          </button>
        )}
      </div>

      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">

        {/* Buscador */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <label className="text-xs text-gray-500 font-medium">Buscar producto</label>
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Escribe al menos 2 letras..."
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          />

          {/* Resultados */}
          {busqueda.length >= 2 && (
            <div className="mt-2 border border-gray-100 rounded-xl overflow-hidden">
              {loading ? (
                <p className="text-xs text-gray-400 px-3 py-2">Cargando...</p>
              ) : productos.length === 0 ? (
                <p className="text-xs text-gray-400 px-3 py-2">Sin resultados</p>
              ) : (
                productos.slice(0, 6).map(p => (
                  <button
                    key={p.id}
                    onClick={() => agregarProducto(p)}
                    className="w-full flex justify-between items-center px-3 py-2.5 text-sm hover:bg-green-50 border-b border-gray-50 last:border-0 text-left"
                  >
                    <span className="text-gray-800">{p.nombre}</span>
                    <span className="text-green-700 font-semibold ml-2 shrink-0">
                      ${parseFloat(p.precio).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Productos seleccionados */}
        {seleccionados.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
            <p className="text-xs text-gray-500 font-medium">Productos en cotización</p>
            {seleccionados.map(s => (
              <div key={s.producto.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{s.producto.nombre}</p>
                  <p className="text-xs text-gray-400">
                    ${parseFloat(s.producto.precio).toLocaleString('es-MX', { minimumFractionDigits: 2 })} c/u
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => cambiarCantidad(s.producto.id, s.cantidad - 1)}
                    className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 font-bold text-sm flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="text-sm font-semibold w-4 text-center">{s.cantidad}</span>
                  <button
                    onClick={() => cambiarCantidad(s.producto.id, s.cantidad + 1)}
                    className="w-7 h-7 rounded-full bg-green-100 text-green-700 font-bold text-sm flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
                <div className="text-right min-w-16">
                  <p className="text-sm font-bold text-green-700">
                    ${(parseFloat(s.producto.precio) * s.cantidad).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <button
                  onClick={() => quitarProducto(s.producto.id)}
                  className="text-red-400 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Total */}
        {seleccionados.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex justify-between items-center">
            <div>
              <p className="text-green-700 font-medium text-sm">Total estimado</p>
              <p className="text-green-600 text-xs">{seleccionados.length} producto(s)</p>
            </div>
            <p className="text-green-800 font-bold text-2xl">
              ${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}

        {/* Estado vacío */}
        {seleccionados.length === 0 && busqueda.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🧮</p>
            <p className="text-sm">Busca productos para cotizar</p>
          </div>
        )}

      </div>
    </div>
  )
}