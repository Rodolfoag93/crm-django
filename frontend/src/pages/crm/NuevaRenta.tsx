import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import TicketModal from '../../components/TicketModal'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClienteEncontrado {
  id: number; nombre: string; telefono: string
  calle_y_numero: string; colonia: string; ciudad_o_municipio: string
}

interface ProductoEncontrado {
  id: number; nombre: string; precio: string; tipo: string
}

interface LineaProducto {
  id: number; nombre: string; cantidad: number; precio_unitario: number
}

interface MantelOpcion {
  id: number; nombre: string; color: string; unidades_libres: number
}

interface PromoPreview {
  sillas_total: number
  mesas_por_familia: Record<string, number>
  manteles_regalo: Record<string, number>
  total_regalos: number
  opciones?: Record<string, { cantidad_regalo: number; colores_disponibles: MantelOpcion[] }>
}

const FAMILIA_LABEL: Record<string, string> = {
  TABLON: 'Tablón',
  INFANTIL: 'Infantil',
  REDONDO: 'Redondo',
  IMPERIAL: 'Imperial',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toLocalIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#8fa890', fontSize: 10.5 }}>{children}</label>
}

function Input({ value, onChange, placeholder, type = 'text', autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; autoFocus?: boolean
}) {
  return (
    <input
      type={type} value={value} placeholder={placeholder} autoFocus={autoFocus}
      onChange={e => onChange(e.target.value)}
      className="w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors"
      style={{ borderColor: '#ddeadd', color: '#162016' }}
      onFocus={e => (e.target as HTMLElement).style.borderColor = '#16a34a'}
      onBlur={e => (e.target as HTMLElement).style.borderColor = '#ddeadd'}
    />
  )
}

// ─── Step indicator ──────────────────────────────────────────────────────────

const STEPS = ['Cliente', 'Evento', 'Productos y pago']

