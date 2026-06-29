import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../lib/api'
import TicketModal from '../../components/TicketModal'

interface ProductoEncontrado { id: number; nombre: string; precio: string; tipo: string }
interface Linea { id: number; nombre: string; cantidad: number; precio_unitario: number }

function toLocalIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#8fa890', fontSize: 10.5 }}>{children}</label>
}

function Field({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors"
      style={{ borderColor: '#ddeadd', color: '#162016' }}
      onFocus={e => (e.target as HTMLElement).style.borderColor = '#16a34a'}
      onBlur={e => (e.target as HTMLElement).style.borderColor = '#ddeadd'}
    />
  )
}

const STEPS = ['Evento', 'Productos']

export default function EditarRenta() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [folio, setFolio] = useState('')

  // Step 0 — evento
  const [fechaRenta, setFechaRenta] = useState(toLocalIso(new Date()))
  const [horaInicio, setHoraInicio] = useState('10:00')
  const [horaFin, setHoraFin] = useState('14:00')
  const [calle, setCalle] = useState('')
  const [colonia, setColonia] = useState('')
  const [ciudad, setCiudad] = useState('')

  // Step 1 — productos
  const [productos, setProductos] = useState<Linea[]>([])
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<ProductoEncontrado[]>([])
  const [buscando, setBuscando] = useState(false)
  const [precioManual, setPrecioManual] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [ticketRenta, setTicketRenta] = useState<{ id: number; folio: string } | null>(null)

  // Cargar datos actuales
  useEffect(() => {
    if (!id) return
    api.get(`/rentas/${id}/`).then(r => {
      const d = r.data
      setFolio(d.folio)
      setFechaRenta(d.fecha_renta)
      setHoraInicio(d.hora_inicio?.slice(0, 5) ?? '10:00')
      setHoraFin(d.hora_fin?.slice(0, 5) ?? '14:00')
      setCalle(d.calle_y_numero)
      setColonia(d.colonia)
      setCiudad(d.ciudad_o_municipio)
      setPrecioManual(d.precio_total)
      setProductos(d.productos.map((p: { producto: number; producto_nombre: string; cantidad: number; precio_unitario: string }) => ({
        id: p.producto,
        nombre: p.producto_nombre,
        cantidad: p.cantidad,
        precio_unitario: parseFloat(p.precio_unitario),
      })))
    }).catch(() => setError('No se pudo cargar la renta.')).finally(() => setCargando(false))
  }, [id])

  // Buscar productos
  useEffect(() => {
    if (query.length < 2) { setResultados([]); return }
    const t = setTimeout(() => {
      setBuscando(true)
      api.get('/productos-buscar/', { params: { q: query } })
        .then(r => setResultados(r.data))
        .catch(console.error)
        .finally(() => setBuscando(false))
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const agregar = (p: ProductoEncontrado) => {
    if (productos.find(x => x.id === p.id)) return
    setProductos(prev => [...prev, { id: p.id, nombre: p.nombre, cantidad: 1, precio_unitario: parseFloat(p.precio) }])
    setQuery(''); setResultados([])
  }

  const actualizar = (id: number, campo: 'cantidad' | 'precio_unitario', val: number) =>
    setProductos(prev => prev.map(p => p.id === id ? { ...p, [campo]: val } : p))

  const quitar = (id: number) => setProductos(prev => prev.filter(p => p.id !== id))

  const total = productos.reduce((s, p) => s + p.cantidad * p.precio_unitario, 0)
  const totalFinal = precioManual ? parseFloat(precioManual) : total

  const guardar = async () => {
    if (!id) return
    if (productos.length === 0) { setError('Agrega al menos un producto.'); return }
    setGuardando(true); setError('')
    try {
      await api.patch(`/rentas/${id}/editar/`, {
        fecha_renta: fechaRenta,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        calle_y_numero: calle,
        colonia,
        ciudad_o_municipio: ciudad,
        ...(precioManual ? { precio_total: parseFloat(precioManual) } : {}),
        productos: productos.map(p => ({ id: p.id, cantidad: p.cantidad, precio_unitario: p.precio_unitario })),
      })
      setTicketRenta({ id: parseInt(id), folio })
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Error al guardar los cambios.')
    } finally { setGuardando(false) }
  }

  if (cargando) return (
    <div className="flex items-center justify-center h-64 gap-3">
      <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: '#ddeadd', borderTopColor: '#16a34a' }} />
      <span className="text-sm" style={{ color: '#8fa890' }}>Cargando renta…</span>
    </div>
  )

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => step > 0 ? setStep(s => s - 1) : navigate('/crm/rentas')}
          className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors"
          style={{ borderColor: '#ddeadd', color: '#5a7060' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <div>
          <h1 className="font-bold" style={{ fontSize: 20, letterSpacing: '-0.4px', color: '#162016' }}>Editar renta</h1>
          <p className="text-sm mt-0.5" style={{ color: '#8fa890', fontFamily: 'monospace' }}>{folio}</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0 mb-7">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: i < step ? '#16a34a' : i === step ? '#162016' : '#e8f0e8', color: i <= step ? 'white' : '#8fa890' }}>
                {i < step
                  ? <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  : i + 1}
              </div>
              <span className="text-sm font-medium" style={{ color: i === step ? '#162016' : '#8fa890' }}>{label}</span>
            </div>
            {i < STEPS.length - 1 && <div className="flex-1 h-px mx-3" style={{ background: i < step ? '#16a34a' : '#ddeadd' }} />}
          </div>
        ))}
      </div>

      {/* ── Step 0: Evento ── */}
      {step === 0 && (
        <div className="bg-white rounded-2xl border p-6 flex flex-col gap-5" style={{ borderColor: '#ddeadd' }}>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <Label>Fecha</Label>
              <Field type="date" value={fechaRenta} onChange={setFechaRenta} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Hora inicio</Label>
              <Field type="time" value={horaInicio} onChange={setHoraInicio} />
            </div>
            <div>
              <Label>Hora fin</Label>
              <Field type="time" value={horaFin} onChange={setHoraFin} />
            </div>
          </div>
          <div>
            <Label>Calle y número</Label>
            <Field value={calle} onChange={setCalle} placeholder="Ej: Av. Insurgentes 123" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Colonia</Label>
              <Field value={colonia} onChange={setColonia} placeholder="Colonia" />
            </div>
            <div>
              <Label>Ciudad / Municipio</Label>
              <Field value={ciudad} onChange={setCiudad} placeholder="Ciudad" />
            </div>
          </div>
          <button onClick={() => setStep(1)}
            disabled={!fechaRenta || !calle}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
            style={{ background: '#162016', color: 'white' }}>
            Continuar →
          </button>
        </div>
      )}

      {/* ── Step 1: Productos ── */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl border p-6 flex flex-col gap-4" style={{ borderColor: '#ddeadd' }}>
            <Label>Agregar producto</Label>
            <div className="relative">
              <div className="flex items-center gap-2 border rounded-xl px-3.5 py-2.5" style={{ borderColor: '#ddeadd' }}>
                <svg width="13" height="13" fill="none" stroke="#8fa890" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar producto…"
                  className="flex-1 text-sm outline-none" style={{ color: '#162016' }} />
                {buscando && <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin flex-shrink-0" style={{ borderColor: '#ddeadd', borderTopColor: '#16a34a' }} />}
              </div>
              {resultados.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border shadow-lg z-10 overflow-hidden" style={{ borderColor: '#ddeadd' }}>
                  {resultados.map(p => (
                    <button key={p.id} onClick={() => agregar(p)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors"
                      style={{ borderBottom: '1px solid #f5f8f5' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fbf8'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                      <span style={{ color: '#162016' }}>{p.nombre}</span>
                      <span style={{ color: '#8fa890' }}>${parseFloat(p.precio).toLocaleString('es-MX')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lista de productos */}
            {productos.length > 0 && (
              <div className="flex flex-col gap-2 mt-1">
                {productos.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border" style={{ borderColor: '#ddeadd' }}>
                    <span className="flex-1 text-sm font-medium" style={{ color: '#162016' }}>{p.nombre}</span>
                    {/* Cantidad */}
                    <div className="flex items-center rounded-lg border overflow-hidden" style={{ borderColor: '#ddeadd' }}>
                      <button onClick={() => actualizar(p.id, 'cantidad', Math.max(1, p.cantidad - 1))}
                        className="w-7 h-7 flex items-center justify-center text-lg font-light transition-colors"
                        style={{ color: '#5a7060', background: '#f8fbf8', borderRight: '1px solid #ddeadd' }}>−</button>
                      <input type="number" min="1" value={p.cantidad}
                        onChange={e => actualizar(p.id, 'cantidad', Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-10 text-center text-sm outline-none"
                        style={{ color: '#162016' }} />
                      <button onClick={() => actualizar(p.id, 'cantidad', p.cantidad + 1)}
                        className="w-7 h-7 flex items-center justify-center text-lg font-light transition-colors"
                        style={{ color: '#5a7060', background: '#f8fbf8', borderLeft: '1px solid #ddeadd' }}>+</button>
                    </div>
                    {/* Precio */}
                    <div className="flex items-center border rounded-lg overflow-hidden" style={{ borderColor: '#ddeadd' }}>
                      <span className="px-2 text-xs" style={{ color: '#8fa890', background: '#f8fbf8', borderRight: '1px solid #ddeadd', lineHeight: '28px' }}>$</span>
                      <input type="number" value={p.precio_unitario}
                        onChange={e => actualizar(p.id, 'precio_unitario', parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 text-sm outline-none"
                        style={{ color: '#162016' }} />
                    </div>
                    <button onClick={() => quitar(p.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors flex-shrink-0"
                      style={{ color: '#b91c1c', background: '#fff1f2' }}>
                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {productos.length === 0 && (
              <div className="text-center py-6 text-sm" style={{ color: '#8fa890' }}>
                Sin productos — busca arriba para agregar.
              </div>
            )}
          </div>

          {/* Resumen y guardar */}
          <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#ddeadd' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold" style={{ color: '#162016' }}>Total calculado</span>
              <span className="font-black tabular-nums" style={{ fontSize: 22, color: '#162016', letterSpacing: '-1px' }}>
                ${totalFinal.toLocaleString('es-MX')}
              </span>
            </div>
            <div className="mb-4">
              <Label>Precio manual (opcional)</Label>
              <div className="flex items-center border rounded-xl overflow-hidden" style={{ borderColor: '#ddeadd' }}>
                <span className="px-3 py-2.5 text-sm" style={{ color: '#8fa890', background: '#f8fbf8', borderRight: '1px solid #ddeadd' }}>$</span>
                <input type="number" value={precioManual}
                  onChange={e => setPrecioManual(e.target.value)}
                  placeholder={`${total.toLocaleString('es-MX')}`}
                  className="flex-1 px-3 py-2.5 text-sm outline-none" style={{ color: '#162016' }} />
                {precioManual && (
                  <button onClick={() => setPrecioManual('')}
                    className="px-3 text-xs" style={{ color: '#8fa890' }}>Auto</button>
                )}
              </div>
            </div>
            {error && <div className="mb-3 text-sm px-4 py-2.5 rounded-xl" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
            <button onClick={guardar} disabled={guardando || productos.length === 0}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
              style={{ background: '#16a34a', color: 'white' }}>
              {guardando ? 'Guardando…' : '✓ Guardar cambios'}
            </button>
          </div>
        </div>
      )}

      {ticketRenta && (
        <TicketModal
          rentaId={ticketRenta.id}
          folio={ticketRenta.folio}
          onClose={() => navigate('/crm/rentas')}
        />
      )}
    </div>
  )
}
