import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'

interface Renta {
  id: number
  folio: string
  cliente: string
  telefono: string
  direccion: string
  hora_inicio: string | null
  hora_fin: string | null
  estado_entrega: string
  pagado: boolean
  total: string
  productos: string[]
}

const ESTADO_LABELS: Record<string, { label: string; color: string }> = {
  PENDIENTE: { label: 'Pendiente', color: 'bg-gray-100 text-gray-600' },
  ASIGNADO: { label: 'Asignado', color: 'bg-blue-100 text-blue-700' },
  EN_RUTA: { label: 'En ruta', color: 'bg-yellow-100 text-yellow-700' },
  ENTREGADO: { label: 'Entregado', color: 'bg-green-100 text-green-700' },
  CANCELADO: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
}

export default function RentasHoy() {
  const navigate = useNavigate()
  const [rentas, setRentas] = useState<Renta[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    api.get('/rentas-hoy/')
      .then(res => setRentas(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtradas = rentas
    .filter(r => !filtro || r.estado_entrega === filtro)
    .filter(r =>
      r.cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.folio.toLowerCase().includes(busqueda.toLowerCase())
    )

  const llamar = (tel: string) => { window.location.href = `tel:${tel}` }
  const mapa = (dir: string) => { window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir)}`, '_blank') }

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-gray-500">Cargando rentas...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate('/home')} className="text-green-300 text-xl">←</button>
        <h1 className="text-xl font-bold">📦 Rentas de hoy</h1>
        <span className="ml-auto bg-green-700 px-3 py-1 rounded-full text-sm">{rentas.length}</span>
      </div>

      <div className="p-4 max-w-lg mx-auto">

        {/* Búsqueda */}
        <input
          type="text"
          placeholder="Buscar cliente o folio..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full border rounded-xl px-4 py-2 text-sm mb-3"
        />

        {/* Filtro estado */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {['', 'PENDIENTE', 'EN_RUTA', 'ENTREGADO'].map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`text-xs px-3 py-2 rounded-xl border whitespace-nowrap font-medium ${
                filtro === f ? 'bg-green-800 text-white border-green-800' : 'text-gray-600 bg-white'
              }`}
            >
              {f === '' ? 'Todos' : ESTADO_LABELS[f]?.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="flex flex-col gap-3">
          {filtradas.length === 0 && (
            <p className="text-center text-gray-400 py-8">No hay rentas con ese filtro.</p>
          )}
          {filtradas.map(r => {
            const estado = ESTADO_LABELS[r.estado_entrega] || { label: r.estado_entrega, color: 'bg-gray-100 text-gray-600' }
            return (
              <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">{r.cliente}</p>
                    <p className="text-xs text-gray-400">{r.folio}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${estado.color}`}>
                    {estado.label}
                  </span>
                </div>

                <div className="text-xs text-gray-500 space-y-1 mb-3">
                  {r.hora_inicio && <p>🕐 {r.hora_inicio} – {r.hora_fin}</p>}
                  <p>📍 {r.direccion}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {r.productos.map((p, i) => (
                      <span key={i} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{p}</span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${r.pagado ? 'text-green-600' : 'text-red-500'}`}>
                    {r.pagado ? '✅ Pagado' : '⚠️ Sin pagar'} — ${parseFloat(r.total).toLocaleString('es-MX')}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => llamar(r.telefono)}
                      className="text-xs bg-green-50 text-green-600 px-3 py-1.5 rounded-xl border border-green-200">
                      📞
                    </button>
                    <button onClick={() => mapa(r.direccion)}
                      className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl border border-blue-200">
                      🗺
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