function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0 mb-7">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{
                background: i < step ? '#16a34a' : i === step ? '#162016' : '#e8f0e8',
                color: i <= step ? 'white' : '#8fa890',
              }}>
              {i < step ? (
                <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              ) : i + 1}
            </div>
            <span className="text-sm font-medium whitespace-nowrap" style={{ color: i === step ? '#162016' : '#8fa890' }}>{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="flex-1 h-px mx-3" style={{ background: i < step ? '#16a34a' : '#ddeadd' }} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NuevaRenta() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  // — Step 1: cliente —
  const [telefono, setTelefono] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [sugerencias, setSugerencias] = useState<ClienteEncontrado[]>([])
  const [clienteId, setClienteId] = useState<number | null>(null)
  const [nombre, setNombre] = useState('')
  const [calleCliente, setCalleCliente] = useState('')
  const [coloniaCliente, setColoniaCliente] = useState('')
  const [ciudadCliente, setCiudadCliente] = useState('')
  const [clienteNuevo, setClienteNuevo] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // — Step 2: evento —
  const [fechaRenta, setFechaRenta] = useState(toLocalIso(new Date()))
  const [horaInicio, setHoraInicio] = useState('10:00')
  const [horaFin, setHoraFin] = useState('14:00')
  const [calle, setCalle] = useState('')
  const [colonia, setColonia] = useState('')
  const [ciudad, setCiudad] = useState('')

  // — Step 3: productos y pago —
  const [queryProducto, setQueryProducto] = useState('')
  const [resultProductos, setResultProductos] = useState<ProductoEncontrado[]>([])
  const [buscandoProducto, setBuscandoProducto] = useState(false)
  const [productos, setProductos] = useState<LineaProducto[]>([])
  const [precioManual, setPrecioManual] = useState('')
  const [anticipo, setAnticipo] = useState('')
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'transferencia'>('efectivo')
  const [cuentaAnticipoId, setCuentaAnticipoId] = useState<number | ''>('')
  const [cuentas, setCuentas] = useState<{ id: number; nombre: string; banco?: string; tipo: string }[]>([])
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [ticketRenta, setTicketRenta] = useState<{ id: number; folio: string } | null>(null)
  const [promoPreview, setPromoPreview] = useState<PromoPreview | null>(null)
  const [eleccionesRegalo, setEleccionesRegalo] = useState<Record<string, number[]>>({})

  // — Buscar cliente por teléfono —
  useEffect(() => {
    if (telefono.length < 7) { setSugerencias([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setBuscando(true)
      api.get('/clientes-buscar/', { params: { q: telefono } })
        .then(r => setSugerencias(r.data))
        .catch(console.error)
        .finally(() => setBuscando(false))
    }, 350)
  }, [telefono])

  const seleccionarCliente = (c: ClienteEncontrado) => {
    setClienteId(c.id)
    setNombre(c.nombre)
    setCalleCliente(c.calle_y_numero)
    setColoniaCliente(c.colonia)
    setCiudadCliente(c.ciudad_o_municipio)
    setSugerencias([])
    setClienteNuevo(false)
  }

  const noExiste = () => {
    setClienteId(null)
    setNombre('')
    setCalleCliente('')
    setColoniaCliente('')
    setCiudadCliente('')
    setSugerencias([])
    setClienteNuevo(true)
  }

  const avanzarDesdeCliente = () => {
    if (!nombre.trim() || !telefono.trim()) return
    // Pre-rellenar dirección del evento con la del cliente
    setCalle(calleCliente)
    setColonia(coloniaCliente)
    setCiudad(ciudadCliente)
    setStep(1)
  }

  // — Buscar productos —
  useEffect(() => {
    if (queryProducto.length < 2) { setResultProductos([]); return }
    const t = setTimeout(() => {
      setBuscandoProducto(true)
      api.get('/productos-buscar/', { params: { q: queryProducto } })
        .then(r => setResultProductos(r.data))
        .catch(console.error)
        .finally(() => setBuscandoProducto(false))
    }, 300)
    return () => clearTimeout(t)
  }, [queryProducto])

  const agregarProducto = (p: ProductoEncontrado) => {
    if (productos.find(x => x.id === p.id)) return
    setProductos(prev => [...prev, { id: p.id, nombre: p.nombre, cantidad: 1, precio_unitario: parseFloat(p.precio) }])
    setQueryProducto('')
    setResultProductos([])
  }

  const actualizarLinea = (id: number, campo: 'cantidad' | 'precio_unitario', valor: number) => {
    setProductos(prev => prev.map(p => p.id === id ? { ...p, [campo]: valor } : p))
  }

  const quitarProducto = (id: number) => setProductos(prev => prev.filter(p => p.id !== id))

  const totalCalculado = productos.reduce((s, p) => s + p.cantidad * p.precio_unitario, 0)
  const totalFinal = precioManual ? parseFloat(precioManual) : totalCalculado

  useEffect(() => {
    if (step !== 2 || productos.length === 0) {
      setPromoPreview(null)
      setEleccionesRegalo({})
      return
    }
    api.post('/bot/promo-mantel/preview/', {
      productos: productos.map(p => ({ id: p.id, cantidad: p.cantidad })),
      fecha_renta: fechaRenta,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
    })
      .then(res => {
        setPromoPreview(res.data)
        const nuevas: Record<string, number[]> = {}
        const opciones = res.data.opciones || {}
        for (const [familia, info] of Object.entries(opciones) as [string, { cantidad_regalo: number; colores_disponibles: MantelOpcion[] }][]) {
          const defaultId = info.colores_disponibles[0]?.id || 0
          nuevas[familia] = Array.from({ length: info.cantidad_regalo }, () => defaultId)
        }
        setEleccionesRegalo(nuevas)
      })
      .catch(() => {
        setPromoPreview(null)
        setEleccionesRegalo({})
      })
  }, [step, productos, fechaRenta, horaInicio, horaFin])

  const construirMantelesRegalo = () => {
    const conteo: Record<number, number> = {}
    Object.values(eleccionesRegalo).flat().forEach(id => {
      if (id) conteo[id] = (conteo[id] || 0) + 1
    })
    return Object.entries(conteo).map(([id, cantidad]) => ({
      producto_id: parseInt(id, 10),
      cantidad,
    }))
  }

  const regaloCompleto = () => {
    if (!promoPreview?.total_regalos) return true
    const totalElegido = Object.values(eleccionesRegalo).flat().filter(Boolean).length
    return totalElegido === promoPreview.total_regalos
  }

  // — Enviar —
  const guardar = async () => {
    setError('')
    if (productos.length === 0) { setError('Agrega al menos un producto.'); return }
    if (promoPreview?.total_regalos && !regaloCompleto()) {
      setError('Selecciona el color de todos los manteles incluidos.')
      return
    }
    setGuardando(true)
    try {
      const payload: Record<string, unknown> = {
        fecha_renta: fechaRenta,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        calle_y_numero: calle,
        colonia: colonia,
        ciudad_o_municipio: ciudad,
        precio_total: totalFinal || null,
        anticipo: anticipo ? parseFloat(anticipo) : 0,
        metodo_pago: metodoPago,
        ...(metodoPago === 'transferencia' && cuentaAnticipoId ? { cuenta_anticipo_id: cuentaAnticipoId } : {}),
        notas,
        productos: productos.map(p => ({
          id: p.id,
          cantidad: p.cantidad,
          precio_unitario: p.precio_unitario,
        })),
      }
      const mantelesRegalo = construirMantelesRegalo()
      if (mantelesRegalo.length > 0) {
        payload.manteles_regalo = mantelesRegalo
      }
      if (clienteId) {
        payload.cliente_id = clienteId
      } else {
        payload.cliente_nombre = nombre
        payload.cliente_telefono = telefono
        payload.cliente_direccion = calleCliente
        payload.cliente_colonia = coloniaCliente
        payload.cliente_ciudad = ciudadCliente
      }
      const r = await api.post('/nueva-renta/', payload)
      setTicketRenta({ id: r.data.renta_id, folio: r.data.folio })
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Error al guardar la renta.')
    } finally {
      setGuardando(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => step > 0 ? setStep(s => s - 1) : navigate('/crm/rentas')}
          className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors"
          style={{ borderColor: '#ddeadd', color: '#5a7060' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <div>
          <h1 className="font-bold" style={{ fontSize: 20, letterSpacing: '-0.4px', color: '#162016' }}>Nueva renta</h1>
        </div>
      </div>

      <StepBar step={step} />

      {/* ── Step 0: Cliente ── */}
      {step === 0 && (
        <div className="bg-white rounded-2xl border p-6 flex flex-col gap-5" style={{ borderColor: '#ddeadd' }}>
          {/* Teléfono */}
          <div>
            <Label>Teléfono del cliente</Label>
            <div className="relative">
              <Input value={telefono} onChange={setTelefono} placeholder="Ej: 4771234567" type="tel" autoFocus />
              {buscando && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: '#ddeadd', borderTopColor: '#16a34a' }} />
                </div>
              )}
            </div>

            {/* Sugerencias */}
            {sugerencias.length > 0 && (
              <div className="mt-2 rounded-xl border overflow-hidden" style={{ borderColor: '#ddeadd' }}>
                {sugerencias.map(c => (
                  <button key={c.id} onClick={() => seleccionarCliente(c)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                    style={{ borderBottom: '1px solid #f5f8f5' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fbf8'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs flex-shrink-0"
                      style={{ background: '#16a34a' }}>
                      {c.nombre[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate" style={{ color: '#162016' }}>{c.nombre}</div>
                      <div className="text-xs truncate" style={{ color: '#8fa890' }}>{c.telefono} · {c.colonia}</div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: '#dcfce7', color: '#15803d' }}>Seleccionar</span>
                  </button>
                ))}
                <button onClick={noExiste}
                  className="w-full px-4 py-3 text-left text-sm transition-colors"
                  style={{ color: '#5a7060' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fbf8'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  + Registrar como cliente nuevo
                </button>
              </div>
            )}

            {/* Sin resultados después de buscar */}
            {!buscando && telefono.length >= 7 && sugerencias.length === 0 && !clienteId && !clienteNuevo && (
              <div className="mt-2 rounded-xl border p-4 flex items-center justify-between" style={{ borderColor: '#ddeadd', background: '#f8fbf8' }}>
                <span className="text-sm" style={{ color: '#5a7060' }}>No encontramos este número.</span>
                <button onClick={noExiste}
                  className="text-sm font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: '#162016', color: 'white' }}>
                  Cliente nuevo
                </button>
              </div>
            )}
          </div>

          {/* Cliente encontrado — confirmación */}
          {clienteId && (
            <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <svg width="16" height="16" fill="none" stroke="#16a34a" strokeWidth="2.5" viewBox="0 0 24 24" className="flex-shrink-0 mt-0.5"><path d="M20 6L9 17l-5-5"/></svg>
              <div className="flex-1">
                <div className="font-semibold text-sm" style={{ color: '#15803d' }}>{nombre}</div>
                <div className="text-xs mt-0.5" style={{ color: '#5a7060' }}>{calleCliente}{coloniaCliente ? `, ${coloniaCliente}` : ''}{ciudadCliente ? `, ${ciudadCliente}` : ''}</div>
              </div>
              <button onClick={() => { setClienteId(null); setSugerencias([]); setClienteNuevo(false) }}
                className="text-xs" style={{ color: '#8fa890' }}>Cambiar</button>
            </div>
          )}

          {/* Formulario cliente nuevo */}
          {clienteNuevo && (
            <div className="flex flex-col gap-4 pt-1" style={{ borderTop: '1px solid #ddeadd' }}>
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8fa890', fontSize: 10.5 }}>Nuevo cliente</div>
              <div>
                <Label>Nombre completo *</Label>
                <Input value={nombre} onChange={setNombre} placeholder="Nombre del cliente" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Calle y número</Label>
                  <Input value={calleCliente} onChange={setCalleCliente} placeholder="Ej: Hidalgo 123" />
                </div>
                <div>
                  <Label>Colonia</Label>
                  <Input value={coloniaCliente} onChange={setColoniaCliente} placeholder="Colonia" />
                </div>
              </div>
              <div>
                <Label>Ciudad / Municipio</Label>
                <Input value={ciudadCliente} onChange={setCiudadCliente} placeholder="Ciudad" />
              </div>
            </div>
          )}

          <button
            onClick={avanzarDesdeCliente}
            disabled={!nombre.trim() || !telefono.trim()}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
            style={{ background: '#162016', color: 'white' }}>
            Continuar →
          </button>
        </div>
      )}

      {/* ── Step 1: Evento ── */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border p-6 flex flex-col gap-5" style={{ borderColor: '#ddeadd' }}>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: '#f8fbf8', border: '1px solid #ddeadd' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs flex-shrink-0"
              style={{ background: '#16a34a' }}>{nombre[0]?.toUpperCase()}</div>
            <div>
              <div className="font-medium text-sm" style={{ color: '#162016' }}>{nombre}</div>
              <div className="text-xs" style={{ color: '#8fa890' }}>{telefono}</div>
            </div>
          </div>

          <div>
            <Label>Fecha del evento *</Label>
            <Input type="date" value={fechaRenta} onChange={setFechaRenta} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Hora inicio *</Label>
              <Input type="time" value={horaInicio} onChange={setHoraInicio} />
            </div>
            <div>
              <Label>Hora fin *</Label>
              <Input type="time" value={horaFin} onChange={setHoraFin} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid #ddeadd', paddingTop: 16 }}>
            <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#8fa890', fontSize: 10.5 }}>Dirección del evento</div>
            <div className="flex flex-col gap-3">
              <div>
                <Label>Calle y número</Label>
                <Input value={calle} onChange={setCalle} placeholder="Ej: Hidalgo 123" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Colonia</Label>
                  <Input value={colonia} onChange={setColonia} placeholder="Colonia" />
                </div>
                <div>
                  <Label>Ciudad / Municipio</Label>
                  <Input value={ciudad} onChange={setCiudad} placeholder="Ciudad" />
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={!fechaRenta || !horaInicio || !horaFin}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
            style={{ background: '#162016', color: 'white' }}>
            Continuar →
          </button>
        </div>
      )}

      {/* ── Step 2: Productos y pago ── */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          {/* Buscador productos */}
          <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#ddeadd' }}>
            <Label>Agregar producto</Label>
            <div className="relative">
              <div className="flex items-center gap-2 border rounded-xl px-3.5 py-2.5" style={{ borderColor: '#ddeadd' }}>
                <svg width="13" height="13" fill="none" stroke="#8fa890" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input value={queryProducto} onChange={e => setQueryProducto(e.target.value)}
                  placeholder="Buscar brincolin, toro, etc…"
                  className="flex-1 text-sm outline-none" style={{ color: '#162016' }} autoFocus />
                {buscandoProducto && <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin flex-shrink-0" style={{ borderColor: '#ddeadd', borderTopColor: '#16a34a' }} />}
              </div>
              {resultProductos.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border shadow-lg z-10 overflow-hidden" style={{ borderColor: '#ddeadd' }}>
                  {resultProductos.map(p => (
                    <button key={p.id} onClick={() => agregarProducto(p)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors"
                      style={{ borderBottom: '1px solid #f5f8f5' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fbf8'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                      <span style={{ color: '#162016' }}>{p.nombre}</span>
                      <span className="font-semibold tabular-nums" style={{ color: '#5a7060', fontSize: 12 }}>${parseFloat(p.precio).toLocaleString('es-MX')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tabla productos */}
            {productos.length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                {productos.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: '#f8fbf8', border: '1px solid #ddeadd' }}>
                    <span className="flex-1 text-sm font-medium truncate" style={{ color: '#162016' }}>{p.nombre}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => actualizarLinea(p.id, 'cantidad', Math.max(1, p.cantidad - 1))}
                        className="w-6 h-6 flex items-center justify-center rounded-md text-sm font-bold"
                        style={{ background: '#e8f0e8', color: '#5a7060' }}>−</button>
                      <input
                        type="number" min={1} value={p.cantidad}
                        onChange={e => actualizarLinea(p.id, 'cantidad', Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-12 border rounded-lg text-center text-sm font-bold tabular-nums outline-none"
                        style={{ borderColor: '#ddeadd', color: '#162016', padding: '3px 4px' }}
                      />
                      <button onClick={() => actualizarLinea(p.id, 'cantidad', p.cantidad + 1)}
                        className="w-6 h-6 flex items-center justify-center rounded-md text-sm font-bold"
                        style={{ background: '#e8f0e8', color: '#5a7060' }}>+</button>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-xs" style={{ color: '#8fa890' }}>$</span>
                      <input
                        type="number" value={p.precio_unitario}
                        onChange={e => actualizarLinea(p.id, 'precio_unitario', parseFloat(e.target.value) || 0)}
                        className="w-20 border rounded-lg px-2 py-1 text-sm text-right tabular-nums outline-none"
                        style={{ borderColor: '#ddeadd', color: '#162016' }} />
                    </div>
                    <div className="w-20 text-right font-semibold tabular-nums text-sm flex-shrink-0" style={{ color: '#162016' }}>
                      ${(p.cantidad * p.precio_unitario).toLocaleString('es-MX')}
                    </div>
                    <button onClick={() => quitarProducto(p.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-md flex-shrink-0"
                      style={{ color: '#b91c1c', background: '#fee2e2' }}>×</button>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 pt-1">
                  <span className="text-xs" style={{ color: '#8fa890' }}>Subtotal calculado</span>
                  <span className="font-bold tabular-nums" style={{ color: '#162016', fontSize: 15 }}>
                    ${totalCalculado.toLocaleString('es-MX')}
                  </span>
                </div>
              </div>
            )}
          </div>

          {promoPreview && promoPreview.total_regalos > 0 && (
            <div className="bg-white rounded-2xl border p-5 flex flex-col gap-4" style={{ borderColor: '#bbf7d0', background: '#f0fdf4' }}>
              <div>
                <div className="text-sm font-semibold" style={{ color: '#15803d' }}>
                  Manteles incluidos (regalo)
                </div>
                <p className="text-xs mt-1" style={{ color: '#5a7060' }}>
                  {promoPreview.sillas_total} sillas · {promoPreview.total_regalos} mantel(es) sin costo
                </p>
              </div>
              {Object.entries(promoPreview.opciones || {}).map(([familia, info]) => (
                <div key={familia} className="flex flex-col gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8fa890' }}>
                    {FAMILIA_LABEL[familia] || familia} · {info.cantidad_regalo} incluido(s)
                  </div>
                  {Array.from({ length: info.cantidad_regalo }).map((_, idx) => (
                    <select
                      key={`${familia}-${idx}`}
                      value={eleccionesRegalo[familia]?.[idx] || ''}
                      onChange={e => {
                        const val = parseInt(e.target.value, 10)
                        setEleccionesRegalo(prev => {
                          const copia = { ...prev, [familia]: [...(prev[familia] || [])] }
                          copia[familia][idx] = val
                          return copia
                        })
                      }}
                      className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none"
                      style={{ borderColor: '#ddeadd', color: '#162016', background: 'white' }}
                    >
                      <option value="">Elige color…</option>
                      {info.colores_disponibles.map(op => (
                        <option key={op.id} value={op.id}>
                          {op.color || op.nombre} ({op.unidades_libres} disp.)
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Pago */}
          <div className="bg-white rounded-2xl border p-5 flex flex-col gap-4" style={{ borderColor: '#ddeadd' }}>
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8fa890', fontSize: 10.5 }}>Pago</div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Precio total</Label>
                <div className="flex items-center gap-2 border rounded-xl px-3.5 py-2.5" style={{ borderColor: '#ddeadd' }}>
                  <span className="text-sm" style={{ color: '#8fa890' }}>$</span>
                  <input type="number" value={precioManual}
                    onChange={e => setPrecioManual(e.target.value)}
                    placeholder={totalCalculado > 0 ? totalCalculado.toLocaleString('es-MX') : '0'}
                    className="flex-1 text-sm outline-none tabular-nums" style={{ color: '#162016' }} />
                </div>
                <p className="text-xs mt-1" style={{ color: '#8fa890' }}>Vacío = usa el calculado</p>
              </div>
              <div>
                <Label>Anticipo</Label>
                <div className="flex items-center gap-2 border rounded-xl px-3.5 py-2.5" style={{ borderColor: '#ddeadd' }}>
                  <span className="text-sm" style={{ color: '#8fa890' }}>$</span>
                  <input type="number" value={anticipo} onChange={e => setAnticipo(e.target.value)}
                    placeholder="0" className="flex-1 text-sm outline-none tabular-nums" style={{ color: '#162016' }} />
                </div>
              </div>
            </div>

            {parseFloat(anticipo) > 0 && (
              <div className="flex flex-col gap-3">
                <div>
                  <Label>Método de anticipo</Label>
                  <div className="flex gap-2">
                    {[['efectivo','💵 Efectivo'],['transferencia','🏦 Transferencia']].map(([v,l]) => (
                      <button key={v} onClick={() => {
                        setMetodoPago(v as 'efectivo' | 'transferencia')
                        setCuentaAnticipoId('')
                        if (v === 'transferencia' && cuentas.length === 0) {
                          api.get('/cuentas/').then(r => setCuentas(r.data)).catch(console.error)
                        }
                      }}
                        className="flex-1 text-sm font-medium py-2 rounded-xl border transition-all"
                        style={{
                          borderColor: metodoPago === v ? '#16a34a' : '#ddeadd',
                          borderWidth: metodoPago === v ? 2 : 1,
                          background: metodoPago === v ? '#f0fdf4' : 'white',
                          color: metodoPago === v ? '#15803d' : '#5a7060',
                        }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {metodoPago === 'transferencia' && (
                  <div>
                    <Label>Cuenta destino del anticipo</Label>
                    <div className="flex flex-col gap-1.5">
                      {cuentas.filter(c => c.tipo.toLowerCase() !== 'efectivo').map(c => (
                        <button key={c.id} onClick={() => setCuentaAnticipoId(c.id)}
                          className="flex items-center gap-3 px-4 py-2.5 rounded-xl border text-left transition-all"
                          style={{
                            borderColor: cuentaAnticipoId === c.id ? '#16a34a' : '#ddeadd',
                            borderWidth: cuentaAnticipoId === c.id ? 2 : 1,
                            background: cuentaAnticipoId === c.id ? '#f0fdf4' : 'white',
                          }}>
                          <span style={{ fontSize: 16 }}>🏦</span>
                          <div className="flex-1">
                            <div className="text-sm font-medium" style={{ color: '#162016' }}>{c.nombre}</div>
                            {c.banco && <div style={{ fontSize: 11.5, color: '#8fa890' }}>{c.banco}</div>}
                          </div>
                          {cuentaAnticipoId === c.id && (
                            <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#16a34a' }}>
                              <svg width="10" height="10" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                          )}
                        </button>
                      ))}
                      {cuentas.length === 0 && <div className="text-sm" style={{ color: '#8fa890' }}>Cargando cuentas…</div>}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <Label>Notas internas</Label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Instrucciones especiales, referencias, etc."
                rows={2} className="w-full border rounded-xl px-3.5 py-2.5 text-sm resize-none outline-none"
                style={{ borderColor: '#ddeadd', color: '#162016' }} />
            </div>
          </div>

          {/* Resumen y confirmar */}
          <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#ddeadd' }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold" style={{ color: '#162016' }}>Total a cobrar</span>
              <span className="font-black tabular-nums" style={{ fontSize: 24, color: '#162016', letterSpacing: '-1px' }}>
                ${totalFinal.toLocaleString('es-MX')}
              </span>
            </div>
            {parseFloat(anticipo) > 0 && (
              <div className="flex items-center justify-between mb-4 pb-4" style={{ borderBottom: '1px solid #ddeadd' }}>
                <span className="text-sm" style={{ color: '#5a7060' }}>Anticipo</span>
                <span className="font-semibold tabular-nums text-sm" style={{ color: '#15803d' }}>
                  −${parseFloat(anticipo).toLocaleString('es-MX')}
                </span>
              </div>
            )}

            {error && (
              <div className="mb-4 text-sm px-4 py-2.5 rounded-xl" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>
            )}

            <button onClick={guardar} disabled={guardando || productos.length === 0}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
              style={{ background: '#16a34a', color: 'white' }}>
              {guardando ? 'Guardando…' : '✓ Crear renta'}
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
