import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../lib/api.ts'

interface PagoExtra {
  id: number
  tipo: number
  tipo_nombre: string
  monto: string
}

interface NominaDetalle {
  id: number
  empleado: number
  empleado_nombre: string
  fecha_inicio: string
  fecha_fin: string
  dias_trabajados: number
  total: string
  pagos_extra: PagoExtra[]
}

export default function NominaDetalle() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [nomina, setNomina] = useState<NominaDetalle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/nomina/${id}/`)
      .then(res => setNomina(res.data))
      .catch(() => setError('Error al cargar la nómina'))
      .finally(() => setLoading(false))
  }, [id])

  const formatFecha = (fecha: string) => {
    return new Date(fecha + 'T00:00:00').toLocaleDateString('es-MX', {
      day: '2-digit', month: 'long', year: 'numeric'
    })
  }

  const sueldoBase = nomina
  ? parseFloat(nomina.total) - (nomina.pagos_extra || []).reduce((sum, p) => sum + parseFloat(p.monto), 0)
  : 0

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  if (error || !nomina) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">{error || 'Nómina no encontrada'}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-green-300 text-xl">←</button>
        <div>
          <h1 className="text-lg font-bold">Detalle de Nómina</h1>
          <p className="text-green-300 text-xs">{nomina.empleado_nombre}</p>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">

        {/* Periodo */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 font-medium mb-2">Periodo</p>
          <p className="text-gray-900 font-semibold">
            {formatFecha(nomina.fecha_inicio)} — {formatFecha(nomina.fecha_fin)}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {nomina.dias_trabajados} días trabajados
          </p>
        </div>

        {/* Desglose */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
          <p className="text-xs text-gray-500 font-medium">Desglose</p>

          {/* Sueldo base */}
          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <p className="text-sm text-gray-700">Sueldo base</p>
            <p className="text-sm font-semibold text-gray-900">
              ${sueldoBase.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          </div>

          {/* Pagos extra */}
          {(nomina.pagos_extra || []).length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-1">Sin pagos extra</p>
            ) : (
              (nomina.pagos_extra || []).map(pago => (
              <div key={pago.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm text-gray-700">{pago.tipo_nombre}</p>
                  <p className="text-xs text-green-600">Pago extra</p>
                </div>
                <p className="text-sm font-semibold text-green-700">
                  +${parseFloat(pago.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </p>
              </div>
            ))
          )}

          {/* Total */}
          <div className="flex justify-between items-center pt-2 mt-1 border-t-2 border-green-200">
            <p className="font-bold text-gray-900">Total</p>
            <p className="text-xl font-bold text-green-700">
              ${parseFloat(nomina.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}