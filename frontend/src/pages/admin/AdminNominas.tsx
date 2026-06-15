import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'

interface Empleado {
  id: number
  nombre: string
}

interface Nomina {
  id: number
  empleado: number
  empleado_nombre: string
  fecha_inicio: string
  fecha_fin: string
  dias_trabajados: number
  total: string
}

function getLunes(fecha: Date): string {
  const d = new Date(fecha)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

function addDays(fecha: string, days: number): string {
  const d = new Date(fecha)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y}`
}

export default function AdminNominas() {
  const navigate = useNavigate()
  const [nominas, setNominas] = useState<Nomina[]>([])
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [loading, setLoading] = useState(true)
  const [semana, setSemana] = useState(() => getLunes(new Date()))
  const [empleadoId, setEmpleadoId] = useState('')

  useEffect(() => {
    api.get('/empleados/?page_size=100').then(res => {
      const data = res.data.results || res.data
      setEmpleados(data)
    })
  }, [])

  useEffect(() => {
    cargar()
  }, [semana, empleadoId])

  const cargar = async () => {
    setLoading(true)
    try {
      let url = `/nomina/?fecha_inicio=${semana}`
      if (empleadoId) url += `&empleado_id=${empleadoId}`
      const res = await api.get(url)
      const data = res.data.results || res.data
      setNominas(data)
    } catch {
      console.error('Error cargando nóminas')
    } finally {
      setLoading(false)
    }
  }

  const semanaAnterior = () => setSemana(addDays(semana, -7))
  const semanaSiguiente = () => setSemana(addDays(semana, 7))
  const domingo = addDays(semana, 6)

  const totalSemana = nominas.reduce((acc, n) => acc + parseFloat(n.total), 0)

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-green-300 text-xl">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Nóminas</h1>
          <p className="text-green-300 text-xs">{nominas.length} registros esta semana</p>
        </div>
        <button
          onClick={() => navigate('/admin/nominas/nueva')}
          className="bg-green-700 text-white text-xs px-3 py-1.5 rounded-xl font-medium"
        >
          + Nueva
        </button>
      </div>

      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">

        {/* Navegación de semana */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <button onClick={semanaAnterior} className="text-green-700 text-xl px-2">‹</button>
            <div className="text-center">
              <p className="font-semibold text-gray-800 text-sm">
                {formatFecha(semana)} — {formatFecha(domingo)}
              </p>
              <p className="text-xs text-gray-400">Semana</p>
            </div>
            <button onClick={semanaSiguiente} className="text-green-700 text-xl px-2">›</button>
          </div>
        </div>

        {/* Filtro por empleado */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <label className="text-xs text-gray-500 font-medium">Filtrar por empleado</label>
          <select
            value={empleadoId}
            onChange={e => setEmpleadoId(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          >
            <option value="">Todos los empleados</option>
            {empleados.map(e => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        </div>

        {/* Total semana */}
        {!loading && nominas.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex justify-between items-center">
            <p className="text-green-700 font-medium text-sm">Total nómina semana</p>
            <p className="text-green-800 font-bold text-lg">
              ${totalSemana.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}

        {/* Lista nóminas */}
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Cargando...</div>
        ) : nominas.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No hay nóminas para esta semana.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {nominas.map(n => (
              <div key={n.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900">{n.empleado_nombre}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatFecha(n.fecha_inicio)} — {formatFecha(n.fecha_fin)}
                    </p>
                    <p className="text-xs text-gray-400">{n.dias_trabajados} días trabajados</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-700 text-lg">
                      ${parseFloat(n.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}