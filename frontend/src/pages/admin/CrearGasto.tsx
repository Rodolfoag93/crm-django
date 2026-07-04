import { useEffect, useRef, useState } from 'react'
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

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MONTO_COMPROBANTE = 500

export default function CrearGasto() {
  const navigate = useNavigate()
  const hoy = new Date().toISOString().split('T')[0]
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/cuentas/').then(res => setCuentas(res.data))
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const seleccionarComprobante = (file: File | undefined) => {
    if (!file) return
    setError('')

    if (file.size > MAX_FILE_BYTES) {
      setError('El comprobante no puede superar 5 MB.')
      return
    }

    const esImagen = file.type.startsWith('image/')
    const esPdf = file.type === 'application/pdf'
    if (!esImagen && !esPdf) {
      setError('Comprobante debe ser PDF, JPG o PNG.')
      return
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setComprobante(file)
    setPreviewUrl(esImagen ? URL.createObjectURL(file) : null)
  }

  const quitarComprobante = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setComprobante(null)
    setPreviewUrl(null)
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async () => {
    setError('')
    if (!form.cuenta_id) return setError('Selecciona una cuenta.')
    if (!form.descripcion.trim()) return setError('Agrega una descripción.')
    if (!form.monto || Number(form.monto) <= 0) return setError('El monto debe ser mayor a 0.')

    const monto = Number(form.monto)
    if (monto > MONTO_COMPROBANTE && !comprobante) {
      return setError('Gastos mayores a $500 requieren comprobante.')
    }

    setGuardando(true)
    try {
      const fd = new FormData()
      fd.append('tipo', form.tipo)
      fd.append('categoria', form.categoria)
      fd.append('cuenta_id', form.cuenta_id)
      fd.append('descripcion', form.descripcion.trim())
      fd.append('monto', String(monto))
      fd.append('fecha', form.fecha)
      fd.append('referencia', form.referencia)
      if (comprobante) fd.append('comprobante', comprobante)

      await api.post('/crear-gasto/', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      alert('✅ Gasto registrado correctamente.')
      navigate(-1)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err.response?.data?.error || 'Error al guardar el gasto. Intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const requiereComprobante = Number(form.monto) > MONTO_COMPROBANTE

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
                {c.tipo?.toLowerCase().includes('efectivo') ? '💵' : '🏦'} {c.nombre}
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

        {/* Comprobante */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-500 font-medium">
              Comprobante {requiereComprobante && <span className="text-red-400">*</span>}
            </label>
            <p className="text-xs text-gray-400 mt-0.5">
              PDF, JPG o PNG · máx. 5 MB
              {requiereComprobante && ' · obligatorio si el monto supera $500'}
            </p>
          </div>

          {!comprobante ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="bg-green-50 border border-green-200 rounded-xl px-3 py-3 text-sm font-medium text-green-800"
              >
                📷 Tomar foto
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm font-medium text-gray-700"
              >
                📎 Elegir archivo
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Vista previa del comprobante"
                  className="w-full max-h-48 object-contain rounded-xl border border-gray-200 bg-gray-50"
                />
              ) : (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  📄 {comprobante.name}
                </div>
              )}
              <button
                type="button"
                onClick={quitarComprobante}
                className="text-sm text-red-600 font-medium text-left"
              >
                Quitar comprobante
              </button>
            </div>
          )}

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => {
              seleccionarComprobante(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf"
            className="hidden"
            onChange={e => {
              seleccionarComprobante(e.target.files?.[0])
              e.target.value = ''
            }}
          />
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
