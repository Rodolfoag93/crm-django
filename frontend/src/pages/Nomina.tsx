import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api.ts'
import { useAuthStore } from '../stores/authStore.ts'

interface NominaData {
  id: number
  empleado: number
  empleado_nombre: string
  fecha_inicio: string
  fecha_fin: string
  dias_trabajados: number
  total: string
}

export default function Nomina() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const esCoordinador = user?.tipo_empleado === 'COORDINADOR'
  const [nominas, setNominas] = useState<NominaData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchNominas()
  }, [])

  const fetchNominas = async () => {
    try {
      const { data } = await api.get('/nomina/')
      setNominas(data.results || data)
    } catch {
      setError('Error al cargar nómina')
    } finally {
      setLoading(false)
    }
  }

  const formatFecha = (fecha: string) => {
    return new Date(fecha + 'T00:00:00').toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Cargando...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate('/home')} className="text-green-300 text-xl">←</button>
        <h1 className="text-xl font-bold">
          {esCoordinador ? 'Mis Recibos' : 'Mi Nómina'}
        </h1>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-3">

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {nominas.length === 0 && !error && (
          <div className="text-center text-gray-500 py-10">
            No hay registros de {esCoordinador ? 'recibos' : 'nómina'}
          </div>
        )}

        {nominas.map((nomina) => (
          <div
            key={nomina.id}
            onClick={() => navigate(`/nomina/${nomina.id}`)}
            className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100 cursor-pointer active:scale-95 transition-transform"
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-sm text-gray-500">Periodo</p>
                <p className="font-semibold text-gray-900">
                  {formatFecha(nomina.fecha_inicio)} — {formatFecha(nomina.fecha_fin)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Total</p>
                <p className="text-xl font-bold text-green-700">
                  ${parseFloat(nomina.total).toLocaleString('es-MX')}
                </p>
              </div>
            </div>
            <div className="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-2">
              <p className="text-sm text-gray-500">
                Días trabajados: <span className="font-semibold text-gray-900">{nomina.dias_trabajados}</span>
              </p>
              <p className="text-xs text-green-600 font-medium">Ver detalle →</p>
            </div>
          </div>
        ))}

      </div>
    </div>
  )
}