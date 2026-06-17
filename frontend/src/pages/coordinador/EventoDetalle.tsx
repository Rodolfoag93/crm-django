import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../lib/api'

interface Producto {
  nombre: string
  tipo: string
  cantidad: number
  precio_unitario: string
}

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

interface ListaMaterial {
  existe: boolean
  lista_id?: number
  estado?: string
  items: ItemMaterial[]
}

interface EventoDetalle {
  asignacion_id: number
  renta_id: number
  folio: string
  cliente: string
  telefono: string
  direccion: string
  fecha: string
  hora_inicio: string | null
  hora_fin: string | null
  precio_total: string
  anticipo: string
  pagado: boolean
  comentarios: string
  productos: Producto[]
  notas_coordinador: string
}

export default function EventoDetalle() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [evento, setEvento] = useState<EventoDetalle | null>(null)
  const [lista, setLista] = useState<ListaMaterial | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'info' | 'material'>('info')

  useEffect(() => {
    Promise.all([
      api.get(`/coordinador/eventos/${id}/`),
      api.get(`/coordinador/eventos/${id}/material/`)
    ]).then(([eventoRes, listaRes]) => {
      setEvento(eventoRes.data)
      setLista(listaRes.data)
    }).catch(console.error)
    .finally(() => setLoading(false))
  }, [id])

  const formatFecha = (fecha: string) => {
    return new Date(fecha + 'T00:00:00').toLocaleDateString('es-MX', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    })
  }

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
          <h1 className="text-lg font-bold">{evento.cliente}</h1>
          <p className="text-green-300 text-xs">{evento.folio}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-4 flex">
        <button
          onClick={() => setTab('info')}
          className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
            tab === 'info'
              ? 'border-green-700 text-green-700'
              : 'border-transparent text-gray-400'
          }`}
        >
          Info evento
        </button>
        <button
          onClick={() => setTab('material')}
          className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
            tab === 'material'
              ? 'border-green-700 text-green-700'
              : 'border-transparent text-gray-400'
          }`}
        >
          Material {lista?.items.length ? `(${lista.items.length})` : ''}
        </button>
      </div>

      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">

        {/* TAB INFO */}
        {tab === 'info' && (
          <>
            {/* Fecha y hora */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs text-gray-500 font-medium mb-1">Fecha</p>
              <p className="font-semibold text-gray-900">{formatFecha(evento.fecha)}</p>
              {evento.hora_inicio && (
                <p className="text-sm text-gray-600 mt-1">
                  🕐 {evento.hora_inicio} — {evento.hora_fin}
                </p>
              )}
            </div>

            {/* Cliente */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs text-gray-500 font-medium mb-2">Cliente</p>
              <p className="font-semibold text-gray-900">{evento.cliente}</p>
              <a href={'tel:' + evento.telefono} className="text-green-600 text-sm mt-1 block">{evento.telefono}</a>
              <a href={'https://maps.google.com/?q=' + encodeURIComponent(evento.direccion)} target="_blank" rel="noopener noreferrer" className="text-blue-500 text-xs mt-1 block">{'📍 ' + evento.direccion}</a>
            </div>

            {/* Servicios */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs text-gray-500 font-medium mb-2">Servicios contratados</p>
              {evento.productos.map((p, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm text-gray-800">{p.nombre}</p>
                    <p className="text-xs text-gray-400">Cantidad: {p.cantidad}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    p.tipo === 'AN'
                      ? 'bg-purple-50 text-purple-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {p.tipo}
                  </span>
                </div>
              ))}
            </div>

            {/* Pago */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs text-gray-500 font-medium mb-2">Pago</p>
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">Total</p>
                <p className="font-bold text-gray-900">
                  ${parseFloat(evento.precio_total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="flex justify-between items-center mt-1">
                <p className="text-sm text-gray-600">Anticipo</p>
                <p className="text-sm text-gray-700">
                  ${parseFloat(evento.anticipo).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700">Estado</p>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  evento.pagado
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-50 text-red-500'
                }`}>
                  {evento.pagado ? '✓ Pagado' : 'Pendiente'}
                </span>
              </div>
            </div>

            {/* Notas */}
            {evento.comentarios && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                <p className="text-xs text-amber-600 font-medium mb-1">Notas del evento</p>
                <p className="text-sm text-amber-800">{evento.comentarios}</p>
              </div>
            )}
          </>
        )}

        {/* TAB MATERIAL */}
        {tab === 'material' && (
          <>
            <button
              onClick={() => navigate(`/coordinador/eventos/${id}/material`)}
              className="w-full bg-green-700 text-white py-3 rounded-2xl font-semibold text-sm"
            >
              {lista?.existe ? '✏️ Editar lista de material' : '➕ Crear lista de material'}
            </button>

            {lista?.existe && lista.items.length > 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
                <p className="text-xs text-gray-500 font-medium">
                  Lista de material — {lista.estado}
                </p>
                {lista.items.map(item => (
                  <div key={item.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    {item.material_foto ? (
                      <img
                        src={item.material_foto}
                        alt={item.material_nombre}
                        className="w-10 h-10 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 text-lg">
                        📦
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{item.material_nombre}</p>
                      {item.nota && <p className="text-xs text-gray-400">{item.nota}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-700">×{item.cantidad}</p>
                      <p className={`text-xs ${item.despachado ? 'text-green-600' : 'text-gray-400'}`}>
                        {item.despachado ? '✓ Despachado' : 'Pendiente'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-gray-400">
                <p className="text-4xl mb-3">📦</p>
                <p className="text-sm">No hay material en la lista aún</p>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}