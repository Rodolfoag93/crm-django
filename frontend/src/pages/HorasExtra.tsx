import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'

interface SemanaActual {
  semana_inicio: string
  semana_fin: string
  horas_trabajadas: string
  horas_descontadas: string
  horas_computables: string
  horas_extra: string
  total_pago: string
  es_eventual: boolean
}

interface HorasExtraHistorial {
  id: number
  semana_inicio: string
  semana_fin: string
  horas_trabajadas: string
  horas_extra: string
  total_pago: string
  pagado: boolean
  fecha_pago: string | null
}

export default function HorasExtra() {
  const navigate = useNavigate()
  const [semana, setSemana] = useState<SemanaActual | null>(null)
  const [historial, setHistorial] = useState<HorasExtraHistorial[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchDatos()
  }, [])

  const fetchDatos = async () => {
    try {
      const [semanaRes, historialRes] = await Promise.all([
        api.get('/horas-extra/semana_actual/'),
        api.get('/horas-extra/')
      ])
      setSemana(semanaRes.data)
      const data = historialRes.data
      setHistorial(Array.isArray(data) ? data : data.results || [])
    } catch {
      setError('Error al cargar horas extra')
    } finally {
      setLoading(false)
    }
  }

  const formatFecha = (fecha: string) =>
    new Date(fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })

  const porcentaje = semana
    ? Math.min(100, (parseFloat(semana.horas_computables) / 43) * 100)
    : 0

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-500">Cargando...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate('/home')} className="text-green-300 text-xl">←</button>
        <h1 className="text-xl font-bold">Horas Extra</h1>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4">

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Semana actual */}
        {semana && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <h2 className="font-bold text-gray-700 mb-1">Semana actual</h2>
            <p className="text-gray-400 text-xs mb-4">
              {formatFecha(semana.semana_inicio)} — {formatFecha(semana.semana_fin)}
            </p>

            {/* Barra de progreso */}
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-500 mb-1">
                <span>Horas computables</span>
                <span className="font-bold text-green-700">{semana.horas_computables} / 43 hrs</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className="bg-green-600 h-3 rounded-full transition-all"
                  style={{ width: `${porcentaje}%` }}
                />
              </div>
            </div>

            {/* Desglose */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Horas trabajadas</span>
                <span className="font-medium">{semana.horas_trabajadas} hrs</span>
              </div>
              {parseFloat(semana.horas_descontadas) > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Descuento por eventos</span>
                  <span className="font-medium text-red-500">- {semana.horas_descontadas} hrs</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between font-bold">
                <span>Horas extra</span>
                <span className={parseFloat(semana.horas_extra) > 0 ? 'text-green-700' : 'text-gray-400'}>
                  {semana.horas_extra} hrs
                </span>
              </div>
              {parseFloat(semana.total_pago) > 0 && (
                <div className="flex justify-between font-bold text-green-700 text-base">
                  <span>A cobrar</span>
                  <span>${parseFloat(semana.total_pago).toLocaleString('es-MX')}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Historial */}
        <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
          <h2 className="font-bold text-gray-700 mb-3">Historial</h2>
          {historial.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">Sin registros anteriores</p>
          ) : (
            <div className="space-y-3">
              {historial.map(h => (
                <div key={h.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {formatFecha(h.semana_inicio)} — {formatFecha(h.semana_fin)}
                    </p>
                    <p className="text-xs text-gray-400">{h.horas_extra} hrs extra</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-700">
                      ${parseFloat(h.total_pago).toLocaleString('es-MX')}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${h.pagado ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {h.pagado ? 'Pagado' : 'Pendiente'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
