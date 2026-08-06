import { useEffect, useState, useCallback } from 'react'
import api from '../../lib/api'

interface Cliente {
  id: number
  nombre: string
  telefono: string
  calle_y_numero?: string
  colonia: string
  ciudad_o_municipio: string
  rentas_count: number
  total_gastado: number
  ultima_renta: string | null
  colonia_frecuente: string | null
}

const FORM_VACIO = {
  nombre: '',
  telefono: '',
  calle_y_numero: '',
  colonia: '',
  ciudad_o_municipio: '',
}

interface StatsClientes {
  total: number
  recurrentes: number
  nuevos_mes: number
  ticket_promedio: number
}

interface PaginatedResponse { count: number; next: string | null; previous: string | null; results: Cliente[] }

const PAGE_SIZE = 25
const AVATAR_COLORS = ['#16a34a', '#2563eb', '#9333ea', '#db2777', '#ea580c', '#0891b2', '#65a30d', '#0f3d22']

function initials(nombre: string) {
  return nombre.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

function avatarColor(id: number) { return AVATAR_COLORS[id % AVATAR_COLORS.length] }

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatMonto(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `$${n.toLocaleString('es-MX')}`
}

export default function Clientes() {
  const [searchInput, setSearchInput] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PaginatedResponse | null>(null)
  const [stats, setStats] = useState<StatsClientes | null>(null)
  const [loading, setLoading] = useState(true)
  const [detalle, setDetalle] = useState<Cliente | null>(null)
  const [panelNuevo, setPanelNuevo] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  const refreshStats = () => {
    api.get('/clientes/stats/').then(r => setStats(r.data)).catch(console.error)
  }

  useEffect(() => { refreshStats() }, [])

  const abrirNuevo = () => {
    setForm(FORM_VACIO)
    setErrorForm('')
    setDetalle(null)
    setPanelNuevo(true)
  }

  useEffect(() => {
    const t = setTimeout(() => { setBusqueda(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const fetchClientes = useCallback((pageOverride?: number, searchOverride?: string) => {
    setLoading(true)
    const params: Record<string, string> = { page: String(pageOverride ?? page) }
    const q = searchOverride !== undefined ? searchOverride : busqueda
    if (q) params.search = q
    api.get('/clientes/', { params })
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [busqueda, page])

  useEffect(() => { fetchClientes() }, [fetchClientes])

  const guardarCliente = async () => {
    if (!form.nombre.trim()) { setErrorForm('El nombre es obligatorio.'); return }
    if (!form.telefono.trim()) { setErrorForm('El teléfono es obligatorio.'); return }
    setGuardando(true)
    setErrorForm('')
    try {
      const r = await api.post('/clientes/', {
        nombre: form.nombre.trim(),
        telefono: form.telefono.trim(),
        calle_y_numero: form.calle_y_numero.trim(),
        colonia: form.colonia.trim(),
        ciudad_o_municipio: form.ciudad_o_municipio.trim(),
      })
      setPanelNuevo(false)
      setSearchInput('')
      setBusqueda('')
      setPage(1)
      fetchClientes(1, '')
      refreshStats()
      setDetalle({
        ...r.data,
        rentas_count: r.data.rentas_count ?? 0,
        total_gastado: r.data.total_gastado ?? 0,
        ultima_renta: r.data.ultima_renta ?? null,
        colonia_frecuente: r.data.colonia_frecuente ?? r.data.colonia ?? null,
      })
    } catch (err: any) {
      const data = err?.response?.data
      const msg = typeof data === 'string'
        ? data
        : data?.nombre?.[0] || data?.telefono?.[0] || data?.detail || 'No se pudo guardar el cliente.'
      setErrorForm(msg)
    } finally {
      setGuardando(false)
    }
  }

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 1
  const clientes = data?.results ?? []

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-bold" style={{ fontSize: 20, letterSpacing: '-0.4px', color: '#162016' }}>Clientes</h1>
          <p className="text-sm mt-0.5" style={{ color: '#5a7060' }}>Base de datos de clientes registrados</p>
        </div>
        <button
          onClick={abrirNuevo}
          className="flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-lg"
          style={{ background: '#16a34a', color: 'white' }}
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Nuevo cliente
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#ddeadd' }}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#5a7060', letterSpacing: '0.3px' }}>Total clientes</div>
          <div className="font-bold leading-none" style={{ fontSize: 26, letterSpacing: '-1px', color: '#162016' }}>
            {stats?.total ?? '—'}
          </div>
          {stats && (
            <div className="text-xs mt-1.5 font-medium" style={{ color: stats.nuevos_mes > 0 ? '#16a34a' : '#8fa890' }}>
              {stats.nuevos_mes > 0 ? `↑ ${stats.nuevos_mes} nuevo${stats.nuevos_mes !== 1 ? 's' : ''} este mes` : 'Sin nuevos este mes'}
            </div>
          )}
          <div className="mt-3 h-1 rounded-full" style={{ background: '#ddeadd' }}>
            <div className="h-full rounded-full" style={{ width: '100%', background: '#16a34a' }} />
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#ddeadd' }}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#5a7060', letterSpacing: '0.3px' }}>Clientes recurrentes</div>
          <div className="font-bold leading-none" style={{ fontSize: 26, letterSpacing: '-1px', color: '#162016' }}>
            {stats?.recurrentes ?? '—'}
          </div>
          {stats && stats.total > 0 && (
            <div className="text-xs mt-1.5" style={{ color: '#8fa890' }}>
              {Math.round((stats.recurrentes / stats.total) * 100)}% del total
            </div>
          )}
          <div className="mt-3 h-1 rounded-full" style={{ background: '#ddeadd' }}>
            <div className="h-full rounded-full" style={{ width: stats && stats.total ? `${Math.min((stats.recurrentes / stats.total) * 100, 100)}%` : '0%', background: '#3b82f6' }} />
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#ddeadd' }}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#5a7060', letterSpacing: '0.3px' }}>Ticket promedio</div>
          <div className="font-bold leading-none" style={{ fontSize: 26, letterSpacing: '-1px', color: '#162016', fontVariantNumeric: 'tabular-nums' }}>
            {stats ? formatMonto(stats.ticket_promedio) : '—'}
          </div>
          <div className="text-xs mt-1.5" style={{ color: '#8fa890' }}>Por renta registrada</div>
          <div className="mt-3 h-1 rounded-full" style={{ background: '#ddeadd' }}>
            <div className="h-full rounded-full" style={{ width: '60%', background: '#8b5cf6' }} />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#ddeadd' }}>
        <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: '1px solid #ddeadd' }}>
          <span className="font-semibold text-sm" style={{ color: '#162016' }}>Directorio de clientes</span>
          <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5 ml-auto" style={{ borderColor: '#ddeadd', minWidth: 220 }}>
            <svg width="13" height="13" fill="none" stroke="#8fa890" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Buscar nombre o teléfono…"
              className="flex-1 text-sm outline-none"
              style={{ color: '#162016' }}
            />
            {searchInput && (
              <button onClick={() => setSearchInput('')} style={{ color: '#8fa890', lineHeight: 1 }}>×</button>
            )}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fbf8', borderBottom: '1px solid #ddeadd' }}>
                {['Nombre', 'Teléfono', 'Colonia', 'Rentas', 'Última renta', 'Total gastado'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 font-semibold uppercase tracking-wide whitespace-nowrap"
                    style={{ fontSize: 11, color: '#5a7060', letterSpacing: '0.3px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(6)].map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f8f5' }}>
                  {[140, 100, 100, 40, 80, 70].map((w, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded animate-pulse" style={{ background: '#e8f0e8', width: w }} />
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && clientes.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-sm" style={{ color: '#8fa890' }}>
                    {busqueda ? `Sin resultados para "${busqueda}"` : 'Sin clientes registrados.'}
                  </td>
                </tr>
              )}
              {!loading && clientes.map(c => (
                <tr
                  key={c.id}
                  className="cursor-pointer transition-colors"
                  style={{ borderBottom: '1px solid #f5f8f5' }}
                  onClick={() => setDetalle(c)}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fbf8'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
                        style={{ width: 30, height: 30, fontSize: 11, background: avatarColor(c.id) }}
                      >
                        {initials(c.nombre)}
                      </div>
                      <span className="font-medium" style={{ color: '#162016' }}>{c.nombre}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ fontFamily: 'monospace', fontSize: 12.5, color: '#5a7060' }}>
                    {c.telefono || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: '#5a7060' }}>
                    {c.colonia_frecuente || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background: c.rentas_count > 1 ? '#dcfce7' : c.rentas_count === 1 ? '#dbeafe' : '#f3f4f6',
                        color: c.rentas_count > 1 ? '#15803d' : c.rentas_count === 1 ? '#1d4ed8' : '#6b7280',
                      }}
                    >
                      {c.rentas_count} renta{c.rentas_count !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: '#5a7060' }}>
                    {c.ultima_renta ? formatFecha(c.ultima_renta) : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-semibold" style={{ fontVariantNumeric: 'tabular-nums', color: c.total_gastado > 0 ? '#162016' : '#8fa890' }}>
                    {c.total_gastado > 0 ? `$${c.total_gastado.toLocaleString('es-MX')}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer / paginación */}
        <div className="flex items-center gap-3 px-5 py-3" style={{ borderTop: '1px solid #ddeadd', background: '#f8fbf8' }}>
          <span className="text-xs" style={{ color: '#8fa890' }}>
            {data ? `${data.count} cliente${data.count !== 1 ? 's' : ''}` : '…'}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="w-7 h-7 flex items-center justify-center rounded-md border text-xs disabled:opacity-40"
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
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="w-7 h-7 flex items-center justify-center rounded-md border text-xs disabled:opacity-40"
                style={{ borderColor: '#ddeadd', color: '#5a7060', background: 'white' }}>›</button>
            </div>
          )}
        </div>
      </div>

      {/* Panel nuevo cliente */}
      {panelNuevo && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end"
          style={{ background: 'rgba(0,0,0,0.25)' }}
          onClick={e => { if (e.target === e.currentTarget && !guardando) setPanelNuevo(false) }}
        >
          <div className="flex flex-col h-full bg-white" style={{ width: 400, borderLeft: '1px solid #ddeadd' }}>
            <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid #ddeadd' }}>
              <div>
                <div className="font-bold" style={{ fontSize: 16, color: '#162016' }}>Nuevo cliente</div>
                <div className="text-xs mt-0.5" style={{ color: '#8fa890' }}>Registrar en el directorio</div>
              </div>
              <button
                onClick={() => !guardando && setPanelNuevo(false)}
                className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border text-sm"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}
              >×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              <Field label="Nombre completo *">
                <input
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Nombre del cliente"
                  autoFocus
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: '#ddeadd', color: '#162016' }}
                />
              </Field>
              <Field label="Teléfono *">
                <input
                  value={form.telefono}
                  onChange={e => setForm(f => ({ ...f, telefono: e.target.value.replace(/[^\d+\s()-]/g, '') }))}
                  placeholder="Ej. 6671234567"
                  inputMode="tel"
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: '#ddeadd', color: '#162016', fontFamily: 'monospace' }}
                />
              </Field>
              <Field label="Calle y número">
                <input
                  value={form.calle_y_numero}
                  onChange={e => setForm(f => ({ ...f, calle_y_numero: e.target.value }))}
                  placeholder="Ej. Hidalgo 123"
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: '#ddeadd', color: '#162016' }}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Colonia">
                  <input
                    value={form.colonia}
                    onChange={e => setForm(f => ({ ...f, colonia: e.target.value }))}
                    placeholder="Colonia"
                    className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                    style={{ borderColor: '#ddeadd', color: '#162016' }}
                  />
                </Field>
                <Field label="Ciudad">
                  <input
                    value={form.ciudad_o_municipio}
                    onChange={e => setForm(f => ({ ...f, ciudad_o_municipio: e.target.value }))}
                    placeholder="Ciudad"
                    className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                    style={{ borderColor: '#ddeadd', color: '#162016' }}
                  />
                </Field>
              </div>
              {errorForm && (
                <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#fee2e2', color: '#b91c1c' }}>{errorForm}</div>
              )}
            </div>

            <div className="flex gap-2 p-4" style={{ borderTop: '1px solid #ddeadd' }}>
              <button
                onClick={() => !guardando && setPanelNuevo(false)}
                className="flex-1 text-sm font-medium py-2 rounded-lg border"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}
              >
                Cancelar
              </button>
              <button
                onClick={guardarCliente}
                disabled={guardando}
                className="flex-1 text-sm font-semibold py-2 rounded-lg transition-opacity disabled:opacity-60"
                style={{ background: '#16a34a', color: 'white' }}
              >
                {guardando ? 'Guardando…' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panel detalle */}
      {detalle && !panelNuevo && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end"
          style={{ background: 'rgba(0,0,0,0.25)' }}
          onClick={e => { if (e.target === e.currentTarget) setDetalle(null) }}
        >
          <div className="flex flex-col h-full bg-white" style={{ width: 400, borderLeft: '1px solid #ddeadd' }}>
            <div className="flex items-start gap-4 px-5 py-5" style={{ borderBottom: '1px solid #ddeadd' }}>
              <div
                className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
                style={{ width: 48, height: 48, fontSize: 15, background: avatarColor(detalle.id) }}
              >
                {initials(detalle.nombre)}
              </div>
              <div className="flex-1">
                <div className="font-bold" style={{ fontSize: 16, color: '#162016' }}>{detalle.nombre}</div>
                <div style={{ fontSize: 13, color: '#8fa890' }}>
                  {detalle.rentas_count} renta{detalle.rentas_count !== 1 ? 's' : ''} · {detalle.colonia_frecuente || detalle.colonia || 'sin colonia'}
                </div>
              </div>
              <button onClick={() => setDetalle(null)}
                className="w-7 h-7 flex items-center justify-center rounded-md border text-sm"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}>×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
              {/* Resumen financiero */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border p-3" style={{ borderColor: '#ddeadd' }}>
                  <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#5a7060' }}>Total gastado</div>
                  <div className="font-bold" style={{ fontSize: 18, color: '#162016', fontVariantNumeric: 'tabular-nums' }}>
                    ${detalle.total_gastado.toLocaleString('es-MX')}
                  </div>
                </div>
                <div className="rounded-xl border p-3" style={{ borderColor: '#ddeadd' }}>
                  <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#5a7060' }}>Rentas totales</div>
                  <div className="font-bold" style={{ fontSize: 18, color: '#162016' }}>
                    {detalle.rentas_count}
                    <span className="text-xs font-normal ml-1" style={{ color: '#8fa890' }}>
                      {detalle.rentas_count > 1 ? '· recurrente' : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Datos */}
              <div className="flex flex-col gap-3">
                <DetailRow label="Teléfono" value={detalle.telefono || '—'} mono />
                {detalle.colonia_frecuente && <DetailRow label="Colonia frecuente" value={detalle.colonia_frecuente} />}
                {detalle.ciudad_o_municipio && <DetailRow label="Ciudad" value={detalle.ciudad_o_municipio} />}
                {detalle.ultima_renta && <DetailRow label="Última renta" value={formatFecha(detalle.ultima_renta)} />}
              </div>
            </div>

            <div className="flex gap-2 p-4" style={{ borderTop: '1px solid #ddeadd' }}>
              <a href={`tel:${detalle.telefono}`}
                className="flex-1 text-center text-sm font-medium py-2 rounded-lg border"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}>
                Llamar
              </a>
              {detalle.telefono && (
                <a href={`https://wa.me/52${detalle.telefono.replace(/\D/g, '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex-1 text-center text-sm font-medium py-2 rounded-lg"
                  style={{ background: '#22c55e', color: 'white' }}>
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs mb-0.5" style={{ color: '#8fa890' }}>{label}</div>
      <div className="text-sm font-medium" style={{ color: '#162016', fontFamily: mono ? 'monospace' : undefined }}>{value}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#5a7060', letterSpacing: '0.3px' }}>{label}</label>
      {children}
    </div>
  )
}
