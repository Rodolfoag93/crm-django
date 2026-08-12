import { useCallback, useEffect, useState } from 'react'
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

export default function Reportes() {
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

  useEffect(() => { cargar() }, [cargar])

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

  const card = (label: string, value: string, sub?: string, color = '#162016') => (
    <div style={{ background: 'white', border: '1px solid #e5ede5', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#8fa890', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#8fa890', marginTop: 2 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ padding: 24, height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#162016', margin: 0 }}>Reportes</h1>
          <p style={{ fontSize: 13, color: '#8fa890', margin: '4px 0 0' }}>
            Resumen semanal, mensual o anual · ventas, gastos (incl. nómina) y balance
          </p>
        </div>
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
      </div>

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
    </div>
  )
}
