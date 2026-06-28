import { useEffect, useState, useCallback } from 'react'
import api from '../../lib/api'

interface Renta {
  id: number; folio: string
  cliente_nombre: string; cliente_telefono: string
  fecha_renta: string; hora_inicio: string | null; hora_fin: string | null
  calle_y_numero: string; colonia: string; ciudad_o_municipio: string
  precio_total: string; anticipo: string; pagado: boolean
  estado_entrega: string; productos: { id: number; nombre: string; cantidad: number }[]
}

interface PaginatedResponse { count: number; next: string | null; previous: string | null; results: Renta[] }

const ESTADOS: Record<string, { label: string; bg: string; text: string }> = {
  PENDIENTE:  { label: 'Pendiente',  bg: '#fef9c3', text: '#a16207' },
  ASIGNADO:   { label: 'Asignado',   bg: '#f3f4f6', text: '#6b7280' },
  EN_RUTA:    { label: 'En ruta',    bg: '#dbeafe', text: '#1d4ed8' },
  ENTREGADO:  { label: 'Entregado',  bg: '#dcfce7', text: '#15803d' },
  RECOGIDO:   { label: 'Recogido',   bg: '#ede9fe', text: '#6d28d9' },
  CANCELADO:  { label: 'Cancelado',  bg: '#fee2e2', text: '#b91c1c' },
}

function toLocalIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function formatFecha(iso: string) {
  const [y,m,d] = iso.split('-').map(Number)
  return new Date(y,m-1,d).toLocaleDateString('es-MX',{day:'numeric',month:'short'})
}

const PAGE_SIZE = 25

export default function Rentas() {
  const hoy = toLocalIso(new Date())
  const [fechaInicio, setFechaInicio] = useState(hoy)
  const [fechaFin, setFechaFin] = useState(hoy)
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('')
  const [pagado, setPagado] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PaginatedResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [detalle, setDetalle] = useState<Renta | null>(null)

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
          {[['hoy','Hoy'],['semana','Esta semana'],['mes','Este mes']].map(([p,l]) => (
            <button key={p} onClick={() => setPreset(p)}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: '#ddeadd', color: '#5a7060', background: 'white' }}
            >{l}</button>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-end" style={{ borderColor: '#ddeadd' }}>
        {/* Fechas */}
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
        {/* Búsqueda */}
        <div className="flex flex-col gap-1 flex-1 min-w-40">
          <label className="text-xs font-medium" style={{ color: '#5a7060' }}>Buscar</label>
          <div className="flex items-center gap-2 border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd' }}>
            <svg width="13" height="13" fill="none" stroke="#8fa890" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder="Cliente, folio, teléfono…"
              className="flex-1 text-sm outline-none" style={{ color: '#162016' }} />
          </div>
        </div>
        {/* Estado */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: '#5a7060' }}>Estado</label>
          <select value={estado} onChange={e => { setEstado(e.target.value); setPage(1) }}
            className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#ddeadd', color: '#162016' }}>
            <option value="">Todos</option>
            {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {/* Pago */}
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
                    <td className="px-4 py-3" style={{ fontFamily: 'monospace', fontSize: 12.5, color: '#5a7060' }}>{r.folio}</td>
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
                            {p.cantidad > 1 ? `${p.cantidad}× ` : ''}{p.nombre}
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
                <div style={{ fontSize: 12, color: '#8fa890' }}>{detalle.folio} · {formatFecha(detalle.fecha_renta)}</div>
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
                      {p.cantidad > 1 ? `${p.cantidad}× ` : ''}{p.nombre}
                    </span>
                  ))}
                </div>
              </Section>
              <Section title="Finanzas">
                <Field label="Total" value={`$${parseFloat(detalle.precio_total).toLocaleString('es-MX')}`} />
                <Field label="Anticipo" value={`$${parseFloat(detalle.anticipo || '0').toLocaleString('es-MX')}`} />
                <Field label="Estado pago" value={detalle.pagado ? '✓ Pagado' : '✗ Sin pagar'} />
              </Section>
            </div>

            <div className="flex gap-2 p-4" style={{ borderTop: '1px solid #ddeadd' }}>
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
          </div>
        </div>
      )}
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
