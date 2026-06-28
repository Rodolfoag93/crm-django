import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'

interface Empleado {
  id: number
  nombre: string
  sueldo_diario: string
}

interface TipoPagoExtra {
  id: number
  nombre: string
  monto: string
  descuenta_horas: boolean
  horas_a_descontar: string
}

interface PagoExtraSeleccionado {
  tipo: TipoPagoExtra
  monto: number
}

interface Asistencia {
  id: number
  fecha: string
  hora_entrada: string | null
  hora_salida: string | null
  horas_trabajadas: string | null
  tipo_jornada: string
}

const JORNADA_LABEL: Record<string, string> = {
  COMPLETA: 'Completa',
  MEDIO_TIEMPO: 'Medio tiempo',
  EVENTO: 'Evento',
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

function formatFecha(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function formatHora(dt: string | null): string {
  if (!dt) return '—'
  return new Date(dt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

export default function NuevaNomina() {
  const navigate = useNavigate()
  const lunes = getLunes(new Date())
  const domingo = addDays(lunes, 6)

  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [catalogoPagos, setCatalogoPagos] = useState<TipoPagoExtra[]>([])
  const [pagosExtra, setPagosExtra] = useState<PagoExtraSeleccionado[]>([])
  const [tipoSeleccionado, setTipoSeleccionado] = useState('')
  const [asistencias, setAsistencias] = useState<Asistencia[]>([])
  const [cargandoAsistencias, setCargandoAsistencias] = useState(false)

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
      setEmpleados(res.data.results || res.data)
    })
    api.get('/nomina/pagos-extra-catalogo/').then(res => {
      setCatalogoPagos(res.data)
    })
  }, [])

  // Cargar asistencias cuando cambia empleado o fechas
  useEffect(() => {
    if (!form.empleado_id || !form.fecha_inicio || !form.fecha_fin) {
      setAsistencias([])
      return
    }
    setCargandoAsistencias(true)
    api.get('/asistencias/', {
      params: {
        empleado: form.empleado_id,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin,
      }
    })
      .then(res => {
        const data: Asistencia[] = res.data.results || res.data
        setAsistencias(data)
        setForm(prev => ({ ...prev, dias_trabajados: String(data.length) }))
      })
      .catch(() => setAsistencias([]))
      .finally(() => setCargandoAsistencias(false))
  }, [form.empleado_id, form.fecha_inicio, form.fecha_fin])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    if (name === 'empleado_id') {
      const emp = empleados.find(e => String(e.id) === value)
      setSueldoDiario(emp ? parseFloat(emp.sueldo_diario) : 0)
    }
  }

  const agregarPagoExtra = () => {
    if (!tipoSeleccionado) return
    const tipo = catalogoPagos.find(t => String(t.id) === tipoSeleccionado)
    if (!tipo) return
    if (pagosExtra.find(p => p.tipo.id === tipo.id)) {
      setError('Ya agregaste ese tipo de pago extra.')
      return
    }
    setPagosExtra(prev => [...prev, { tipo, monto: parseFloat(tipo.monto) }])
    setTipoSeleccionado('')
    setError('')
  }

  const actualizarMontoPago = (index: number, valor: string) => {
    setPagosExtra(prev =>
      prev.map((p, i) => i === index ? { ...p, monto: parseFloat(valor) || 0 } : p)
    )
  }

  const quitarPagoExtra = (index: number) => {
    setPagosExtra(prev => prev.filter((_, i) => i !== index))
  }

  const sueldoBase = sueldoDiario * (parseInt(form.dias_trabajados) || 0)
  const totalPagosExtra = pagosExtra.reduce((sum, p) => sum + p.monto, 0)
  const totalFinal = sueldoBase + totalPagosExtra

  const handleSubmit = async () => {
    setError('')
    if (!form.empleado_id) return setError('Selecciona un empleado.')
    if (!form.fecha_inicio || !form.fecha_fin) return setError('Ingresa las fechas.')
    if (!form.dias_trabajados || parseInt(form.dias_trabajados) < 1)
      return setError('Días trabajados debe ser mayor a 0.')

    setGuardando(true)
    try {
      const res = await api.post('/nomina/', {
        empleado: parseInt(form.empleado_id),
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin,
        dias_trabajados: parseInt(form.dias_trabajados),
      })
      const nominaId = res.data.id
      for (const pago of pagosExtra) {
        await api.post(`/nomina/${nominaId}/pagos-extra/`, {
          tipo_id: pago.tipo.id,
          monto: pago.monto,
        })
      }
      alert('✅ Nómina creada correctamente.')
      navigate('/admin/nominas')
    } catch {
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
          <label className="text-xs text-gray-500 font-medium">
            Empleado <span className="text-red-400">*</span>
          </label>
          <select
            name="empleado_id"
            value={form.empleado_id}
            onChange={handleChange}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          >
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
            <label className="text-xs text-gray-500 font-medium">
              Fecha inicio <span className="text-red-400">*</span>
            </label>
            <input
              type="date" name="fecha_inicio" value={form.fecha_inicio}
              onChange={handleChange}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">
              Fecha fin <span className="text-red-400">*</span>
            </label>
            <input
              type="date" name="fecha_fin" value={form.fecha_fin}
              onChange={handleChange}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
            />
          </div>
        </div>

        {/* Asistencias del periodo */}
        {form.empleado_id && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700">Asistencias del periodo</p>
              {cargandoAsistencias
                ? <span className="text-xs text-gray-400">Cargando...</span>
                : <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                    {asistencias.length} día{asistencias.length !== 1 ? 's' : ''}
                  </span>
              }
            </div>

            {cargandoAsistencias ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : asistencias.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">
                Sin registros de asistencia en este periodo
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {asistencias.map(a => (
                  <div key={a.id} className="flex items-center justify-between bg-green-50 border border-green-100 rounded-xl px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-gray-800 capitalize">{formatFecha(a.fecha)}</p>
                      <p className="text-xs text-gray-500">
                        {formatHora(a.hora_entrada)} – {formatHora(a.hora_salida)}
                        {a.horas_trabajadas && (
                          <span className="ml-1 text-green-600">({parseFloat(a.horas_trabajadas).toFixed(1)}h)</span>
                        )}
                      </p>
                    </div>
                    <span className="text-xs text-gray-500 bg-white border border-gray-100 px-2 py-0.5 rounded-full">
                      {JORNADA_LABEL[a.tipo_jornada] ?? a.tipo_jornada}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Días trabajados */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <label className="text-xs text-gray-500 font-medium">
            Días trabajados <span className="text-red-400">*</span>
          </label>
          {asistencias.length > 0 && (
            <p className="text-xs text-green-600 mb-1">
              Pre-calculado desde asistencias — puedes ajustar si es necesario
            </p>
          )}
          <input
            type="number" name="dias_trabajados" value={form.dias_trabajados}
            onChange={handleChange} min="1" max="31"
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>

        {/* Sueldo base */}
        {sueldoDiario > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex justify-between items-center">
            <p className="text-gray-500 text-sm">Sueldo base</p>
            <p className="text-gray-700 font-semibold text-base">
              ${sueldoBase.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}

        {/* Pagos Extra */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-gray-700">Pagos extra</p>
          <div className="flex gap-2">
            <select
              value={tipoSeleccionado}
              onChange={e => setTipoSeleccionado(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
            >
              <option value="">Selecciona tipo...</option>
              {catalogoPagos.map(t => (
                <option key={t.id} value={t.id}>
                  {t.nombre} — ${parseFloat(t.monto).toLocaleString('es-MX')}
                </option>
              ))}
            </select>
            <button
              onClick={agregarPagoExtra}
              className="bg-green-700 text-white px-4 rounded-xl text-sm font-semibold"
            >
              + Agregar
            </button>
          </div>
          {pagosExtra.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">Sin pagos extra agregados</p>
          ) : (
            <div className="flex flex-col gap-2">
              {pagosExtra.map((pago, index) => (
                <div key={index} className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-gray-700">{pago.tipo.nombre}</p>
                    {pago.tipo.descuenta_horas && (
                      <p className="text-xs text-amber-600">Descuenta {pago.tipo.horas_a_descontar}h</p>
                    )}
                  </div>
                  <input
                    type="number"
                    value={pago.monto}
                    onChange={e => actualizarMontoPago(index, e.target.value)}
                    className="w-24 border border-green-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button onClick={() => quitarPagoExtra(index)} className="text-red-400 text-lg leading-none pl-1">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Total final */}
        {sueldoDiario > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
            <div className="flex justify-between items-center">
              <p className="text-green-700 text-sm">Sueldo base</p>
              <p className="text-green-700 text-sm">${sueldoBase.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
            {pagosExtra.length > 0 && (
              <div className="flex justify-between items-center mt-1">
                <p className="text-green-700 text-sm">Pagos extra</p>
                <p className="text-green-700 text-sm">+${totalPagosExtra.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
              </div>
            )}
            <div className="border-t border-green-200 mt-2 pt-2 flex justify-between items-center">
              <p className="text-green-800 font-semibold text-sm">Total</p>
              <p className="text-green-800 font-bold text-xl">${totalFinal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

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
