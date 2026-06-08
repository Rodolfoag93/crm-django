import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api.ts'


interface AsistenciaData {
  id: number
  fecha: string
  hora_entrada: string | null
  hora_salida: string | null
  horas_trabajadas: string | null
  ubicacion_entrada: string | null
  ubicacion_salida: string | null
}

export default function Asistencia() {
  const navigate = useNavigate()
  const [asistencia, setAsistencia] = useState<AsistenciaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAsistenciaHoy()
  }, [])

  const fetchAsistenciaHoy = async () => {
    try {
      const { data } = await api.get('/asistencias/hoy/')
      // El endpoint devuelve array directo, no paginado
      if (Array.isArray(data) && data.length > 0) {
        setAsistencia(data[0])
      } else if (data.results?.length > 0) {
        setAsistencia(data.results[0])
      }
    } catch {
      setError('Error al cargar asistencia')
    } finally {
      setLoading(false)
    }
  }

  const obtenerUbicacion = (): Promise<string> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve('')
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(`${pos.coords.latitude},${pos.coords.longitude}`),
        () => resolve('')
      )
    })
  }

  const handleCheckin = async () => {
        setProcesando(true)
        setError('')
        try {
        const ubicacion = await obtenerUbicacion()
        const { data } = await api.post('/asistencias/checkin/', {
            ubicacion,
        })
        setAsistencia(data)
        setMensaje('✅ Entrada registrada correctamente')
        } catch (e: any) {
        setError(e.response?.data?.error || 'Error al registrar entrada')
        } finally {
        setProcesando(false)
        }
    }

    const handleCheckout = async () => {
        setProcesando(true)
        setError('')
        try {
        const ubicacion = await obtenerUbicacion()
        const { data } = await api.post('/asistencias/checkout/', {
            ubicacion,
        })
        setAsistencia(data)
        setMensaje('✅ Salida registrada correctamente')
        } catch (e: any) {
        setError(e.response?.data?.error || 'Error al registrar salida')
        } finally {
        setProcesando(false)
        }
    }

  const formatHora = (dt: string | null) => {
    if (!dt) return '--:--'
    return new Date(dt).toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit'
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
        <h1 className="text-xl font-bold">Asistencia</h1>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4">

        {/* Fecha */}
        <div className="text-center text-gray-500 text-sm">
          {new Date().toLocaleDateString('es-MX', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          })}
        </div>

        {/* Card de asistencia */}
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="text-center">
              <p className="text-gray-500 text-sm mb-1">Entrada</p>
              <p className="text-2xl font-bold text-green-700">
                {formatHora(asistencia?.hora_entrada || null)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-sm mb-1">Salida</p>
              <p className="text-2xl font-bold text-red-600">
                {formatHora(asistencia?.hora_salida || null)}
              </p>
            </div>
          </div>

          {asistencia?.horas_trabajadas && (
            <div className="text-center bg-green-50 rounded-xl py-3 mb-4">
              <p className="text-gray-500 text-sm">Horas trabajadas</p>
              <p className="text-xl font-bold text-green-700">{asistencia.horas_trabajadas} hrs</p>
            </div>
          )}

          {/* Botones */}
          {!asistencia?.hora_entrada && (
            <button
              onClick={handleCheckin}
              disabled={procesando}
              className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold py-4 rounded-xl text-lg transition-colors disabled:opacity-50"
            >
              {procesando ? 'Registrando...' : '🟢 Registrar Entrada'}
            </button>
          )}

          {asistencia?.hora_entrada && !asistencia?.hora_salida && (
            <button
              onClick={handleCheckout}
              disabled={procesando}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-4 rounded-xl text-lg transition-colors disabled:opacity-50"
            >
              {procesando ? 'Registrando...' : '🔴 Registrar Salida'}
            </button>
          )}

          {asistencia?.hora_entrada && asistencia?.hora_salida && (
            <div className="text-center bg-gray-50 rounded-xl py-4">
              <p className="text-gray-600 font-medium">✅ Jornada completada</p>
            </div>
          )}
        </div>

        {/* Mensajes */}
        {mensaje && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <p className="text-green-700 text-sm">{mensaje}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

      </div>
    </div>
  )
}