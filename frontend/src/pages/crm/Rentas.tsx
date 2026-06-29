import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import TicketModal from '../../components/TicketModal'

interface Renta {
  id: number; folio: string
  cliente_nombre: string; cliente_telefono: string
  fecha_renta: string; hora_inicio: string | null; hora_fin: string | null
  calle_y_numero: string; colonia: string; ciudad_o_municipio: string
  precio_total: string; anticipo: string; pagado: boolean
  estado_entrega: string; productos: { id: number; producto_nombre: string; cantidad: number }[]
}

interface Cuenta { id: number; nombre: string; banco?: string; tipo: string }

interface PaginatedResponse { count: number; next: string | null; previous: string | null; results: Renta[] }

const ESTADOS: Record<string, { label: string; bg: string; text: string }> = {
  PENDIENTE:  { label: 'Pendiente',  bg: '#fef9c3', text: '#a16207' },
  ASIGNADO:   { label: 'Asignado',   bg: '#f3f4f6', text: '#6b7280' },
  EN_RUTA:    { label: 'En ruta',    bg: '#dbeafe', text: '#1d4ed8' },
  ENTREGADO:  { label: 'Entregado',  bg: '#dcfce7', text: '#15803d' },
  RECOGIDO:   { label: 'Recogido',   bg: '#ede9fe', text: '#6d28d9' },
  CANCELADO:  { label: 'Cancelado',  bg: '#fee2e2', text: '#b91c1c' },
}

interface StatsData {
  total: number; pendientes: number; ingreso: number; sin_cobrar: number
  anterior: { total: number; ingreso: number }
}

function toLocalIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function formatFecha(iso: string) {
  const [y,m,d] = iso.split('-').map(Number)
  return new Date(y,m-1,d).toLocaleDateString('es-MX',{day:'numeric',month:'short'})
}

function formatMonto(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `$${n.toLocaleString('es-MX')}`
}

function getWeekRange() {
  const hoyDate = new Date()
  const day = hoyDate.getDay()
  const lunes = new Date(hoyDate)
  lunes.setDate(hoyDate.getDate() - (day === 0 ? 6 : day - 1))
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  return { inicio: toLocalIso(lunes), fin: toLocalIso(domingo) }
}

function detectPreset(inicio: string, fin: string): 'semana' | 'mes' | 'otro' {
  const hoyDate = new Date()
  const wr = getWeekRange()
  if (inicio === wr.inicio && fin === wr.fin) return 'semana'
  const mesInicio = toLocalIso(new Date(hoyDate.getFullYear(), hoyDate.getMonth(), 1))
  const mesFin = toLocalIso(new Date(hoyDate.getFullYear(), hoyDate.getMonth() + 1, 0))
  if (inicio === mesInicio && fin === mesFin) return 'mes'
  return 'otro'
}

const PAGE_SIZE = 25

