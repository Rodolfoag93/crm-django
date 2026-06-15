import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'

interface Empleado {
  id: number
  nombre: string
  sueldo_diario: string
}

function getLunes(fecha: Date): string {
  const d = new Date(fecha)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

function addDays(fecha: string, days: number): string {
  const d = new Date(fecha + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default function NuevaNomina() {
  const navigate = useNavigate()
  const lunes = getLunes(new Date())
  const domingo = addDays(lunes, 6)

  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [form, setForm] = useState({
    empleado_id: '',
    fecha_inicio: lunes,
    fecha_fin: domingo,
    dias_trabajados: '5',
  })
  const [sueldoDiario, setSueldoDiario] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/empleados/?page_size=100').then(res => {
      const data = res.data.results || res.data
      setEmpleados(data)
    })
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))

    if (name === 'empleado_id') {
      const emp = empleados.find(e => String(e.id) === value)
      setSueldoDiario(emp ? parseFloat(emp.sueldo_diario) : 0)
    }
  }

  const totalEstimado = sueldoDiario * (parseInt(form.dias_trabajados) || 0)

  const handleSubmit = async () => {
    setError('')
    if (!form.empleado_id) return setError('Selecciona un empleado.')
    if (!form.fecha_inicio || !form.fecha_fin) return setError('Ingresa las fechas.')
    if (!form.dias_trabajados || parseInt(form.dias_trabajados) < 1) return setError('Días trabajados debe ser mayor a 0.')

    setGuardando(true)
    try {
      await api.post('/nomina/', {
        empleado: parseInt(form.empleado_id),
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin,
        dias_trabajados: parseInt(form.dias_trabajados),
        total: totalEstimado,
      })
      alert('✅ Nómina creada correctamente.')
      navigate('/admin/nominas')
    } catch (err: any) {
      setError('Error al crear la nómina. Intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-green-300 text-xl">←</button>
        <h1 className="text-lg font-bold">Nueva Nómina</h1>
      </div>

      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">

        {/* Empleado */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <label className="text-xs text-gray-500 font-medium">Empleado <span className="text-red-400">*</span></label>
          <select name="empleado_id" value={form.empleado_id} onChange={handleChange}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600">
            <option value="">Selecciona un empleado...</option>
            {empleados.map(e => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
          {sueldoDiario > 0 && (
            <p className="text-xs text-green-600 mt-1">
              Sueldo diario: ${sueldoDiario.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          )}
        </div>

        {/* Fechas */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-500 font-medium">Fecha inicio <span className="text-red-400">*</span></label>
            <input type="date" name="fecha_inicio" value={form.fecha_inicio} onChange={handleChange}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Fecha fin <span className="text-red-400">*</span></label>
            <input type="date" name="fecha_fin" value={form.fecha_fin} onChange={handleChange}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
          </div>
        </div>

        {/* Días trabajados */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <label className="text-xs text-gray-500 font-medium">Días trabajados <span className="text-red-400">*</span></label>
          <input type="number" name="dias_trabajados" value={form.dias_trabajados} onChange={handleChange}
            min="1" max="7"
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
        </div>

        {/* Total estimado */}
        {sueldoDiario > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex justify-between items-center">
            <p className="text-green-700 font-medium text-sm">Total estimado</p>
            <p className="text-green-800 font-bold text-xl">
              ${totalEstimado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Botón */}
        <button
          onClick={handleSubmit}
          disabled={guardando}
          className="w-full bg-green-700 text-white py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : '💾 Crear Nómina'}
        </button>
      </div>
    </div>
  )
}