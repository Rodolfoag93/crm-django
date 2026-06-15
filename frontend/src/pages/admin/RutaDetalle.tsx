import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../../lib/api'

interface Parada {
  id: number
  orden: number
  cliente: string
  folio: string
  estado: string
  direccion: string
}

interface RentaDisponible {
  id: number
  folio: string
  cliente: string
  fecha_renta: string
  hora_inicio: string | null
  direccion: string
  estado_entrega: string
}

interface Ruta {
  id: number
  nombre: string
  tipo: string
  estado: string
  fecha: string
  empleados: { nombre: string; es_lider: boolean }[]
  paradas: Parada[]
}

export default function RutaDetalle() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const fecha = searchParams.get('fecha') || new Date().toISOString().split('T')[0]

  const [ruta, setRuta] = useState<Ruta | null>(null)
  const [rentasDisponibles, setRentasDisponibles] = useState<RentaDisponible[]>([])
  const [loading, setLoading] = useState(true)
  const [agregando, setAgregando] = useState(false)
  const [mostrarPedidos, setMostrarPedidos] = useState(false)

  useEffect(() => {
    cargar()
  }, [id])

  const cargar = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/rutas-admin/?fecha=${fecha}`)
      const rutaEncontrada = res.data.find((r: Ruta) => r.id === Number(id))
      setRuta(rutaEncontrada || null)

      const tipo = rutaEncontrada?.tipo || 'entrega'
      const rentasRes = await api.get(`/rentas-disponibles/?fecha=${fecha}&ruta_id=${id}&tipo=${tipo}`)
      setRentasDisponibles(rentasRes.data)
    } catch {
      console.error('Error cargando ruta')
    } finally {
      setLoading(false)
    }
  }

  const agregarPedido = async (rentaId: number) => {
    setAgregando(true)
    try {
      await api.post(`/rutas-admin/${id}/parada/`, { renta_id: rentaId })
      await cargar()
      setMostrarPedidos(false)
    } catch {
      alert('Error al agregar pedido')
    } finally {
      setAgregando(false)
    }
  }

  const ESTADO_COLOR: Record<string, string> = {
    pendiente: 'bg-gray-100 text-gray-600',
    entregado: 'bg-green-100 text-green-700',
    recogido: 'bg-blue-100 text-blue-700',
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-gray-500">Cargando...</p>
    </div>
  )

  if (!ruta) return (
    <div className="p-6">
      <p className="text-red-500">Ruta no encontrada.</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate('/admin/rutas')} className="text-green-300 text-xl">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">{ruta.nombre}</h1>
          <p className="text-green-300 text-xs">{ruta.tipo === 'entrega' ? '📦 Entrega' : '🔄 Recogida'} • {ruta.fecha}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          ruta.estado === 'pendiente' ? 'bg-gray-200 text-gray-700' :
          ruta.estado === 'en_camino' ? 'bg-blue-200 text-blue-800' :
          'bg-green-200 text-green-800'
        }`}>
          {ruta.estado}
        </span>
      </div>

      <div className="p-4 max-w-lg mx-auto">

        {/* Equipo */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <h2 className="font-semibold text-gray-700 mb-2">👥 Equipo</h2>
          {ruta.empleados.length === 0 ? (
            <p className="text-gray-400 text-sm">Sin repartidores asignados</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {ruta.empleados.map((e, i) => (
                <span key={i} className="text-xs bg-green-50 text-green-700 px-3 py-1 rounded-full">
                  {e.es_lider ? '⭐ ' : ''}{e.nombre}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Paradas */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4">
          <div className="flex justify-between items-center px-4 py-3 border-b border-gray-50">
            <h2 className="font-semibold text-gray-700">🛑 Paradas ({ruta.paradas.length})</h2>
            <button
              onClick={() => setMostrarPedidos(true)}
              className="text-xs bg-green-700 text-white px-3 py-1.5 rounded-xl font-medium"
            >
              + Agregar
            </button>
          </div>

          {ruta.paradas.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              Sin paradas aún. Agrega pedidos a esta ruta.
            </div>
          ) : (
            ruta.paradas.map(p => (
              <div key={p.id} className="px-4 py-3 border-b border-gray-50 last:border-0">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">
                      {p.orden}
                    </span>
                    <div>
                      <p className="font-medium text-sm text-gray-900">{p.cliente}</p>
                      <p className="text-xs text-gray-400">{p.folio}</p>
                      <p className="text-xs text-gray-400">📍 {p.direccion}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_COLOR[p.estado] || 'bg-gray-100 text-gray-600'}`}>
                    {p.estado}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal agregar pedidos */}
      {mostrarPedidos && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl max-h-[80vh] overflow-y-auto px-6 py-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Agregar pedido</h3>
              <button onClick={() => setMostrarPedidos(false)} className="text-gray-400 text-2xl">×</button>
            </div>

            {rentasDisponibles.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">No hay pedidos disponibles para esta fecha.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {rentasDisponibles.map(r => (
                  <div key={r.id} className="bg-gray-50 rounded-xl p-3 flex justify-between items-center">
                    <div>
                      <p className="font-medium text-sm">{r.cliente}</p>
                      <p className="text-xs text-gray-400">{r.folio} • {r.fecha_renta} {r.hora_inicio ? `• ${r.hora_inicio}` : ''}</p>
                      <p className="text-xs text-gray-400">📍 {r.direccion}</p>
                    </div>
                    <button
                      onClick={() => agregarPedido(r.id)}
                      disabled={agregando}
                      className="text-xs bg-green-700 text-white px-3 py-1.5 rounded-xl font-medium ml-2 whitespace-nowrap"
                    >
                      + Agregar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}