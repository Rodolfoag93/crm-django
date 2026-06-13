import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'

interface EmpleadoAsistencia {
  empleado_id: number
  nombre: string
  tipo: string
  tiene_entrada: boolean
  tiene_salida: boolean
  hora_entrada: string | null
  hora_salida: string | null
  horas_trabajadas: string | null
}

interface AsistenciaData {
  fecha: string
  total: number
  con_entrada: number
  con_salida: number
  empleados: EmpleadoAsistencia[]
}

export default function AsistenciaHoy() {
  const navigate = useNavigate()
  const [data, setData] = useState<AsistenciaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'todos' | 'presentes' | 'ausentes'>('todos')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    api.get('/asistencia-hoy/')
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-gray-500">Cargando asistencia...</p>
    </div>
  )

  const empleados = data?.empleados || []
  const filtrados = empleados
    .filter(e => {
      if (filtro === 'presentes') return e.tiene_entrada
      if (filtro === 'ausentes') return !e.tiene_entrada
      return true
    })
    .filter(e => e.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate('/home')} className="text-green-300 text-xl">←</button>
        <h1 className="text-xl font-bold">👥 Asistencia de hoy</h1>
      </div>

      <div className="p-4 max-w-lg mx-auto">

        {/* Resumen */}
        {data && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 text-center">
              <p className="text-2xl font-bold text-gray-800">{data.total}</p>
              <p className="text-xs text-gray-400">Total</p>
            </div>
            <div className="bg-green-50 rounded-2xl border border-green-100 p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{data.con_entrada}</p>
              <p className="text-xs text-green-500">Presentes</p>
            </div>
            <div className="bg-red-50 rounded-2xl border border-red-100 p-3 text-center">
              <p className="text-2xl font-bold text-red-600">{data.total - data.con_entrada}</p>
              <p className="text-xs text-red-400">Ausentes</p>
            </div>
          </div>
        )}

        {/* Búsqueda */}
        <input
          type="text"
          placeholder="Buscar empleado..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full border rounded-xl px-4 py-2 text-sm mb-3"
        />

        {/* Filtros */}
        <div className="flex gap-2 mb-4">
          {(['todos', 'presentes', 'ausentes'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`flex-1 text-xs py-2 rounded-xl border font-medium ${
                filtro === f ? 'bg-green-800 text-white border-green-800' : 'text-gray-600 bg-white'
              }`}
            >
              {f === 'todos' ? 'Todos' : f === 'presentes' ? '🟢 Presentes' : '🔴 Ausentes'}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="flex flex-col gap-2">
          {filtrados.length === 0 && (
            <p className="text-center text-gray-400 py-8">Sin resultados.</p>
          )}
          {filtrados.map(e => (
            <div key={e.empleado_id} className={`bg-white rounded-2xl shadow-sm border p-4 flex items-center gap-3 ${
              e.tiene_entrada ? 'border-green-100' : 'border-red-100'
            }`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                e.tiene_entrada ? 'bg-green-100' : 'bg-red-100'
              }`}>
                {e.tiene_entrada ? '✅' : '❌'}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 text-sm">{e.nombre}</p>
                <p className="text-xs text-gray-400">{e.tipo}</p>
              </div>
              <div className="text-right">
                {e.tiene_entrada ? (
                  <div>
                    <p className="text-xs text-green-600 font-medium">🟢 {e.hora_entrada?.slice(0, 5)}</p>
                    {e.tiene_salida
                      ? <p className="text-xs text-red-500">🔴 {e.hora_salida?.slice(0, 5)}</p>
                      : <p className="text-xs text-gray-400">Sin salida</p>
                    }
                    {e.horas_trabajadas && (
                      <p className="text-xs text-gray-500">{e.horas_trabajadas} hrs</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-red-400">No registrado</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}