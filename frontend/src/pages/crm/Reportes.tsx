import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../lib/api'

interface RentaAlta {
  folio: string
  total: string
  cliente: string
}

interface VentaRow {
  folio: string
  fecha: string
  total: string
  pagado: boolean
  estado: string
  cuentas_texto?: string
  cuentas?: { cuenta: string; monto: string }[]
}

interface GastoRow {
  fecha: string
  descripcion: string
  tipo: string
  categoria: string
  cuenta?: string
  monto: string
}

interface CobroCuenta {
  cuenta: string
  monto: string
}

interface Reporte {
  tipo: string
  etiqueta: string
  fecha_inicio: string
  fecha_fin: string
  clientes_nuevos: number
  clientes_recurrentes: number
  ticket_promedio: string
  renta_mas_alta: RentaAlta | null
  total_ventas: string
  total_cobrado: string
  total_sin_cobrar: string
  total_gastos: string
  balance: string
  count_ventas: number
  count_gastos: number
  cobros_por_cuenta?: CobroCuenta[]
  total_cobros_movimientos?: string
  ventas: VentaRow[]
  gastos: GastoRow[]
}

interface ProductoRentado {
  producto_id: number
  nombre: string
  tipo: string
  tipo_label: string
  veces: number
  unidades: number
  ingreso: string
}

interface ProductoFiltro {
  id: number
  nombre: string
}

interface ProductoEncontrado {
  id: number
  nombre: string
  precio: string
  tipo: string
}

interface ReporteProductos {
  fecha_inicio: string
  fecha_fin: string
  q: string
  producto_ids: number[]
  productos_filtro: ProductoFiltro[]
  tipo_producto: string
  count_productos: number
  total_veces: number
  total_unidades: number
  total_ingreso: string
  productos: ProductoRentado[]
}

const TIPOS_PRODUCTO = [
  { id: '', label: 'Todos' },
  { id: 'BR', label: 'Brincolines' },
  { id: 'ME', label: 'Mesas' },
  { id: 'SI', label: 'Sillas' },
  { id: 'MT', label: 'Mantelería' },
  { id: 'LZ', label: 'Loza' },
  { id: 'AN', label: 'Animación' },
  { id: 'FL', label: 'Flete' },
  { id: 'OT', label: 'Otro' },
]

