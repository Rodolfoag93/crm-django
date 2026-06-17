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
  observacion: string
}

interface ListaDetalle {
  id: number
  estado: string
  folio: string
  cliente: string
  fecha: string
  hora_inicio: string | null
  direccion: string
  coordinador: string
  observaciones_recepcion: string
  items: ItemMaterial[]
}

export default function DetalleListaMaterial() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [lista, setLista] = useState<ListaDetalle | null>(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'items' | 'evidencias'>('items')
  const [evidencias, setEvidencias] = useState<any[]>([])
  const [cantidades, setCantidades] = useState<Record<number, number>>({})
  const [observaciones, setObservaciones] = useState<Record<number, string>>({})
  const [obsGeneral, setObsGeneral] = useState('')

  const cargar = () => {
    api.get(`/encargado/listas/${id}/`)
      .then(res => {
        setLista(res.data)
        // Inicializar cantidades con lo enviado
        const c: Record<number, number> = {}
        const o: Record<number, string> = {}
        res.data.items.forEach((item: ItemMaterial) => {
          c[item.id] = item.cantidad
          o[item.id] = item.observacion || ''
        })
        setCantidades(c)
        setObservaciones(o)
      })
      .finally(() => setLoading(false))
  }

  const cargarEvidencias = () => {
    api.get(`/encargado/listas/${id}/evidencias/`)
      .then(res => setEvidencias(res.data))
  }

  useEffect(() => {
    cargar()
    cargarEvidencias()
  }, [id])

  const surtirLista = async () => {
    if (!confirm('¿Confirmas que surtiste todo el material de esta lista?')) return
    setGuardando(true)
    setError('')
    try {
      await api.post(`/encargado/listas/${id}/surtir/`)
      cargar()
    } catch {
      setError('Error al surtir la lista')
    } finally {
      setGuardando(false)
    }
  }

  const recibirLista = async () => {
    if (!confirm('¿Confirmas la recepción del material en bodega?')) return
    setGuardando(true)
    setError('')
    try {
      const items = lista!.items.map(item => ({
        id: item.id,
        cantidad_recibida: cantidades[item.id] ?? item.cantidad,
        observacion: observaciones[item.id] || '',
      }))
      await api.post(`/encargado/listas/${id}/recibir/`, {
        items,
        observaciones: obsGeneral,
      })
      cargar()
    } catch {
      setError('Error al recibir la lista')
    } finally {
      setGuardando(false)
    }
  }

  const subirEvidencia = async (e: React.ChangeEvent<HTMLInputElement>, tipo: string) => {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('foto', file)
    formData.append('tipo', tipo)
    try {
      await api.post(`/encargado/listas/${id}/evidencias/subir/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      cargarEvidencias()
    } catch {
      setError('Error al subir evidencia')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  if (!lista) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Lista no encontrada</p>
      </div>
    )
  }

  const puedesSurtir = ['BORRADOR', 'ENVIADA', 'PENDIENTE', 'REVISADA', 'PREPARADA'].includes(lista.estado)
  const puedesRecibir = lista.estado === 'EN_EVENTO'

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-green-300 text-xl">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">{lista.cliente}</h1>
          <p className="text-green-300 text-xs">{lista.folio} · {lista.estado}</p>
        </div>
      </div>

      {/* Info evento */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <p className="text-sm text-gray-600">Coordinador: <span className="font-medium">{lista.coordinador}</span></p>
        <p className="text-xs text-gray-400 mt-0.5">{lista.fecha}{lista.hora_inicio ? ` · ${lista.hora_inicio}` : ''}</p>
        <a href={'https://maps.google.com/?q=' + encodeURIComponent(lista.direccion)} target="_blank" rel="noopener noreferrer" className="text-blue-500 text-xs mt-0.5 block">{'📍 ' + lista.direccion}</a>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-4 flex">
        <button
          onClick={() => setTab('items')}
          className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${tab === 'items' ? 'border-green-700 text-green-700' : 'border-transparent text-gray-400'}`}
        >
          Material ({lista.items.length})
        </button>
        <button
          onClick={() => setTab('evidencias')}
          className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${tab === 'evidencias' ? 'border-green-700 text-green-700' : 'border-transparent text-gray-400'}`}
        >
          Evidencias ({evidencias.length})
        </button>
      </div>

      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* TAB ITEMS */}
        {tab === 'items' && (
          <>
            {/* Lista de material */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
              {lista.items.map(item => (
                <div key={item.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  {item.material_foto ? (
                    <img src={item.material_foto} alt={item.material_nombre} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">📦</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.material_nombre}</p>
                    <p className="text-xs text-gray-400">Solicitado: {item.cantidad}</p>
                  </div>

                  {/* Si puede recibir, mostrar input de cantidad recibida */}
                  {puedesRecibir ? (
                    <div className="flex flex-col items-end gap-1">
                      <input
                        type="number"
                        value={cantidades[item.id] ?? item.cantidad}
                        onChange={e => setCantidades(prev => ({ ...prev, [item.id]: parseInt(e.target.value) || 0 }))}
                        className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right"
                      />
                      <span className={`text-xs ${(cantidades[item.id] ?? item.cantidad) < item.cantidad ? 'text-red-500' : 'text-green-600'}`}>
                        {(cantidades[item.id] ?? item.cantidad) < item.cantidad ? 'Faltante' : 'Completo'}
                      </span>
                    </div>
                  ) : (
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${item.despachado ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {item.despachado ? '✓' : 'Pendiente'}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Observaciones generales al recibir */}
            {puedesRecibir && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <label className="text-xs text-gray-500 font-medium">Observaciones generales</label>
                <textarea
                  value={obsGeneral}
                  onChange={e => setObsGeneral(e.target.value)}
                  placeholder="Ej: Llegó todo completo, un cono rayado..."
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
                  rows={3}
                />
              </div>
            )}

            {/* Botón surtir */}
            {puedesSurtir && (
              <button
                onClick={surtirLista}
                disabled={guardando}
                className="w-full bg-green-700 text-white py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-50"
              >
                {guardando ? 'Procesando...' : '📦 Marcar como surtida'}
              </button>
            )}

            {/* Botón recibir */}
            {puedesRecibir && (
              <button
                onClick={recibirLista}
                disabled={guardando}
                className="w-full bg-blue-600 text-white py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-50"
              >
                {guardando ? 'Procesando...' : '✅ Confirmar recepción en bodega'}
              </button>
            )}
          </>
        )}

        {/* TAB EVIDENCIAS */}
        {tab === 'evidencias' && (
          <>
            {/* Botones subir foto */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
              <p className="text-xs text-gray-500 font-medium">Subir evidencia</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { tipo: 'SALIDA', label: '📤 Salida' },
                  { tipo: 'LLEGADA', label: '📥 Llegada' },
                  { tipo: 'REGRESO', label: '🔄 Regreso' },
                  { tipo: 'DANO', label: '⚠️ Daño' },
                ].map(({ tipo, label }) => (
                  <label key={tipo} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-center cursor-pointer hover:bg-green-50">
                    {label}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={e => subirEvidencia(e, tipo)}
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Lista evidencias */}
            {evidencias.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <p className="text-4xl mb-3">📷</p>
                <p className="text-sm">Sin evidencias aún</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {evidencias.map(e => (
                  <div key={e.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <img src={e.foto_url} alt={e.tipo} className="w-full h-32 object-cover" />
                    <div className="p-2">
                      <p className="text-xs font-medium text-gray-700">{e.tipo}</p>
                      {e.descripcion && <p className="text-xs text-gray-400 truncate">{e.descripcion}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}