export default function Rentas() {
  const navigate = useNavigate()
  const wr = getWeekRange()
  const [fechaInicio, setFechaInicio] = useState(wr.inicio)
  const [fechaFin, setFechaFin] = useState(wr.fin)
  const [statsData, setStatsData] = useState<StatsData | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('')
  const [pagado, setPagado] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PaginatedResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [detalle, setDetalle] = useState<Renta | null>(null)

  // ── Modal registrar pago ───────────────────────────────────────────────────
  const [modalPago, setModalPago] = useState(false)
  const [saldoInfo, setSaldoInfo] = useState<{
    precio_total: number; anticipo: number; pagos_registrados: number; saldo_pendiente: number
  } | null>(null)
  const [cargandoSaldo, setCargandoSaldo] = useState(false)
  const [montoInput, setMontoInput] = useState('')
  const [metodo, setMetodo] = useState<'efectivo' | 'transferencia'>('efectivo')
  const [cuentaId, setCuentaId] = useState<number | ''>('')
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [guardando, setGuardando] = useState(false)
  const [errorPago, setErrorPago] = useState('')

  // ── Modal ticket ───────────────────────────────────────────────────────────
  const [ticketRenta, setTicketRenta] = useState<{ id: number; folio: string } | null>(null)

  // ── Cambiar estado entrega ─────────────────────────────────────────────────
  const [cambiandoEstado, setCambiandoEstado] = useState(false)
  const [modalDeposito, setModalDeposito] = useState<{ monto: number; folio: string; rentaId: number } | null>(null)

  const cambiarEstado = async (nuevoEstado: string) => {
    if (!detalle || cambiandoEstado) return
    setCambiandoEstado(true)
    try {
      const res = await api.post(`/rentas/${detalle.id}/cambiar_estado/`, { estado_entrega: nuevoEstado })
      const actualizado = { ...detalle, estado_entrega: nuevoEstado }
      setDetalle(actualizado)
      setData(prev => prev ? {
        ...prev,
        results: prev.results.map(r => r.id === detalle.id ? actualizado : r)
      } : prev)
      if (res.data.deposito) {
        setModalDeposito({ ...res.data.deposito, rentaId: detalle.id })
      }
    } catch {
      alert('Error al cambiar el estado.')
    } finally {
      setCambiandoEstado(false)
    }
  }

  // ── Modal cancelar ─────────────────────────────────────────────────────────
  const [modalCancelar, setModalCancelar] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [errorCancelar, setErrorCancelar] = useState('')

  const confirmarCancelar = async () => {
    if (!detalle) return
    if (!motivo.trim()) { setErrorCancelar('Escribe el motivo de cancelación.'); return }
    setCancelando(true); setErrorCancelar('')
    try {
      await api.post(`/rentas/${detalle.id}/cancelar/`, { motivo: motivo.trim() })
      const actualizado = { ...detalle, estado_entrega: 'CANCELADO' }
      setDetalle(actualizado)
      setData(prev => prev ? {
        ...prev,
        results: prev.results.map(r => r.id === detalle.id ? actualizado : r)
      } : prev)
      setModalCancelar(false)
      setMotivo('')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setErrorCancelar(msg ?? 'Error al cancelar.')
    } finally {
      setCancelando(false)
    }
  }

  const abrirModalPago = async () => {
    if (!detalle) return
    setMetodo('efectivo'); setCuentaId(''); setErrorPago(''); setSaldoInfo(null)
    setModalPago(true); setCargandoSaldo(true)
    try {
      const [saldoRes, cuentasRes] = await Promise.all([
        api.get(`/rentas/${detalle.id}/saldo/`),
        cuentas.length === 0 ? api.get('/cuentas/') : Promise.resolve({ data: cuentas }),
      ])
      setSaldoInfo(saldoRes.data)
      setMontoInput(String(saldoRes.data.saldo_pendiente))
      if (cuentas.length === 0) setCuentas(cuentasRes.data)
    } catch { setErrorPago('Error al cargar el saldo.') }
    finally { setCargandoSaldo(false) }
  }

  const confirmarPago = async () => {
    if (!detalle || !saldoInfo) return
    const monto = parseFloat(montoInput)
    if (!monto || monto <= 0) { setErrorPago('Ingresa un monto válido.'); return }
    if (monto > saldoInfo.saldo_pendiente) {
      setErrorPago(`El monto supera el saldo pendiente ($${saldoInfo.saldo_pendiente.toLocaleString('es-MX')}).`); return
    }
    if (metodo === 'transferencia' && !cuentaId) { setErrorPago('Selecciona una cuenta destino.'); return }
    setGuardando(true); setErrorPago('')
    try {
      const res = await api.post(`/rentas/${detalle.id}/registrar_pago/`, {
        monto, metodo_pago: metodo,
        ...(metodo === 'transferencia' ? { cuenta_id: cuentaId } : {}),
      })
      const liquidado: boolean = res.data.liquidado
      const actualizado = { ...detalle, pagado: liquidado }
      setDetalle(actualizado)
      setData(prev => prev ? { ...prev, results: prev.results.map(r => r.id === detalle.id ? actualizado : r) } : prev)
      setModalPago(false)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setErrorPago(msg ?? 'Error al registrar el pago.')
    } finally { setGuardando(false) }
  }

  const fetchRentas = useCallback(() => {
    setLoading(true)
    const params: Record<string, string> = { page: String(page) }
    if (fechaInicio) params.fecha_inicio = fechaInicio
    if (fechaFin) params.fecha_fin = fechaFin
    if (busqueda) params.search = busqueda
    if (estado) params.estado_entrega = estado
    if (pagado !== '') params.pagado = pagado
    api.get('/rentas/', { params })
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [fechaInicio, fechaFin, busqueda, estado, pagado, page])

  useEffect(() => { fetchRentas() }, [fetchRentas])

  useEffect(() => {
    if (!fechaInicio || !fechaFin) return
    api.get('/rentas/stats/', { params: { fecha_inicio: fechaInicio, fecha_fin: fechaFin } })
      .then(r => setStatsData(r.data))
      .catch(console.error)
  }, [fechaInicio, fechaFin])

  // Debounce búsqueda
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setBusqueda(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const setPreset = (preset: string) => {
    const hoyDate = new Date(); const h = toLocalIso(hoyDate)
    if (preset === 'hoy') { setFechaInicio(h); setFechaFin(h) }
    else if (preset === 'semana') {
      const day = hoyDate.getDay(); const lunes = new Date(hoyDate)
      lunes.setDate(hoyDate.getDate() - (day === 0 ? 6 : day - 1))
      const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6)
      setFechaInicio(toLocalIso(lunes)); setFechaFin(toLocalIso(domingo))
    } else if (preset === 'mes') {
      const inicio = new Date(hoyDate.getFullYear(), hoyDate.getMonth(), 1)
      const fin = new Date(hoyDate.getFullYear(), hoyDate.getMonth() + 1, 0)
      setFechaInicio(toLocalIso(inicio)); setFechaFin(toLocalIso(fin))
    }
    setPage(1)
  }

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 1
  const rentas = data?.results ?? []

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-bold" style={{ fontSize: 20, letterSpacing: '-0.4px', color: '#162016' }}>Rentas</h1>
          <p className="text-sm mt-0.5" style={{ color: '#5a7060' }}>
            {data ? `${data.count} renta${data.count !== 1 ? 's' : ''} en el periodo` : '…'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/crm/rentas/nueva')}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
            style={{ background: '#16a34a', color: 'white' }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nueva renta
          </button>
          {[['hoy','Hoy'],['semana','Esta semana'],['mes','Este mes']].map(([p,l]) => (
            <button key={p} onClick={() => setPreset(p)}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: '#ddeadd', color: '#5a7060', background: 'white' }}
            >{l}</button>
          ))}
        </div>
      </div>

      {/* Stats */}
      {(() => {
        const preset = detectPreset(fechaInicio, fechaFin)
        const label = preset === 'semana' ? 'semana' : preset === 'mes' ? 'mes' : 'periodo'
        const s = statsData
        const diffTotal = s ? s.total - s.anterior.total : 0
        const diffIngreso = s ? s.ingreso - s.anterior.ingreso : 0
        const hasPrev = s ? s.anterior.total > 0 || s.anterior.ingreso > 0 : false
        return (
          <div className="grid grid-cols-4 gap-4">
            {/* Rentas */}
            <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#ddeadd' }}>
              <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#5a7060', letterSpacing: '0.3px' }}>
                Rentas esta {label}
              </div>
              <div className="font-bold leading-none mb-1" style={{ fontSize: 26, letterSpacing: '-1px', color: '#162016' }}>
                {s?.total ?? '—'}
              </div>
              {s && hasPrev && (
                <div className="text-xs mt-1.5 font-medium" style={{ color: diffTotal >= 0 ? '#16a34a' : '#ef4444' }}>
                  {diffTotal >= 0 ? '↑' : '↓'} {Math.abs(diffTotal)} vs {label} anterior
                </div>
              )}
              <div className="mt-3 h-1 rounded-full" style={{ background: '#ddeadd' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(((s?.total ?? 0) / 50) * 100, 100)}%`, background: '#16a34a' }} />
              </div>
            </div>
            {/* Pendientes */}
            <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#ddeadd' }}>
              <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#5a7060', letterSpacing: '0.3px' }}>
                Pendientes
              </div>
              <div className="font-bold leading-none mb-1" style={{ fontSize: 26, letterSpacing: '-1px', color: '#162016' }}>
                {s?.pendientes ?? '—'}
              </div>
              <div className="text-xs mt-1.5" style={{ color: '#8fa890' }}>Sin asignar a ruta</div>
              <div className="mt-3 h-1 rounded-full" style={{ background: '#ddeadd' }}>
                <div className="h-full rounded-full" style={{ width: `${s && s.total ? Math.min((s.pendientes / s.total) * 100, 100) : 0}%`, background: '#f59e0b' }} />
              </div>
            </div>
            {/* Ingreso */}
            <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#ddeadd' }}>
              <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#5a7060', letterSpacing: '0.3px' }}>
                Ingreso esta {label}
              </div>
              <div className="font-bold leading-none mb-1" style={{ fontSize: s && s.ingreso >= 10000 ? 22 : 26, letterSpacing: '-1px', color: '#162016', fontVariantNumeric: 'tabular-nums' }}>
                {s ? formatMonto(s.ingreso) : '—'}
              </div>
              {s && hasPrev && (
                <div className="text-xs mt-1.5 font-medium" style={{ color: diffIngreso >= 0 ? '#16a34a' : '#ef4444' }}>
                  {diffIngreso >= 0 ? '↑' : '↓'} {formatMonto(Math.abs(diffIngreso))} vs {label} anterior
                </div>
              )}
              <div className="mt-3 h-1 rounded-full" style={{ background: '#ddeadd' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(((s?.ingreso ?? 0) / 100000) * 100, 100)}%`, background: '#8b5cf6' }} />
              </div>
            </div>
            {/* Sin cobrar */}
            <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#ddeadd' }}>
              <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#5a7060', letterSpacing: '0.3px' }}>
                Sin cobrar
              </div>
              <div className="font-bold leading-none mb-1" style={{ fontSize: s && (s.sin_cobrar) >= 10000 ? 22 : 26, letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums', color: (s?.sin_cobrar ?? 0) > 0 ? '#dc2626' : '#162016' }}>
                {s ? `$${s.sin_cobrar.toLocaleString('es-MX')}` : '—'}
              </div>
              <div className="text-xs mt-1.5" style={{ color: '#8fa890' }}>
                Rentas del periodo sin pago
              </div>
              <div className="mt-3 h-1 rounded-full" style={{ background: '#ddeadd' }}>
                <div className="h-full rounded-full" style={{ width: `${s && s.ingreso ? Math.min((s.sin_cobrar / s.ingreso) * 100, 100) : 0}%`, background: '#ef4444' }} />
              </div>
            </div>
          </div>
        )
      })()}

      {/* Filtros */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-end" style={{ borderColor: '#ddeadd' }}>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: '#5a7060' }}>Desde</label>
          <input type="date" value={fechaInicio} onChange={e => { setFechaInicio(e.target.value); setPage(1) }}
            className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#ddeadd', color: '#162016' }} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: '#5a7060' }}>Hasta</label>
          <input type="date" value={fechaFin} onChange={e => { setFechaFin(e.target.value); setPage(1) }}
            className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#ddeadd', color: '#162016' }} />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-40">
          <label className="text-xs font-medium" style={{ color: '#5a7060' }}>Buscar</label>
          <div className="flex items-center gap-2 border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd' }}>
            <svg width="13" height="13" fill="none" stroke="#8fa890" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder="Cliente, folio, teléfono…"
              className="flex-1 text-sm outline-none" style={{ color: '#162016' }} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: '#5a7060' }}>Estado</label>
          <select value={estado} onChange={e => { setEstado(e.target.value); setPage(1) }}
            className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#ddeadd', color: '#162016' }}>
            <option value="">Todos</option>
            {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: '#5a7060' }}>Pago</label>
          <select value={pagado} onChange={e => { setPagado(e.target.value); setPage(1) }}
            className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#ddeadd', color: '#162016' }}>
            <option value="">Todos</option>
            <option value="true">Pagado</option>
            <option value="false">Sin pagar</option>
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#ddeadd' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fbf8', borderBottom: '1px solid #ddeadd' }}>
                {['Folio','Cliente','Fecha','Horario','Productos','Total','Estado','Pago',''].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 font-semibold uppercase tracking-wide whitespace-nowrap"
                    style={{ fontSize: 11, color: '#5a7060', letterSpacing: '0.3px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(5)].map((_,i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f8f5' }}>
                  {[...Array(9)].map((_,j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: '#e8f0e8', width: j===1?120:j===0?60:80 }} /></td>
                  ))}
                </tr>
              ))}
              {!loading && rentas.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-sm" style={{ color: '#8fa890' }}>Sin rentas en este periodo.</td></tr>
              )}
              {!loading && rentas.map(r => {
                const est = ESTADOS[r.estado_entrega] ?? { label: r.estado_entrega, bg: '#f3f4f6', text: '#6b7280' }
                return (
                  <tr key={r.id} className="cursor-pointer transition-colors" style={{ borderBottom: '1px solid #f5f8f5' }}
                    onClick={() => setDetalle(r)}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fbf8'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={e => { e.stopPropagation(); setTicketRenta({ id: r.id, folio: r.folio }) }}
                        className="underline decoration-dotted transition-colors"
                        style={{ fontFamily: 'monospace', fontSize: 12.5, color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        title="Ver ticket"
                      >{r.folio}</button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium" style={{ color: '#162016' }}>{r.cliente_nombre}</div>
                      <div style={{ fontSize: 11.5, color: '#8fa890' }}>{r.cliente_telefono}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: '#5a7060' }}>{formatFecha(r.fecha_renta)}</td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ fontFamily: 'monospace', fontSize: 12, color: '#5a7060' }}>
                      {r.hora_inicio ? `${r.hora_inicio.slice(0,5)} – ${r.hora_fin?.slice(0,5) ?? '?'}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.productos.slice(0,2).map(p => (
                          <span key={p.id} className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f0f4f0', color: '#5a7060' }}>
                            {p.cantidad > 1 ? `${p.cantidad}× ` : ''}{p.producto_nombre}
                          </span>
                        ))}
                        {r.productos.length > 2 && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f0f4f0', color: '#5a7060' }}>+{r.productos.length - 2}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ fontFamily: 'monospace', fontSize: 12.5, color: '#162016', fontWeight: 500 }}>
                      ${parseFloat(r.precio_total).toLocaleString('es-MX')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                        style={{ background: est.bg, color: est.text }}>{est.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: r.pagado ? '#dcfce7' : '#fee2e2', color: r.pagado ? '#15803d' : '#b91c1c' }}>
                        {r.pagado ? 'Pagado' : 'Sin pagar'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-xs px-3 py-1 rounded-lg" style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                        Ver
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: '1px solid #ddeadd', background: '#f8fbf8' }}>
          <span className="text-xs" style={{ color: '#8fa890' }}>
            {data ? `${data.count} rentas` : ''}
          </span>
          <div className="flex gap-1 ml-auto">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
              className="w-7 h-7 flex items-center justify-center rounded-md border text-sm disabled:opacity-40"
              style={{ borderColor: '#ddeadd', color: '#5a7060', background: 'white' }}>‹</button>
            {[...Array(Math.min(totalPages, 7))].map((_, i) => {
              const p = i + 1
              return (
                <button key={p} onClick={() => setPage(p)}
                  className="w-7 h-7 flex items-center justify-center rounded-md border text-xs font-medium"
                  style={{ borderColor: page === p ? '#16a34a' : '#ddeadd', background: page === p ? '#16a34a' : 'white', color: page === p ? '#fff' : '#5a7060' }}>
                  {p}
                </button>
              )
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
              className="w-7 h-7 flex items-center justify-center rounded-md border text-sm disabled:opacity-40"
              style={{ borderColor: '#ddeadd', color: '#5a7060', background: 'white' }}>›</button>
          </div>
        </div>
      </div>

      {/* Panel detalle */}
      {detalle && (
        <div className="fixed inset-0 z-50 flex items-start justify-end" style={{ background: 'rgba(0,0,0,0.25)' }}
          onClick={e => { if (e.target === e.currentTarget) setDetalle(null) }}>
          <div className="flex flex-col h-full bg-white" style={{ width: 440, borderLeft: '1px solid #ddeadd' }}>
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid #ddeadd' }}>
              <div>
                <div className="font-bold" style={{ fontSize: 16, color: '#162016' }}>{detalle.cliente_nombre}</div>
                <div style={{ fontSize: 12, color: '#8fa890' }}>
                  <button
                    onClick={() => setTicketRenta({ id: detalle.id, folio: detalle.folio })}
                    className="underline decoration-dotted"
                    style={{ fontFamily: 'monospace', color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12 }}
                    title="Ver ticket"
                  >{detalle.folio}</button>
                  {' '}· {formatFecha(detalle.fecha_renta)}
                </div>
              </div>
              <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: ESTADOS[detalle.estado_entrega]?.bg ?? '#f3f4f6', color: ESTADOS[detalle.estado_entrega]?.text ?? '#6b7280' }}>
                {ESTADOS[detalle.estado_entrega]?.label ?? detalle.estado_entrega}
              </span>
              <button onClick={() => setDetalle(null)}
                className="w-7 h-7 flex items-center justify-center rounded-md border text-sm"
                style={{ borderColor: '#ddeadd', color: '#5a7060', marginLeft: 8 }}>×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
              <Section title="Cliente">
                <Field label="Nombre" value={detalle.cliente_nombre} />
                <Field label="Teléfono" value={detalle.cliente_telefono} />
                <Field label="Dirección" value={`${detalle.calle_y_numero}, ${detalle.colonia}, ${detalle.ciudad_o_municipio}`} full />
              </Section>
              <Section title="Horario">
                <Field label="Fecha" value={formatFecha(detalle.fecha_renta)} />
                <Field label="Horario" value={detalle.hora_inicio ? `${detalle.hora_inicio.slice(0,5)} – ${detalle.hora_fin?.slice(0,5) ?? '?'}` : '—'} />
              </Section>
              <Section title="Productos">
                <div className="flex flex-wrap gap-1.5 col-span-2">
                  {detalle.productos.map(p => (
                    <span key={p.id} className="text-xs px-2.5 py-1 rounded-lg border" style={{ background: '#f8fbf8', borderColor: '#ddeadd', color: '#162016' }}>
                      {p.cantidad > 1 ? `${p.cantidad}× ` : ''}{p.producto_nombre}
                    </span>
                  ))}
                </div>
              </Section>
              <Section title="Finanzas">
                <Field label="Total" value={`$${parseFloat(detalle.precio_total).toLocaleString('es-MX')}`} />
                <Field label="Anticipo" value={`$${parseFloat(detalle.anticipo || '0').toLocaleString('es-MX')}`} />
                <Field label="Estado pago" value={detalle.pagado ? '✓ Pagado' : '✗ Sin pagar'} />
              </Section>

              {detalle.estado_entrega !== 'CANCELADO' && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide mb-2.5" style={{ color: '#8fa890', letterSpacing: '0.6px' }}>
                    Estado de entrega
                  </div>
                  <div className="flex gap-2">
                    {([
                      { key: 'PENDIENTE', label: 'Pendiente',  activeColor: '#a16207', activeBg: '#fef9c3' },
                      { key: 'ENTREGADO', label: 'Entregado',  activeColor: '#15803d', activeBg: '#dcfce7' },
                      { key: 'RECOGIDO',  label: 'Recogido',   activeColor: '#6d28d9', activeBg: '#ede9fe' },
                    ] as const).map(({ key, label, activeColor, activeBg }) => {
                      const isActive = detalle.estado_entrega === key
                      return (
                        <button
                          key={key}
                          onClick={() => !isActive && cambiarEstado(key)}
                          disabled={cambiandoEstado || isActive}
                          className="flex-1 text-xs font-semibold py-2 rounded-lg border transition-all"
                          style={{
                            background: isActive ? activeBg : 'white',
                            color: isActive ? activeColor : '#8fa890',
                            borderColor: isActive ? activeColor : '#ddeadd',
                            cursor: isActive ? 'default' : 'pointer',
                            opacity: cambiandoEstado && !isActive ? 0.5 : 1,
                          }}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: '#8fa890' }}>
                    Útil para pedidos que el cliente recoge en bodega
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 p-4" style={{ borderTop: '1px solid #ddeadd' }}>
              {!detalle.pagado ? (
                <button
                  onClick={abrirModalPago}
                  className="w-full text-sm font-semibold py-2.5 rounded-lg transition-colors"
                  style={{ background: '#16a34a', color: 'white' }}
                >
                  Registrar pago
                </button>
              ) : (
                <div className="w-full text-center text-sm font-semibold py-2.5 rounded-lg"
                  style={{ background: '#dcfce7', color: '#15803d' }}>
                  ✓ Renta pagada
                </div>
              )}
              <div className="flex gap-2">
                {detalle.estado_entrega !== 'CANCELADO' && (
                  <button
                    onClick={() => navigate(`/crm/rentas/${detalle.id}/editar`)}
                    className="flex-1 text-center text-sm font-medium py-2 rounded-lg border transition-colors"
                    style={{ borderColor: '#ddeadd', color: '#5a7060' }}>
                    Editar
                  </button>
                )}
                <a href={`tel:${detalle.cliente_telefono}`}
                  className="flex-1 text-center text-sm font-medium py-2 rounded-lg border transition-colors"
                  style={{ borderColor: '#ddeadd', color: '#5a7060' }}>
                  Llamar
                </a>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${detalle.calle_y_numero} ${detalle.colonia} ${detalle.ciudad_o_municipio}`)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex-1 text-center text-sm font-medium py-2 rounded-lg border transition-colors"
                  style={{ borderColor: '#ddeadd', color: '#5a7060' }}>
                  Mapa
                </a>
              </div>
              {detalle.estado_entrega !== 'CANCELADO' && (
                <button
                  onClick={() => { setMotivo(''); setErrorCancelar(''); setModalCancelar(true) }}
                  className="w-full text-sm font-medium py-2 rounded-lg border transition-colors"
                  style={{ borderColor: '#fca5a5', color: '#b91c1c', background: '#fff1f2' }}
                >
                  Cancelar renta
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal cancelar renta */}
      {modalCancelar && detalle && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalCancelar(false) }}>
          <div className="bg-white rounded-2xl shadow-xl" style={{ width: 420, maxWidth: '95vw' }}>
            <div className="flex items-start justify-between px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #fde8e8' }}>
              <div>
                <div className="font-bold" style={{ fontSize: 16, color: '#162016' }}>Cancelar renta</div>
                <div className="text-sm mt-0.5" style={{ color: '#5a7060' }}>
                  {detalle.cliente_nombre} · <span style={{ fontFamily: 'monospace' }}>{detalle.folio}</span>
                </div>
              </div>
              <button onClick={() => setModalCancelar(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md border text-sm mt-0.5"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}>×</button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: '#fff1f2', border: '1px solid #fca5a5' }}>
                <svg width="16" height="16" fill="none" stroke="#b91c1c" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p className="text-sm" style={{ color: '#b91c1c' }}>
                  Esta acción no se puede deshacer. La renta quedará marcada como cancelada.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide block mb-1.5" style={{ color: '#8fa890', fontSize: 10.5 }}>
                  Motivo de cancelación
                </label>
                <textarea
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="Ej: Cliente canceló por cambio de fecha, doble reservación, etc."
                  rows={3}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none outline-none"
                  style={{ borderColor: errorCancelar ? '#fca5a5' : '#ddeadd', color: '#162016', lineHeight: 1.5 }}
                  autoFocus
                />
                {errorCancelar && (
                  <p className="text-xs mt-1.5" style={{ color: '#b91c1c' }}>{errorCancelar}</p>
                )}
              </div>
            </div>

            <div className="flex gap-2 px-6 pb-5">
              <button onClick={() => setModalCancelar(false)}
                className="flex-1 text-sm font-medium py-2.5 rounded-xl border"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}>
                Volver
              </button>
              <button
                onClick={confirmarCancelar}
                disabled={cancelando || !motivo.trim()}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
                style={{ background: '#dc2626', color: 'white' }}
              >
                {cancelando ? 'Cancelando…' : 'Confirmar cancelación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal registrar pago */}
      {modalPago && detalle && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalPago(false) }}>
          <div className="bg-white rounded-2xl shadow-xl" style={{ width: 440, maxWidth: '95vw' }}>
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #ddeadd' }}>
              <div>
                <div className="font-bold" style={{ fontSize: 16, color: '#162016' }}>Registrar pago</div>
                <div className="text-sm mt-0.5" style={{ color: '#5a7060' }}>
                  {detalle.cliente_nombre} · <span style={{ fontFamily: 'monospace' }}>{detalle.folio}</span>
                </div>
              </div>
              <button onClick={() => setModalPago(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md border text-sm mt-0.5"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}>×</button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-5">
              {/* Desglose de saldo */}
              {cargandoSaldo ? (
                <div className="flex flex-col gap-2">
                  {[...Array(4)].map((_,i) => (
                    <div key={i} className="h-4 rounded animate-pulse" style={{ background: '#e8f0e8', width: i===0?'60%':i===1?'75%':i===2?'55%':'80%' }} />
                  ))}
                </div>
              ) : saldoInfo ? (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #ddeadd' }}>
                  <div className="flex items-center justify-between px-4 py-2.5" style={{ background: '#f8fbf8', borderBottom: '1px solid #ddeadd' }}>
                    <span className="text-xs font-medium" style={{ color: '#5a7060' }}>Total de la renta</span>
                    <span className="text-sm font-semibold tabular-nums" style={{ color: '#162016' }}>
                      ${saldoInfo.precio_total.toLocaleString('es-MX')}
                    </span>
                  </div>
                  {saldoInfo.anticipo > 0 && (
                    <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid #ddeadd' }}>
                      <span className="text-xs" style={{ color: '#5a7060' }}>Anticipo registrado</span>
                      <span className="text-sm tabular-nums" style={{ color: '#5a7060' }}>
                        − ${saldoInfo.anticipo.toLocaleString('es-MX')}
                      </span>
                    </div>
                  )}
                  {saldoInfo.pagos_registrados > 0 && (
                    <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid #ddeadd' }}>
                      <span className="text-xs" style={{ color: '#5a7060' }}>Pagos anteriores</span>
                      <span className="text-sm tabular-nums" style={{ color: '#5a7060' }}>
                        − ${saldoInfo.pagos_registrados.toLocaleString('es-MX')}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-4 py-3" style={{ background: '#f0fdf4' }}>
                    <span className="text-sm font-semibold" style={{ color: '#15803d' }}>Saldo pendiente</span>
                    <span className="font-bold tabular-nums" style={{ fontSize: 18, color: '#15803d', letterSpacing: '-0.4px' }}>
                      ${saldoInfo.saldo_pendiente.toLocaleString('es-MX')}
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Monto a registrar */}
              {!cargandoSaldo && saldoInfo && (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide block mb-1.5" style={{ color: '#8fa890', fontSize: 10.5 }}>
                    Monto a registrar
                  </label>
                  <div className="flex items-center border rounded-xl overflow-hidden" style={{ borderColor: '#ddeadd' }}>
                    <span className="px-3 py-2.5 text-sm font-medium" style={{ color: '#8fa890', background: '#f8fbf8', borderRight: '1px solid #ddeadd' }}>$</span>
                    <input
                      type="number"
                      min="1"
                      max={saldoInfo.saldo_pendiente}
                      step="0.01"
                      value={montoInput}
                      onChange={e => setMontoInput(e.target.value)}
                      className="flex-1 px-3 py-2.5 text-sm outline-none"
                      style={{ color: '#162016' }}
                    />
                    <button
                      onClick={() => setMontoInput(String(saldoInfo.saldo_pendiente))}
                      className="px-3 py-2.5 text-xs font-medium"
                      style={{ color: '#16a34a', background: '#f0fdf4', borderLeft: '1px solid #ddeadd' }}
                    >
                      Todo
                    </button>
                  </div>
                  {parseFloat(montoInput) < saldoInfo.saldo_pendiente && parseFloat(montoInput) > 0 && (
                    <p className="text-xs mt-1.5" style={{ color: '#a16207' }}>
                      Pago parcial — quedará pendiente ${(saldoInfo.saldo_pendiente - parseFloat(montoInput)).toLocaleString('es-MX')}
                    </p>
                  )}
                </div>
              )}

              {/* Método de pago */}
              {!cargandoSaldo && saldoInfo && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide mb-2.5" style={{ color: '#8fa890', fontSize: 10.5 }}>Método de pago</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'efectivo', label: 'Efectivo', icon: '💵', sub: 'Va a caja principal' },
                      { value: 'transferencia', label: 'Transferencia', icon: '🏦', sub: 'Selecciona cuenta' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { setMetodo(opt.value as 'efectivo' | 'transferencia'); setCuentaId('') }}
                        className="flex flex-col items-center gap-1 py-3.5 rounded-xl border transition-all"
                        style={{
                          borderColor: metodo === opt.value ? '#16a34a' : '#ddeadd',
                          borderWidth: metodo === opt.value ? 2 : 1,
                          background: metodo === opt.value ? '#f0fdf4' : 'white',
                        }}
                      >
                        <span style={{ fontSize: 22 }}>{opt.icon}</span>
                        <span className="font-semibold text-sm" style={{ color: '#162016' }}>{opt.label}</span>
                        <span style={{ fontSize: 11, color: '#8fa890' }}>{opt.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Cuenta destino */}
              {metodo === 'transferencia' && !cargandoSaldo && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#8fa890', fontSize: 10.5 }}>Cuenta destino</div>
                  <div className="flex flex-col gap-1.5">
                    {cuentas.filter(c => c.tipo.toLowerCase() !== 'efectivo').map(c => (
                      <button
                        key={c.id}
                        onClick={() => setCuentaId(c.id)}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all"
                        style={{
                          borderColor: cuentaId === c.id ? '#16a34a' : '#ddeadd',
                          borderWidth: cuentaId === c.id ? 2 : 1,
                          background: cuentaId === c.id ? '#f0fdf4' : 'white',
                        }}
                      >
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: cuentaId === c.id ? '#dcfce7' : '#f0f4f0' }}>
                          <span style={{ fontSize: 14 }}>🏦</span>
                        </div>
                        <div>
                          <div className="font-medium text-sm" style={{ color: '#162016' }}>{c.nombre}</div>
                          {c.banco && <div style={{ fontSize: 12, color: '#8fa890' }}>{c.banco}</div>}
                        </div>
                        {cuentaId === c.id && (
                          <div className="ml-auto w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ background: '#16a34a' }}>
                            <svg width="10" height="10" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                        )}
                      </button>
                    ))}
                    {cuentas.filter(c => c.tipo.toLowerCase() !== 'efectivo').length === 0 && (
                      <div className="text-sm text-center py-3" style={{ color: '#8fa890' }}>No hay cuentas bancarias configuradas.</div>
                    )}
                  </div>
                </div>
              )}

              {errorPago && (
                <div className="text-sm px-4 py-2.5 rounded-lg" style={{ background: '#fee2e2', color: '#b91c1c' }}>{errorPago}</div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-6 pb-5">
              <button onClick={() => setModalPago(false)}
                className="flex-1 text-sm font-medium py-2.5 rounded-xl border"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}>
                Cancelar
              </button>
              <button
                onClick={confirmarPago}
                disabled={guardando || cargandoSaldo || !saldoInfo || (metodo === 'transferencia' && !cuentaId)}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
                style={{ background: '#16a34a', color: 'white' }}
              >
                {guardando
                  ? 'Guardando…'
                  : saldoInfo && parseFloat(montoInput) < saldoInfo.saldo_pendiente && parseFloat(montoInput) > 0
                    ? 'Registrar pago parcial'
                    : 'Liquidar renta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ticket */}
      {ticketRenta && (
        <TicketModal
          rentaId={ticketRenta.id}
          folio={ticketRenta.folio}
          onClose={() => setTicketRenta(null)}
        />
      )}

      {/* Modal devolución depósito */}
      {modalDeposito && (
        <ModalDevolucionDeposito
          monto={modalDeposito.monto}
          folio={modalDeposito.folio}
          rentaId={modalDeposito.rentaId}
          onClose={() => setModalDeposito(null)}
        />
      )}
    </div>
  )
}

function ModalDevolucionDeposito({ monto, folio, rentaId, onClose }: {
  monto: number; folio: string; rentaId: number; onClose: () => void
}) {
  const [guardando, setGuardando] = useState(false)
  const [listo, setListo] = useState(false)

  const confirmar = async () => {
    setGuardando(true)
    try {
      await api.post(`/rentas/${rentaId}/devolver_deposito/`, { monto })
      setListo(true)
    } catch {
      alert('Error al registrar la devolución.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-xl" style={{ width: 400, maxWidth: '95vw' }}>
        {listo ? (
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#dcfce7' }}>
              <svg width="28" height="28" fill="none" stroke="#16a34a" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <p className="font-bold text-lg" style={{ color: '#162016' }}>Devolución registrada</p>
            <p className="text-sm" style={{ color: '#5a7060' }}>
              Se descontaron <strong>${monto.toLocaleString('es-MX')}</strong> de la caja.
            </p>
            <button onClick={onClose} className="mt-2 w-full text-sm font-semibold py-2.5 rounded-xl"
              style={{ background: '#16a34a', color: 'white' }}>
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #ddeadd' }}>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#fef9c3' }}>
                  <span style={{ fontSize: 20 }}>💰</span>
                </div>
                <div>
                  <p className="font-bold" style={{ color: '#162016' }}>Renta con depósito</p>
                  <p style={{ fontSize: 12, color: '#8fa890', fontFamily: 'monospace' }}>{folio}</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="rounded-xl p-4 mb-4" style={{ background: '#fefce8', border: '1px solid #fde68a' }}>
                <p className="text-sm" style={{ color: '#92400e' }}>
                  Esta renta incluye un depósito cobrado al cliente. Al regresar el equipo hay que devolver el depósito en efectivo.
                </p>
              </div>
              <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: '#f8fbf8', border: '1px solid #ddeadd' }}>
                <span className="text-sm font-medium" style={{ color: '#5a7060' }}>Monto a regresar</span>
                <span className="font-bold" style={{ fontSize: 22, color: '#162016', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>
                  ${monto.toLocaleString('es-MX')}
                </span>
              </div>
            </div>

            <div className="flex gap-2 px-6 pb-5">
              <button onClick={onClose} className="flex-1 text-sm font-medium py-2.5 rounded-xl border"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}>
                Omitir
              </button>
              <button onClick={confirmar} disabled={guardando}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
                style={{ background: '#16a34a', color: 'white' }}>
                {guardando ? 'Registrando…' : 'Confirmar devolución'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wide mb-2.5" style={{ color: '#8fa890', letterSpacing: '0.6px' }}>{title}</div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <div className="text-xs mb-0.5" style={{ color: '#5a7060' }}>{label}</div>
      <div className="text-sm font-medium" style={{ color: '#162016' }}>{value}</div>
    </div>
  )
}
