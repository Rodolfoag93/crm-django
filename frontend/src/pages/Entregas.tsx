import { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import api from '../lib/api'

interface Producto {
  id: number
  producto_id: number
  nombre: string
  tipo: string
  cantidad: number
  es_brincolin: boolean
}

interface RecogidaProgramada {
  fecha: string
  tipo_horario: string
  hora_inicio: string
  hora_fin: string | null
}

interface Parada {
  id: number
  orden: number
  estado: string
  cliente: string
  telefono: string
  direccion: string
  hora_inicio: string | null
  hora_fin: string | null
  folio: string
  productos: Producto[]
  recogida_programada: RecogidaProgramada | null
}

interface Ruta {
  id: number
  nombre: string
  tipo: string
  estado: string
  fecha: string
  paradas: Parada[]
}

export default function Entregas() {
  const { } = useAuthStore()
  const [rutas, setRutas] = useState<Ruta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [paradaActiva, setParadaActiva] = useState<Parada | null>(null)

  useEffect(() => {
    api.get('/rutas/mis-rutas/')
      .then((res: any) => setRutas(res.data))
      .catch(() => setError('No se pudo cargar tu ruta del día.'))
      .finally(() => setLoading(false))
  }, [])

  const abrirMapa = (direccion: string) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`
    window.open(url, '_blank')
  }

  const llamar = (telefono: string) => {
    window.location.href = `tel:${telefono}`
  }

  const getRutaDeParada = (paradaId: number): Ruta | undefined => {
    return rutas.find(r => r.paradas.some(p => p.id === paradaId))
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-gray-500">Cargando tu ruta...</p>
    </div>
  )

  if (error) return (
    <div className="p-6">
      <p className="text-red-500">{error}</p>
    </div>
  )

  const rutasActivas = rutas.filter(ruta =>
    ruta.paradas.some(p => p.estado === 'pendiente')
  )

  if (rutas.length === 0 || rutasActivas.length === 0) return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 text-center px-6">
      <span className="text-5xl">📭</span>
      <h2 className="text-xl font-semibold text-gray-700">Sin ruta asignada hoy</h2>
      <p className="text-gray-400">No tienes entregas programadas para hoy.</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-orange-500 text-white px-6 pt-12 pb-6">
        <h1 className="text-2xl font-bold">🚚 Mi ruta de hoy</h1>
        <p className="text-orange-100 text-sm mt-1">{rutas[0].fecha}</p>
      </div>

      {rutasActivas.map(ruta => (
        <div key={ruta.id} className="px-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">{ruta.nombre}</h2>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              ruta.tipo === 'entrega'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}>
              {ruta.tipo === 'entrega' ? 'Entrega' : 'Recogida'}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {ruta.paradas.map(parada => (
              <div key={parada.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Encabezado parada */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-bold">
                      {parada.orden}
                    </span>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{parada.cliente}</p>
                      <p className="text-xs text-gray-400">{parada.folio}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    parada.estado === 'pendiente' ? 'bg-gray-100 text-gray-600' :
                    parada.estado === 'entregado' ? 'bg-green-100 text-green-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {parada.estado === 'pendiente' ? 'Pendiente' :
                     parada.estado === 'entregado' ? 'Entregado' : 'Recogido'}
                  </span>
                </div>

                {/* Cuerpo parada */}
                <div className="px-4 py-3 flex flex-col gap-2">
                  <p className="text-sm text-gray-600">📍 {parada.direccion}</p>
                  {parada.hora_inicio && (
                    <p className="text-sm text-gray-600">🕐 {parada.hora_inicio} – {parada.hora_fin}</p>
                  )}

                  {/* Productos */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {parada.productos.map(p => (
                      <span key={p.id} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                        {p.cantidad}× {p.nombre} {p.es_brincolin ? '🎈' : ''}
                      </span>
                    ))}
                  </div>

                  {/* Info de recogida - solo en rutas de recogida */}
                  {parada.recogida_programada && ruta.tipo === 'recogida' && (
                    <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-800 mt-1">
                      📅 Programado recoger: {parada.recogida_programada.fecha}
                      {parada.recogida_programada.tipo_horario === 'rango'
                        ? ` de ${parada.recogida_programada.hora_inicio} a ${parada.recogida_programada.hora_fin}`
                        : ` a las ${parada.recogida_programada.hora_inicio}`}
                    </div>
                  )}

                  {/* Acciones */}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => abrirMapa(parada.direccion)}
                      className="flex-1 text-sm bg-blue-50 text-blue-600 py-2 rounded-xl font-medium"
                    >
                      🗺 Mapa
                    </button>
                    <button
                      onClick={() => llamar(parada.telefono)}
                      className="flex-1 text-sm bg-green-50 text-green-600 py-2 rounded-xl font-medium"
                    >
                      📞 Llamar
                    </button>
                    {parada.estado === 'pendiente' && (
                      <button
                        onClick={() => setParadaActiva(parada)}
                        className={`flex-1 text-sm py-2 rounded-xl font-medium text-white ${
                          ruta.tipo === 'recogida' ? 'bg-blue-500' : 'bg-orange-500'
                        }`}
                      >
                        {ruta.tipo === 'recogida' ? '📦 Recoger' : '✅ Entregar'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Modal confirmar */}
      {paradaActiva && (
        <ModalConfirmar
          parada={paradaActiva}
          ruta={getRutaDeParada(paradaActiva.id)!}
          onClose={() => setParadaActiva(null)}
          onConfirmado={() => {
            setParadaActiva(null)
            api.get('/rutas/mis-rutas/').then((res: any) => setRutas(res.data))
          }}
        />
      )}
    </div>
  )
}


// ── Modal de confirmación ──────────────────────────────────────────────────────

function ModalConfirmar({
  parada,
  ruta,
  onClose,
  onConfirmado,
}: {
  parada: Parada
  ruta: Ruta
  onClose: () => void
  onConfirmado: () => void
}) {
  const esRecogida = ruta.tipo === 'recogida'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notas, setNotas] = useState('')

  // Solo para entrega
  const [cantidades, setCantidades] = useState<Record<number, number>>(
    Object.fromEntries(parada.productos.map(p => [p.id, p.cantidad]))
  )
  const [motores, setMotores] = useState<Record<number, number>>(
    Object.fromEntries(parada.productos.filter(p => p.es_brincolin).map(p => [p.id, 1]))
  )
  const [extensiones, setExtensiones] = useState<Record<number, number>>(
    Object.fromEntries(parada.productos.filter(p => p.es_brincolin).map(p => [p.id, 1]))
  )
  const [fechaRecogida, setFechaRecogida] = useState('')
  const [tipoHorario, setTipoHorario] = useState<'rango' | 'fijo'>('rango')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFin, setHoraFin] = useState('')

  const confirmar = async () => {
    setLoading(true)
    setError('')

    try {
      if (esRecogida) {
        // Recogida simple
        await api.post(`/rutas/${parada.id}/recoger/`, {
          notas_campo: notas,
        })
      } else {
        // Entrega con detalle
        if (!fechaRecogida || !horaInicio) {
          setError('Indica la fecha y hora de recogida.')
          setLoading(false)
          return
        }

        const productos = parada.productos.map(p => ({
          producto_renta_id: p.id,
          cantidad_confirmada: cantidades[p.id] ?? p.cantidad,
          motores_dejados: p.es_brincolin ? (motores[p.id] ?? 1) : 0,
          extensiones_dejadas: p.es_brincolin ? (extensiones[p.id] ?? 1) : 0,
        }))

        await api.post(`/rutas/${parada.id}/entregar/`, {
          productos,
          fecha_recogida: fechaRecogida,
          tipo_horario: tipoHorario,
          hora_inicio: horaInicio,
          hora_fin: tipoHorario === 'rango' ? horaFin : null,
          notas_campo: notas,
        })
      }

      onConfirmado()
    } catch {
      setError('Error al confirmar. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="bg-white w-full rounded-t-3xl max-h-[90vh] overflow-y-auto px-6 py-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">
            {esRecogida ? '📦 Confirmar recogida' : '✅ Confirmar entrega'}
          </h3>
          <button onClick={onClose} className="text-gray-400 text-2xl">×</button>
        </div>

        <p className="text-sm text-gray-500 mb-4">{parada.cliente} — {parada.folio}</p>

        {esRecogida ? (
          /* Formulario simple de recogida */
          <div className="mb-5">
            <div className="bg-blue-50 rounded-xl p-3 mb-4">
              <p className="text-sm text-blue-700 font-medium mb-2">Artículos a recoger:</p>
              {parada.productos.map(p => (
                <p key={p.id} className="text-sm text-blue-600">
                  • {p.cantidad}× {p.nombre} {p.es_brincolin ? '🎈' : ''}
                </p>
              ))}
            </div>
            <label className="text-sm text-gray-500 mb-1 block">Notas (opcional)</label>
            <textarea
              placeholder="Observaciones..."
              value={notas}
              onChange={e => setNotas(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm w-full"
              rows={3}
            />
          </div>
        ) : (
          /* Formulario completo de entrega */
          <>
            {/* Productos */}
            <div className="flex flex-col gap-4 mb-5">
              {parada.productos.map(p => (
                <div key={p.id} className="bg-gray-50 rounded-xl p-3">
                  <p className="font-medium text-sm mb-2">{p.nombre} {p.es_brincolin ? '🎈' : ''}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">Cantidad:</span>
                    <input
                      type="number"
                      min={0}
                      value={cantidades[p.id] ?? p.cantidad}
                      onChange={e => setCantidades(prev => ({ ...prev, [p.id]: Number(e.target.value) }))}
                      className="w-16 border rounded-lg px-2 py-1 text-sm text-center"
                    />
                  </div>
                  {p.es_brincolin && (
                    <div className="flex gap-4 mt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Motores:</span>
                        <input
                          type="number"
                          min={0}
                          value={motores[p.id] ?? 1}
                          onChange={e => setMotores(prev => ({ ...prev, [p.id]: Number(e.target.value) }))}
                          className="w-16 border rounded-lg px-2 py-1 text-sm text-center"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Extensiones:</span>
                        <input
                          type="number"
                          min={0}
                          value={extensiones[p.id] ?? 1}
                          onChange={e => setExtensiones(prev => ({ ...prev, [p.id]: Number(e.target.value) }))}
                          className="w-16 border rounded-lg px-2 py-1 text-sm text-center"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Recogida */}
            <div className="flex flex-col gap-3 mb-5">
              <p className="font-semibold text-sm">📦 Programar recogida</p>
              <input
                type="date"
                value={fechaRecogida}
                onChange={e => setFechaRecogida(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setTipoHorario('rango')}
                  className={`flex-1 text-sm py-2 rounded-xl border font-medium ${tipoHorario === 'rango' ? 'bg-orange-500 text-white border-orange-500' : 'text-gray-600'}`}
                >
                  Rango
                </button>
                <button
                  onClick={() => setTipoHorario('fijo')}
                  className={`flex-1 text-sm py-2 rounded-xl border font-medium ${tipoHorario === 'fijo' ? 'bg-orange-500 text-white border-orange-500' : 'text-gray-600'}`}
                >
                  Hora fija
                </button>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-xs text-gray-500 mb-1">{tipoHorario === 'rango' ? 'Desde' : 'A las'}</p>
                  <input
                    type="time"
                    value={horaInicio}
                    onChange={e => setHoraInicio(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                {tipoHorario === 'rango' && (
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 mb-1">Hasta</p>
                    <input
                      type="time"
                      value={horaFin}
                      onChange={e => setHoraFin(e.target.value)}
                      className="w-full border rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
              <textarea
                placeholder="Notas (opcional)"
                value={notas}
                onChange={e => setNotas(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm"
                rows={2}
              />
            </div>
          </>
        )}

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <button
          onClick={confirmar}
          disabled={loading}
          className={`w-full py-3 rounded-2xl font-semibold text-sm text-white disabled:opacity-50 ${
            esRecogida ? 'bg-blue-500' : 'bg-orange-500'
          }`}
        >
          {loading ? 'Confirmando...' : esRecogida ? 'Confirmar recogida' : 'Confirmar entrega'}
        </button>
      </div>
    </div>
  )
}