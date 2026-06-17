import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import api from '../../lib/api'

interface Evento {
  asignacion_id: number
  renta_id: number
  folio: string
  cliente: string
  telefono: string
  fecha: string
  hora_inicio: string | null
  hora_fin: string | null
  direccion: string
  servicios: string[]
  notas: string
  tiene_lista: boolean
}

export default function HomeCoordinador() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'proximos' | 'todos'>('proximos')

  useEffect(() => {
    api.get('/coordinador/eventos/')
      .then(res => setEventos(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const hoy = new Date().toISOString().split('T')[0]

  const eventosFiltrados = filtro === 'proximos'
    ? eventos.filter(e => e.fecha >= hoy)
    : eventos

  const formatFecha = (fecha: string) => {
    return new Date(fecha + 'T00:00:00').toLocaleDateString('es-MX', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    })
  }

  const esHoy = (fecha: string) => fecha === hoy

  const esPasado = (fecha: string) => fecha < hoy

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-green-300 text-sm">Coordinador</p>
            <h1 className="text-xl font-bold">{user?.nombre}</h1>
          </div>
          <button
            onClick={handleLogout}
            className="bg-green-800 px-3 py-2 rounded-lg text-sm"
          >
            Salir
          </button>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">

        {/* Accesos rápidos */}
        <div className="grid grid-cols-2 gap-3">
          <div
            onClick={() => navigate('/nomina')}
            className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center gap-2 cursor-pointer border border-gray-100"
          >
            <span className="text-3xl">💰</span>
            <p className="font-semibold text-gray-900 text-sm">Mis Recibos</p>
          </div>
          <div
            onClick={() => navigate('/coordinador/catalogo')}
            className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center gap-2 cursor-pointer border border-gray-100"
          >
            <span className="text-3xl">📦</span>
            <p className="font-semibold text-gray-900 text-sm">Catálogo</p>
          </div>
        </div>

        {/* Filtro */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1 flex">
          <button
            onClick={() => setFiltro('proximos')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              filtro === 'proximos'
                ? 'bg-green-700 text-white'
                : 'text-gray-500'
            }`}
          >
            Próximos
          </button>
          <button
            onClick={() => setFiltro('todos')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              filtro === 'todos'
                ? 'bg-green-700 text-white'
                : 'text-gray-500'
            }`}
          >
            Todos
          </button>
        </div>

        {/* Lista de eventos */}
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Cargando eventos...</div>
        ) : eventosFiltrados.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-4xl mb-3">📅</p>
            <p className="text-sm">No hay eventos {filtro === 'proximos' ? 'próximos' : ''}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {eventosFiltrados.map(evento => (
              <div
                key={evento.asignacion_id}
                onClick={() => navigate(`/coordinador/eventos/${evento.asignacion_id}`)}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer active:scale-95 transition-transform"
              >
                {/* Badge fecha */}
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    esHoy(evento.fecha)
                      ? 'bg-green-100 text-green-700'
                      : esPasado(evento.fecha)
                      ? 'bg-gray-100 text-gray-400'
                      : 'bg-blue-50 text-blue-600'
                  }`}>
                    {esHoy(evento.fecha) ? '🟢 Hoy' : formatFecha(evento.fecha)}
                  </span>
                  {evento.tiene_lista ? (
                    <span className="text-xs text-green-600 font-medium">✓ Lista lista</span>
                  ) : (
                    <span className="text-xs text-amber-500 font-medium">⚠ Sin lista</span>
                  )}
                </div>

                {/* Cliente */}
                <p className="font-bold text-gray-900">{evento.cliente}</p>
                <p className="text-xs text-gray-400 mt-0.5">{evento.telefono}</p>

                {/* Hora */}
                {evento.hora_inicio && (
                  <p className="text-sm text-gray-600 mt-1">
                    🕐 {evento.hora_inicio} — {evento.hora_fin}
                  </p>
                )}

                {/* Dirección */}
                <p className="text-xs text-gray-500 mt-1 truncate">📍 {evento.direccion}</p>

                {/* Servicios */}
                {evento.servicios.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {evento.servicios.map((s, i) => (
                      <span key={i} className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                <p className="text-xs text-green-600 font-medium mt-2 text-right">Ver detalle →</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}