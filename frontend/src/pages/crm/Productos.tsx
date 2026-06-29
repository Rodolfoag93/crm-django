import { useEffect, useState, useCallback } from 'react'
import api from '../../lib/api'

interface Producto {
  id: number
  nombre: string
  tipo: string
  tipo_display: string
  precio: string
  stock_total: number
  stock_disponible: number
  activo: boolean
  veces_rentado: number
  ultima_renta: string | null
}

interface StatsProductos {
  total_activos: number
  brincolines: number
  precio_promedio: number
  mas_rentado: { nombre: string; vr: number; total_generado: number } | null
  por_tipo: { tipo: string; total: number }[]
}

interface FormData {
  nombre: string
  tipo: string
  precio: string
  stock_total: string
}

const TIPOS: Record<string, string> = {
  BR: 'Brincolín', ME: 'Mesa', SI: 'Silla', AN: 'Animación',
  FL: 'Flete', LZ: 'Loza', MT: 'Mantelería', OT: 'Otro',
}

const TIPO_COLORS: Record<string, { bg: string; text: string }> = {
  BR: { bg: '#dcfce7', text: '#15803d' },
  ME: { bg: '#dbeafe', text: '#1d4ed8' },
  SI: { bg: '#ede9fe', text: '#6d28d9' },
  AN: { bg: '#fef9c3', text: '#a16207' },
  FL: { bg: '#f3f4f6', text: '#6b7280' },
  LZ: { bg: '#fce7f3', text: '#be185d' },
  MT: { bg: '#ffedd5', text: '#c2410c' },
  OT: { bg: '#f3f4f6', text: '#6b7280' },
}

const FORM_EMPTY: FormData = { nombre: '', tipo: 'BR', precio: '', stock_total: '1' }