function getLunes(fecha?: Date): Date {
  const d = fecha ? new Date(fecha) : new Date()
  const dia = d.getDay()
  const diff = dia === 0 ? -6 : 1 - dia
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sumarDias(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function primerDiaMes(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function primerDiaAno(d: Date) {
  return new Date(d.getFullYear(), 0, 1)
}

type VistaReporte = 'negocio' | 'productos'
type TipoReporte = 'semana' | 'mes' | 'ano'

function refParaTipo(t: TipoReporte, base = new Date()): Date {
  if (t === 'semana') return getLunes(base)
  if (t === 'ano') return primerDiaAno(base)
  return primerDiaMes(base)
}

function fechaParamPara(t: TipoReporte, ref: Date): string {
  if (t === 'semana') return toISO(getLunes(ref))
  if (t === 'ano') return toISO(primerDiaAno(ref))
  return toISO(primerDiaMes(ref))
}

function formatMonto(s: string | number) {
  return `$${parseFloat(String(s || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function lunesAViernesActual() {
  const lun = getLunes()
  return { inicio: toISO(lun), fin: toISO(sumarDias(lun, 4)) }
}

export default function Reportes() {
  const [vista, setVista] = useState<VistaReporte>('negocio')

  // ── Negocio ──────────────────────────────────────────────────────
  const [tipo, setTipo] = useState<TipoReporte>('semana')
  const [ref, setRef] = useState<Date>(getLunes())
  const [data, setData] = useState<Reporte | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [descargando, setDescargando] = useState(false)

  const fechaParam = fechaParamPara(tipo, ref)

  const cargar = useCallback(() => {
    setLoading(true)
    setError('')
    api.get('/reportes/negocio/', { params: { tipo, fecha: fechaParam } })
      .then(r => setData(r.data))
      .catch(() => setError('No se pudo cargar el reporte.'))
      .finally(() => setLoading(false))
  }, [tipo, fechaParam])

  useEffect(() => {
    if (vista === 'negocio') cargar()
  }, [vista, cargar])

  function anterior() {
    setRef(d => {
      if (tipo === 'semana') return sumarDias(d, -7)
      if (tipo === 'ano') return new Date(d.getFullYear() - 1, 0, 1)
      return new Date(d.getFullYear(), d.getMonth() - 1, 1)
    })
  }
  function siguiente() {
    setRef(d => {
      if (tipo === 'semana') return sumarDias(d, 7)
      if (tipo === 'ano') return new Date(d.getFullYear() + 1, 0, 1)
      return new Date(d.getFullYear(), d.getMonth() + 1, 1)
    })
  }
  function hoy() {
    setRef(refParaTipo(tipo))
  }

  async function descargarPdf() {
    setDescargando(true)
    try {
      const resp = await api.get('/reportes/negocio/pdf/', {
        params: { tipo, fecha: fechaParam },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }))
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      alert('No se pudo generar el PDF.')
    } finally {
      setDescargando(false)
    }
  }

  // ── Productos rentados ───────────────────────────────────────────
  const defaultsProd = useMemo(() => lunesAViernesActual(), [])
  const [fechaInicio, setFechaInicio] = useState(defaultsProd.inicio)
  const [fechaFin, setFechaFin] = useState(defaultsProd.fin)
  const [productosSeleccionados, setProductosSeleccionados] = useState<ProductoFiltro[]>([])
  const [queryProducto, setQueryProducto] = useState('')
  const [resultProductos, setResultProductos] = useState<ProductoEncontrado[]>([])
  const [buscandoProducto, setBuscandoProducto] = useState(false)
  const [tipoProducto, setTipoProducto] = useState('')
  const [dataProd, setDataProd] = useState<ReporteProductos | null>(null)
  const [loadingProd, setLoadingProd] = useState(false)
  const [errorProd, setErrorProd] = useState('')

  useEffect(() => {
    if (queryProducto.length < 2) {
      setResultProductos([])
      return
    }
    const t = setTimeout(() => {
      setBuscandoProducto(true)
      api.get('/productos-buscar/', {
        params: { q: queryProducto, tipo: tipoProducto || undefined, limit: 20 },
      })
        .then(r => setResultProductos(r.data))
        .catch(() => setResultProductos([]))
        .finally(() => setBuscandoProducto(false))
    }, 300)
    return () => clearTimeout(t)
  }, [queryProducto, tipoProducto])

  const agregarProductoFiltro = (p: ProductoEncontrado) => {
    setProductosSeleccionados(prev => {
      if (prev.some(x => x.id === p.id)) return prev
      return [...prev, { id: p.id, nombre: p.nombre }]
    })
    setQueryProducto('')
    setResultProductos([])
  }

  const quitarProductoFiltro = (id: number) => {
    setProductosSeleccionados(prev => prev.filter(p => p.id !== id))
  }

  const cargarProductos = useCallback(() => {
    if (!fechaInicio || !fechaFin) return
    setLoadingProd(true)
    setErrorProd('')
    api.get('/reportes/productos/', {
      params: {
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        producto_ids: productosSeleccionados.length
          ? productosSeleccionados.map(p => p.id).join(',')
          : undefined,
        tipo: tipoProducto || undefined,
      },
    })
      .then(r => setDataProd(r.data))
      .catch(() => setErrorProd('No se pudo cargar el reporte de productos.'))
      .finally(() => setLoadingProd(false))
  }, [fechaInicio, fechaFin, productosSeleccionados, tipoProducto])

  useEffect(() => {
    if (vista === 'productos') cargarProductos()
  }, [vista, cargarProductos])

  const card = (label: string, value: string, sub?: string, color = '#162016') => (
    <div style={{ background: 'white', border: '1px solid #e5ede5', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#8fa890', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#8fa890', marginTop: 2 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ padding: 24, height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#162016', margin: 0 }}>Reportes</h1>
          <p style={{ fontSize: 13, color: '#8fa890', margin: '4px 0 0' }}>
            {vista === 'negocio'
              ? 'Resumen semanal, mensual o anual · ventas, gastos y balance'
              : 'Cuántas veces se rentó cada producto en un rango de fechas'}
          </p>
        </div>
        {vista === 'negocio' && (
          <button
            onClick={descargarPdf}
            disabled={descargando || loading}
            style={{
              background: descargando ? '#86efac' : '#16a34a', color: 'white', border: 'none',
              borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600,
              cursor: descargando ? 'not-allowed' : 'pointer',
            }}
          >
            {descargando ? 'Generando…' : 'Descargar PDF'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', background: 'white', border: '1px solid #d1e0d1', borderRadius: 8, overflow: 'hidden', marginBottom: 16, width: 'fit-content' }}>
        {([
          { id: 'negocio' as const, label: 'Negocio' },
          { id: 'productos' as const, label: 'Productos rentados' },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setVista(t.id)}
            style={{
              border: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: vista === t.id ? '#16a34a' : 'white',
              color: vista === t.id ? 'white' : '#374151',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {vista === 'negocio' && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: 'white', border: '1px solid #d1e0d1', borderRadius: 8, overflow: 'hidden' }}>
              {([
                { id: 'semana' as const, label: 'Semana' },
                { id: 'mes' as const, label: 'Mes' },
                { id: 'ano' as const, label: 'Año' },
              ]).map(t => (
                <button
                  key={t.id}
                  onClick={() => { setTipo(t.id); setRef(refParaTipo(t.id)) }}
                  style={{
                    border: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: tipo === t.id ? '#16a34a' : 'white',
                    color: tipo === t.id ? 'white' : '#374151',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button onClick={anterior} style={{ background: 'white', border: '1px solid #d1e0d1', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>←</button>
            <span style={{ fontWeight: 600, fontSize: 14, color: '#162016', minWidth: 220, textAlign: 'center' }}>
              {data?.etiqueta || '…'}
            </span>
            <button onClick={siguiente} style={{ background: 'white', border: '1px solid #d1e0d1', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>→</button>
            <button onClick={hoy} style={{ background: 'white', border: '1px solid #16a34a', borderRadius: 8, padding: '7px 14px', fontSize: 13, color: '#16a34a', cursor: 'pointer', fontWeight: 600 }}>
              Actual
            </button>
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#991b1b', marginBottom: 16 }}>
              {error}
            </div>
          )}

          {loading || !data ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#8fa890' }}>Cargando…</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
                {card('Clientes nuevos', String(data.clientes_nuevos))}
                {card('Recurrentes', String(data.clientes_recurrentes))}
                {card('Ticket promedio', formatMonto(data.ticket_promedio))}
                {card(
                  'Renta más alta',
                  data.renta_mas_alta ? formatMonto(data.renta_mas_alta.total) : '—',
                  data.renta_mas_alta?.folio,
                )}
                {card('Balance', formatMonto(data.balance), 'Ventas − gastos', '#16a34a')}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                {card('Total ventas', formatMonto(data.total_ventas), `${data.count_ventas} rentas`)}
                {card('Cobrado', formatMonto(data.total_cobrado), undefined, '#2563eb')}
                {card('Sin cobrar', formatMonto(data.total_sin_cobrar), undefined, '#b45309')}
              </div>

              {(data.cobros_por_cuenta?.length ?? 0) > 0 && (
                <div style={{ background: 'white', border: '1px solid #e5ede5', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5ede5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#162016' }}>Cobros por cuenta</div>
                      <div style={{ fontSize: 12, color: '#8fa890', marginTop: 2 }}>Desglose de lo cobrado (no del total de ventas)</div>
                    </div>
                    <div style={{ fontWeight: 700, color: '#16a34a' }}>{formatMonto(data.total_cobros_movimientos || 0)}</div>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {data.cobros_por_cuenta!.map(c => (
                        <tr key={c.cuenta} style={{ borderTop: '1px solid #f0f4f0' }}>
                          <td style={{ padding: '10px 16px', fontSize: 14, fontWeight: 600 }}>{c.cuenta}</td>
                          <td style={{ padding: '10px 16px', fontSize: 14, textAlign: 'right', fontWeight: 700, color: '#2563eb' }}>{formatMonto(c.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ background: 'white', border: '1px solid #e5ede5', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5ede5', fontWeight: 700, color: '#162016' }}>
                    Ventas ({data.count_ventas})
                  </div>
                  <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                    {data.ventas.length === 0 ? (
                      <div style={{ padding: 24, color: '#8fa890', fontSize: 13 }}>Sin rentas en el periodo.</div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f9fdf9' }}>
                            {['Folio', 'Total', 'Estado', 'Cuenta'].map(h => (
                              <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#8fa890' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.ventas.map(v => (
                            <tr key={v.folio} style={{ borderTop: '1px solid #f0f4f0' }}>
                              <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{v.folio}</td>
                              <td style={{ padding: '10px 12px', fontSize: 13 }}>{formatMonto(v.total)}</td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{
                                  fontSize: 11, fontWeight: 600, borderRadius: 999, padding: '2px 8px',
                                  background: v.pagado ? '#dcfce7' : '#fef3c7',
                                  color: v.pagado ? '#166534' : '#92400e',
                                }}>
                                  {v.estado}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: 12, color: '#374151' }}>
                                {v.cuentas_texto || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div style={{ padding: '12px 16px', borderTop: '1px solid #e5ede5', fontWeight: 700, color: '#16a34a' }}>
                    Total: {formatMonto(data.total_ventas)}
                  </div>
                </div>

                <div style={{ background: 'white', border: '1px solid #e5ede5', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5ede5', fontWeight: 700, color: '#162016' }}>
                    Gastos ({data.count_gastos})
                  </div>
                  <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                    {data.gastos.length === 0 ? (
                      <div style={{ padding: 24, color: '#8fa890', fontSize: 13 }}>Sin gastos en el periodo.</div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f9fdf9' }}>
                            {['Fecha', 'Descripción', 'Cuenta', 'Monto'].map(h => (
                              <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#8fa890' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.gastos.map((g, i) => (
                            <tr key={`${g.fecha}-${i}`} style={{ borderTop: '1px solid #f0f4f0' }}>
                              <td style={{ padding: '10px 12px', fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{formatFecha(g.fecha)}</td>
                              <td style={{ padding: '10px 12px', fontSize: 13 }}>
                                <div>{g.descripcion}</div>
                                <div style={{ fontSize: 11, color: '#8fa890' }}>{g.tipo} · {g.categoria}</div>
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: 12, color: '#374151' }}>{g.cuenta || '—'}</td>
                              <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{formatMonto(g.monto)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div style={{ padding: '12px 16px', borderTop: '1px solid #e5ede5', fontWeight: 700, color: '#162016' }}>
                    Total: {formatMonto(data.total_gastos)}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {vista === 'productos' && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6b7280' }}>
              Desde
              <input
                type="date"
                value={fechaInicio}
                onChange={e => setFechaInicio(e.target.value)}
                style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '8px 10px', fontSize: 14 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6b7280' }}>
              Hasta
              <input
                type="date"
                value={fechaFin}
                onChange={e => setFechaFin(e.target.value)}
                style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '8px 10px', fontSize: 14 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6b7280', minWidth: 260, position: 'relative' }}>
              Productos
              <div style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '6px 10px', background: 'white', minHeight: 38 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {productosSeleccionados.map(p => (
                    <span
                      key={p.id}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#dcfce7', color: '#166534', borderRadius: 999,
                        padding: '2px 8px', fontSize: 12, fontWeight: 600,
                      }}
                    >
                      {p.nombre}
                      <button
                        type="button"
                        onClick={() => quitarProductoFiltro(p.id)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#166534', lineHeight: 1, padding: 0, fontSize: 14 }}
                        aria-label={`Quitar ${p.nombre}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder={productosSeleccionados.length ? 'Agregar otro…' : 'Buscar producto…'}
                    value={queryProducto}
                    onChange={e => setQueryProducto(e.target.value)}
                    style={{ border: 'none', outline: 'none', fontSize: 14, flex: 1, minWidth: 120, padding: '2px 0' }}
                  />
                  {buscandoProducto && (
                    <span style={{ fontSize: 11, color: '#8fa890' }}>…</span>
                  )}
                </div>
              </div>
              {resultProductos.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 20,
                  background: 'white', border: '1px solid #d1e0d1', borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.08)', maxHeight: 220, overflowY: 'auto',
                }}>
                  {resultProductos.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => agregarProductoFiltro(p)}
                      disabled={productosSeleccionados.some(x => x.id === p.id)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', border: 'none',
                        background: productosSeleccionados.some(x => x.id === p.id) ? '#f9fdf9' : 'white',
                        padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                        color: productosSeleccionados.some(x => x.id === p.id) ? '#8fa890' : '#162016',
                        borderBottom: '1px solid #f0f4f0',
                      }}
                    >
                      {p.nombre}
                    </button>
                  ))}
                </div>
              )}
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6b7280' }}>
              Tipo
              <select
                value={tipoProducto}
                onChange={e => setTipoProducto(e.target.value)}
                style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 140 }}
              >
                {TIPOS_PRODUCTO.map(t => (
                  <option key={t.id || 'all'} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>
            <button
              onClick={cargarProductos}
              style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
            >
              Actualizar
            </button>
            <button
              onClick={() => {
                const d = lunesAViernesActual()
                setFechaInicio(d.inicio)
                setFechaFin(d.fin)
              }}
              style={{ background: 'white', border: '1px solid #16a34a', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#16a34a', cursor: 'pointer', fontWeight: 600 }}
            >
              Lun–Vie
            </button>
          </div>

          {errorProd && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#991b1b', marginBottom: 16 }}>
              {errorProd}
            </div>
          )}

          {loadingProd || !dataProd ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#8fa890' }}>Cargando…</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
                {card('Productos', String(dataProd.count_productos))}
                {card('Total veces', String(dataProd.total_veces), 'Rentas distintas')}
                {card('Unidades', String(dataProd.total_unidades), 'Suma de cantidades')}
                {card('Ingreso', formatMonto(dataProd.total_ingreso), undefined, '#16a34a')}
              </div>

              <div style={{ background: 'white', border: '1px solid #e5ede5', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5ede5', fontWeight: 700, color: '#162016' }}>
                  {formatFecha(dataProd.fecha_inicio)} — {formatFecha(dataProd.fecha_fin)}
                  {dataProd.productos_filtro?.length
                    ? ` · ${dataProd.productos_filtro.map(p => p.nombre).join(', ')}`
                    : ''}
                </div>
                <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                  {dataProd.productos.length === 0 ? (
                    <div style={{ padding: 24, color: '#8fa890', fontSize: 13 }}>
                      Ningún producto rentado en ese rango
                      {dataProd.productos_filtro?.length ? ' para la selección' : ''}.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f9fdf9', position: 'sticky', top: 0 }}>
                          {['Producto', 'Tipo', 'Veces', 'Unidades', 'Ingreso'].map(h => (
                            <th key={h} style={{ textAlign: h === 'Producto' || h === 'Tipo' ? 'left' : 'right', padding: '8px 12px', fontSize: 11, color: '#8fa890' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dataProd.productos.map(p => (
                          <tr key={p.producto_id} style={{ borderTop: '1px solid #f0f4f0' }}>
                            <td style={{ padding: '10px 12px', fontSize: 14, fontWeight: 600 }}>{p.nombre}</td>
                            <td style={{ padding: '10px 12px', fontSize: 13, color: '#6b7280' }}>{p.tipo_label}</td>
                            <td style={{ padding: '10px 12px', fontSize: 14, textAlign: 'right', fontWeight: 700, color: '#162016' }}>{p.veces}</td>
                            <td style={{ padding: '10px 12px', fontSize: 14, textAlign: 'right' }}>{p.unidades}</td>
                            <td style={{ padding: '10px 12px', fontSize: 14, textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{formatMonto(p.ingreso)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
