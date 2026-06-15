import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'

interface Cuenta {
  id: number
  nombre: string
  tipo: string
}

const TIPOS = [
  { value: 'GASTO', label: 'Gasto General' },
  { value: 'COMPRA', label: 'Compra' },
]

const CATEGORIAS = [
  { value: 'INSUMOS', label: 'Insumos' },
  { value: 'GASOLINA', label: 'Gasolina' },
  { value: 'REFACCIONES', label: 'Refacciones' },
  { value: 'CONSUMIBLES', label: 'Consumibles' },
  { value: 'SEGURO', label: 'Seguro' },
  { value: 'IMPUESTOS', label: 'Impuestos' },
  { value: 'NOMINA', label: 'Nómina' },
]

export default function CrearGasto() {
  const navigate = useNavigate()
  const hoy = new Date().toISOString().split('T')[0]

  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [form, setForm] = useState({
    tipo: 'GASTO',
    categoria: 'INSUMOS',
    cuenta_id: '',
    descripcion: '',
    monto: '',
    fecha: hoy,
    referencia: '',
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/cuentas/').then(res => setCuentas(res.data))
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async () => {
    setError('')
    if (!form.cuenta_id) return setError('Selecciona una cuenta.')
    if (!form.descripcion.trim()) return setError('Agrega una descripción.')
    if (!form.monto || Number(form.monto) <= 0) return setError('El monto debe ser mayor a 0.')

    setGuardando(true)
    try {
      await api.post('/crear-gasto/', {
        ...form,
        monto: Number(form.monto),
        cuenta_id: Number(form.cuenta_id),
      })
      alert('✅ Gasto registrado correctamente.')
      navigate(-1)
    } catch {
      setError('Error al guardar el gasto. Intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-green-300 text-xl">←</button>
        <h1 className="text-lg font-bold">Registrar Gasto</h1>
      </div>

      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4">

        {/* Tipo y Categoría */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-500 font-medium">Tipo</label>
            <select name="tipo" value={form.tipo} onChange={handleChange}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600">
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Categoría</label>
            <select name="categoria" value={form.categoria} onChange={handleChange}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600">
              {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        {/* Cuenta */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <label className="text-xs text-gray-500 font-medium">Cuenta <span className="text-red-400">*</span></label>
          <select name="cuenta_id" value={form.cuenta_id} onChange={handleChange}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600">
            <option value="">Selecciona una cuenta...</option>
            {cuentas.map(c => (
              <option key={c.id} value={c.id}>
                {c.tipo === 'efectivo' ? '💵' : '🏦'} {c.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Descripción */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <label className="text-xs text-gray-500 font-medium">Descripción <span className="text-red-400">*</span></label>
          <textarea name="descripcion" value={form.descripcion} onChange={handleChange}
            rows={2} placeholder="Ej. Compra de gasolina para entregas..."
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none" />
        </div>

        {/* Monto y Fecha */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-500 font-medium">Monto <span className="text-red-400">*</span></label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="number" name="monto" value={form.monto} onChange={handleChange}
                placeholder="0.00" min="0" step="0.01"
                className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Fecha</label>
            <input type="date" name="fecha" value={form.fecha} onChange={handleChange}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
          </div>
        </div>

        {/* Referencia */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <label className="text-xs text-gray-500 font-medium">Referencia <span className="text-gray-300">(opcional)</span></label>
          <input type="text" name="referencia" value={form.referencia} onChange={handleChange}
            placeholder="Ej. Factura #123, ticket, etc."
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
        </div>

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
          {guardando ? 'Guardando...' : '💾 Registrar Gasto'}
        </button>
      </div>
    </div>
  )
}