function formatMonto(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `$${n.toLocaleString('es-MX')}`
}

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Productos() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [stats, setStats] = useState<StatsProductos | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroActivo, setFiltroActivo] = useState('true')

  // Panel editar / crear
  const [panel, setPanel] = useState<'nuevo' | 'editar' | null>(null)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [form, setForm] = useState<FormData>(FORM_EMPTY)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  useEffect(() => {
    api.get('/productos/stats/').then(r => setStats(r.data)).catch(console.error)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { setBusqueda(searchInput) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const fetchProductos = useCallback(() => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (busqueda) params.search = busqueda
    if (filtroTipo) params.tipo = filtroTipo
    if (filtroActivo) params.activo = filtroActivo
    api.get('/productos/', { params })
      .then(r => {
        // ViewSet puede devolver array o paginado
        const results = Array.isArray(r.data) ? r.data : (r.data.results ?? r.data)
        setProductos(results)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [busqueda, filtroTipo, filtroActivo])

  useEffect(() => { fetchProductos() }, [fetchProductos])

  const abrirNuevo = () => {
    setEditando(null)
    setForm(FORM_EMPTY)
    setErrorForm('')
    setPanel('nuevo')
  }

  const abrirEditar = (p: Producto) => {
    setEditando(p)
    setForm({ nombre: p.nombre, tipo: p.tipo, precio: p.precio, stock_total: String(p.stock_total) })
    setErrorForm('')
    setPanel('editar')
  }

  const guardar = async () => {
    if (!form.nombre.trim()) { setErrorForm('El nombre es requerido.'); return }
    if (!form.precio || isNaN(parseFloat(form.precio))) { setErrorForm('Precio inválido.'); return }
    setGuardando(true); setErrorForm('')
    try {
      const payload = {
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        precio: parseFloat(form.precio),
        stock_total: parseInt(form.stock_total) || 0,
        stock_disponible: parseInt(form.stock_total) || 0,
      }
      if (panel === 'nuevo') {
        const r = await api.post('/productos/', payload)
        setProductos(prev => [r.data, ...prev].sort((a, b) => a.nombre.localeCompare(b.nombre)))
        setStats(prev => prev ? { ...prev, total_activos: prev.total_activos + 1 } : prev)
      } else if (editando) {
        const r = await api.patch(`/productos/${editando.id}/`, payload)
        setProductos(prev => prev.map(p => p.id === editando.id ? r.data : p))
      }
      setPanel(null)
      // Refrescar stats
      api.get('/productos/stats/').then(r => setStats(r.data)).catch(console.error)
    } catch (e: unknown) {
      const data = (e as { response?: { data?: Record<string, string[]> } })?.response?.data
      const msg = data ? Object.values(data).flat().join(' ') : 'Error al guardar.'
      setErrorForm(msg)
    } finally { setGuardando(false) }
  }

  const toggleActivo = async (p: Producto) => {
    try {
      await api.patch(`/productos/${p.id}/`, { activo: !p.activo })
      setProductos(prev => filtroActivo === 'true'
        ? prev.filter(x => x.id !== p.id)
        : prev.map(x => x.id === p.id ? { ...x, activo: !x.activo } : x)
      )
      api.get('/productos/stats/').then(r => setStats(r.data)).catch(console.error)
    } catch { /* silent */ }
  }

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-bold" style={{ fontSize: 20, letterSpacing: '-0.4px', color: '#162016' }}>Productos</h1>
          <p className="text-sm mt-0.5" style={{ color: '#5a7060' }}>Catálogo de artículos para renta</p>
        </div>
        <button
          onClick={abrirNuevo}
          className="flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-lg"
          style={{ background: '#16a34a', color: 'white' }}
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Nuevo producto
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#ddeadd' }}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#5a7060', letterSpacing: '0.3px' }}>Total en catálogo</div>
          <div className="font-bold leading-none" style={{ fontSize: 26, letterSpacing: '-1px', color: '#162016' }}>
            {stats?.total_activos ?? '—'}
          </div>
          <div className="text-xs mt-1.5" style={{ color: '#8fa890' }}>
            {stats ? `${stats.brincolines} brincolín${stats.brincolines !== 1 ? 'es' : ''}` : '…'}
          </div>
          <div className="mt-3 h-1 rounded-full" style={{ background: '#ddeadd' }}>
            <div className="h-full rounded-full" style={{ width: '100%', background: '#16a34a' }} />
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#ddeadd' }}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#5a7060', letterSpacing: '0.3px' }}>Precio promedio</div>
          <div className="font-bold leading-none" style={{ fontSize: 26, letterSpacing: '-1px', color: '#162016', fontVariantNumeric: 'tabular-nums' }}>
            {stats ? `$${Math.round(stats.precio_promedio).toLocaleString('es-MX')}` : '—'}
          </div>
          <div className="text-xs mt-1.5" style={{ color: '#8fa890' }}>Por artículo activo</div>
          <div className="mt-3 h-1 rounded-full" style={{ background: '#ddeadd' }}>
            <div className="h-full rounded-full" style={{ width: '55%', background: '#8b5cf6' }} />
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#ddeadd' }}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#5a7060', letterSpacing: '0.3px' }}>Brincolín más rentado</div>
          <div className="font-bold leading-none truncate" style={{ fontSize: stats?.mas_rentado?.nombre && stats.mas_rentado.nombre.length > 14 ? 16 : 22, letterSpacing: '-0.5px', color: '#162016' }}>
            {stats?.mas_rentado?.nombre ?? '—'}
          </div>
          <div className="text-xs mt-1.5" style={{ color: '#8fa890' }}>
            {stats?.mas_rentado
              ? `${stats.mas_rentado.vr} tickets · ${formatMonto(stats.mas_rentado.total_generado)}`
              : '…'}
          </div>
          <div className="mt-3 h-1 rounded-full" style={{ background: '#ddeadd' }}>
            <div className="h-full rounded-full" style={{ width: '70%', background: '#3b82f6' }} />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#ddeadd' }}>
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-3.5 flex-wrap" style={{ borderBottom: '1px solid #ddeadd' }}>
          <span className="font-semibold text-sm" style={{ color: '#162016' }}>Catálogo</span>

          {/* Filtro activo */}
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#f2f6f2', border: '1px solid #ddeadd' }}>
            {[['true', 'Activos'], ['false', 'Inactivos'], ['', 'Todos']].map(([v, l]) => (
              <button key={v} onClick={() => setFiltroActivo(v)}
                className="text-xs px-3 py-1 rounded-md font-medium transition-colors"
                style={{ background: filtroActivo === v ? 'white' : 'transparent', color: filtroActivo === v ? '#162016' : '#5a7060', boxShadow: filtroActivo === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                {l}
              </button>
            ))}
          </div>

          {/* Filtro tipo */}
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-xs" style={{ borderColor: '#ddeadd', color: '#162016' }}>
            <option value="">Todos los tipos</option>
            {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          {/* Búsqueda */}
          <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5 ml-auto" style={{ borderColor: '#ddeadd', minWidth: 200 }}>
            <svg width="13" height="13" fill="none" stroke="#8fa890" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder="Buscar producto…"
              className="flex-1 text-sm outline-none" style={{ color: '#162016' }} />
            {searchInput && <button onClick={() => setSearchInput('')} style={{ color: '#8fa890', lineHeight: 1 }}>×</button>}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fbf8', borderBottom: '1px solid #ddeadd' }}>
                {['Nombre', 'Tipo', 'Precio', 'Stock', 'Veces rentado', 'Última renta', 'Estado', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 font-semibold uppercase tracking-wide whitespace-nowrap"
                    style={{ fontSize: 11, color: '#5a7060', letterSpacing: '0.3px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(5)].map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f8f5' }}>
                  {[160, 80, 70, 50, 80, 100, 60, 50].map((w, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: '#e8f0e8', width: w }} /></td>
                  ))}
                </tr>
              ))}
              {!loading && productos.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-sm" style={{ color: '#8fa890' }}>Sin productos.</td></tr>
              )}
              {!loading && productos.map(p => {
                const tc = TIPO_COLORS[p.tipo] ?? { bg: '#f3f4f6', text: '#6b7280' }
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f5f8f5', opacity: p.activo ? 1 : 0.55 }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fbf8'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                    <td className="px-4 py-3 font-medium" style={{ color: '#162016' }}>{p.nombre}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: tc.bg, color: tc.text }}>
                        {p.tipo_display}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium" style={{ fontVariantNumeric: 'tabular-nums', color: '#162016' }}>
                      ${parseFloat(p.precio).toLocaleString('es-MX')}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: '#5a7060' }}>
                      {p.stock_total}
                    </td>
                    <td className="px-4 py-3">
                      {p.veces_rentado > 0 ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#15803d' }}>
                          {p.veces_rentado}×
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: '#8fa890' }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: '#5a7060' }}>
                      {p.ultima_renta ? formatFecha(p.ultima_renta) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: p.activo ? '#dcfce7' : '#f3f4f6', color: p.activo ? '#15803d' : '#6b7280' }}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button onClick={() => abrirEditar(p)}
                          className="text-xs px-3 py-1 rounded-lg"
                          style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                          Editar
                        </button>
                        <button onClick={() => toggleActivo(p)}
                          className="text-xs px-3 py-1 rounded-lg"
                          style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                          {p.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3" style={{ borderTop: '1px solid #ddeadd', background: '#f8fbf8' }}>
          <span className="text-xs" style={{ color: '#8fa890' }}>{productos.length} producto{productos.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Panel crear / editar */}
      {panel && (
        <div className="fixed inset-0 z-50 flex items-start justify-end" style={{ background: 'rgba(0,0,0,0.25)' }}
          onClick={e => { if (e.target === e.currentTarget) setPanel(null) }}>
          <div className="flex flex-col h-full bg-white" style={{ width: 400, borderLeft: '1px solid #ddeadd' }}>
            <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid #ddeadd' }}>
              <div>
                <div className="font-bold" style={{ fontSize: 16, color: '#162016' }}>
                  {panel === 'nuevo' ? 'Nuevo producto' : `Editar: ${editando?.nombre}`}
                </div>
                <div className="text-xs mt-0.5" style={{ color: '#8fa890' }}>
                  {panel === 'nuevo' ? 'Agregar al catálogo' : 'Modificar datos del producto'}
                </div>
              </div>
              <button onClick={() => setPanel(null)}
                className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border text-sm"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}>×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              <Field label="Nombre del producto">
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej. Castillo Medieval"
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: '#ddeadd', color: '#162016' }} />
              </Field>

              <Field label="Tipo">
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm"
                  style={{ borderColor: '#ddeadd', color: '#162016' }}>
                  {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>

              <Field label="Precio de renta ($)">
                <input type="number" min="0" step="50" value={form.precio}
                  onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
                  placeholder="1500"
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: '#ddeadd', color: '#162016' }} />
              </Field>

              <Field label="Stock total (unidades)">
                <input type="number" min="0" value={form.stock_total}
                  onChange={e => setForm(f => ({ ...f, stock_total: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: '#ddeadd', color: '#162016' }} />
              </Field>

              {errorForm && (
                <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#fee2e2', color: '#b91c1c' }}>{errorForm}</div>
              )}
            </div>

            <div className="flex gap-2 p-4" style={{ borderTop: '1px solid #ddeadd' }}>
              <button onClick={() => setPanel(null)}
                className="flex-1 text-sm font-medium py-2 rounded-lg border"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}>
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando}
                className="flex-1 text-sm font-semibold py-2 rounded-lg transition-opacity disabled:opacity-60"
                style={{ background: '#16a34a', color: 'white' }}>
                {guardando ? 'Guardando…' : panel === 'nuevo' ? 'Agregar' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
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
