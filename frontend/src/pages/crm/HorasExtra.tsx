import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../lib/api'

interface Empleado {
  id: number
  nombre: string
}

interface Preview {
  empleado: number
  empleado_nombre: string
  es_eventual: boolean
  semana_inicio: string
  semana_fin: string
  horas_trabajadas: string | number
  horas_descontadas: string | number
  horas_computables: string | number
  horas_extra: string | number
  pago_hora: string | number
  total_pago: string | number
  ya_existe: boolean
  existente_id: number | null
  pagado: boolean
}

interface HorasExtraItem {
  id: number
  empleado: number
  empleado_nombre: string
  semana_inicio: string
  semana_fin: string
  horas_trabajadas: string
  horas_descontadas: string
  horas_computables: string
  horas_extra: string
  total_pago: string
  pagado: boolean
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

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatMonto(s: string | number) {
  return `$${parseFloat(String(s)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function num(s: string | number | undefined) {
  return parseFloat(String(s ?? 0)) || 0
}

export default function HorasExtraCRM() {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const lunesDefault = useMemo(() => {
    const q = params.get('inicio')
    if (q) {
      try { return getLunes(new Date(q + 'T00:00:00')) } catch { /* fallthrough */ }
    }
    return getLunes()
  }, [params])

  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [empleado, setEmpleado] = useState(params.get('empleado') || '')
  const [semanaInicio, setSemanaInicio] = useState(toISO(lunesDefault))
  const [preview, setPreview] = useState<Preview | null>(null)
  const [cargandoPreview, setCargandoPreview] = useState(false)
  const [errorPreview, setErrorPreview] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [historial, setHistorial] = useState<HorasExtraItem[]>([])
  const [cargandoLista, setCargandoLista] = useState(true)
  const [paso, setPaso] = useState<'seleccion' | 'preview'>(params.get('empleado') ? 'preview' : 'seleccion')
  const [mensaje, setMensaje] = useState('')

  const domingo = toISO(sumarDias(new Date(semanaInicio + 'T00:00:00'), 6))

  const cargarLista = useCallback(() => {
    setCargandoLista(true)
    api.get('/horas-extra/', { params: { semana_inicio: semanaInicio } })
      .then(r => {
        const data = Array.isArray(r.data) ? r.data : (r.data.results ?? [])
        setHistorial(data)
      })
      .finally(() => setCargandoLista(false))
  }, [semanaInicio])

  useEffect(() => {
    api.get('/empleados/?page_size=200').then(r => {
      const data = Array.isArray(r.data) ? r.data : (r.data.results ?? [])
      setEmpleados(data.map((e: Empleado) => ({ id: e.id, nombre: e.nombre })))
    })
  }, [])

  useEffect(() => { cargarLista() }, [cargarLista])

  const calcularPreview = useCallback(async (empId?: string, inicio?: string) => {
    const empleadoId = empId ?? empleado
    const semana = inicio ?? semanaInicio
    if (!empleadoId || !semana) {
      setErrorPreview('Selecciona empleado y semana.')
      return
    }
    setCargandoPreview(true)
    setErrorPreview('')
    setMensaje('')
    try {
      const r = await api.get('/horas-extra/preview/', {
        params: { empleado: empleadoId, semana_inicio: semana },
      })
      setPreview(r.data)
      setPaso('preview')
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { error?: string } } })?.response?.data
      setPreview(null)
      setErrorPreview(data?.error || 'No se pudo calcular el preview.')
    } finally {
      setCargandoPreview(false)
    }
  }, [empleado, semanaInicio])

  useEffect(() => {
    if (params.get('empleado') && params.get('inicio')) {
      calcularPreview()
    }
    // solo al montar con query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function guardarReporte() {
    if (!empleado || !semanaInicio) return
    setGuardando(true)
    setMensaje('')
    setErrorPreview('')
    try {
      const r = await api.post('/horas-extra/', {
        empleado: parseInt(empleado, 10),
        semana_inicio: semanaInicio,
      })
      setMensaje(`Reporte guardado: ${formatMonto(r.data.total_pago)} en horas extras.`)
      setPreview(prev => prev ? {
        ...prev,
        ya_existe: true,
        existente_id: r.data.id,
        pagado: Boolean(r.data.pagado),
        horas_extra: r.data.horas_extra,
        total_pago: r.data.total_pago,
      } : prev)
      cargarLista()
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { error?: string } } })?.response?.data
      setErrorPreview(data?.error || 'No se pudo guardar el reporte.')
    } finally {
      setGuardando(false)
    }
  }

  async function marcarPagado(id: number) {
    if (!window.confirm('¿Marcar como pagado y agregar el monto a la nómina de esa semana?')) return
    try {
      const r = await api.post(`/horas-extra/${id}/pagar/`)
      const d = r.data || {}
      if (d.agregado_a_nomina) {
        const extra = d.creada_nomina ? ' (nómina creada)' : ''
        alert(`Horas extra agregadas a la nómina${extra}. Total nómina: ${formatMonto(d.nomina_total || 0)}`)
      } else if (d.ya_pagado) {
        alert('Estas horas extra ya estaban pagadas.')
      }
      cargarLista()
      if (preview?.existente_id === id) {
        setPreview(p => p ? { ...p, pagado: true } : p)
      }
    } catch {
      alert('No se pudo registrar el pago en nómina.')
    }
  }

  async function abrirRecibo(id: number) {
    try {
      const resp = await api.get(`/horas-extra/${id}/recibo/`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }))
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      alert('No se pudo cargar el recibo.')
    }
  }

  function semanaAnterior() {
    const d = sumarDias(new Date(semanaInicio + 'T00:00:00'), -7)
    setSemanaInicio(toISO(getLunes(d)))
    setPaso('seleccion')
    setPreview(null)
  }

  function semanaSiguiente() {
    const d = sumarDias(new Date(semanaInicio + 'T00:00:00'), 7)
    setSemanaInicio(toISO(getLunes(d)))
    setPaso('seleccion')
    setPreview(null)
  }

  const totalSemana = historial.reduce((s, h) => s + num(h.total_pago), 0)

  return (
    <div style={{ padding: 24, height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#162016', margin: 0 }}>Horas extras</h1>
          <p style={{ fontSize: 13, color: '#8fa890', margin: '4px 0 0' }}>
            Calcula y guarda el reporte semanal desde asistencias ($55/h sobre jornada).
          </p>
        </div>
        <button
          onClick={() => navigate('/crm/nomina')}
          style={{ background: 'white', border: '1px solid #d1e0d1', borderRadius: 8, padding: '9px 14px', fontSize: 14, cursor: 'pointer', color: '#374151' }}
        >
          ← Volver a nómina
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)', gap: 20, alignItems: 'start' }}>
        {/* Wizard */}
        <div style={{ background: 'white', border: '1px solid #e5ede5', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8fa890', letterSpacing: '0.06em', marginBottom: 14 }}>
            {paso === 'seleccion' ? 'PASO 1 · SELECCIÓN' : 'PASO 2 · PREVIEW Y GUARDAR'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <button onClick={semanaAnterior} style={{ background: 'white', border: '1px solid #d1e0d1', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>←</button>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#162016' }}>
              {formatFecha(semanaInicio)} — {formatFecha(domingo)}
            </div>
            <button onClick={semanaSiguiente} style={{ background: 'white', border: '1px solid #d1e0d1', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>→</button>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#8fa890' }}>EMPLEADO *</span>
            <select
              value={empleado}
              onChange={e => { setEmpleado(e.target.value); setPaso('seleccion'); setPreview(null) }}
              style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '9px 12px', fontSize: 14, background: 'white', outline: 'none' }}
            >
              <option value="">Selecciona empleado…</option>
              {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#8fa890' }}>LUNES DE LA SEMANA</span>
            <input
              type="date"
              value={semanaInicio}
              onChange={e => {
                const v = e.target.value
                if (!v) return
                setSemanaInicio(toISO(getLunes(new Date(v + 'T00:00:00'))))
                setPaso('seleccion')
                setPreview(null)
              }}
              style={{ border: '1px solid #d1e0d1', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none' }}
            />
          </label>

          <button
            onClick={() => calcularPreview()}
            disabled={cargandoPreview || !empleado}
            style={{
              width: '100%',
              background: cargandoPreview || !empleado ? '#86efac' : '#16a34a',
              color: 'white', border: 'none', borderRadius: 8, padding: 11,
              fontSize: 14, fontWeight: 600, cursor: cargandoPreview || !empleado ? 'not-allowed' : 'pointer',
            }}
          >
            {cargandoPreview ? 'Calculando…' : 'Calcular horas extras'}
          </button>

          {errorPreview && (
            <div style={{ marginTop: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#991b1b' }}>
              {errorPreview}
            </div>
          )}
          {mensaje && (
            <div style={{ marginTop: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#166534' }}>
              {mensaje}
            </div>
          )}

          {preview && paso === 'preview' && (
            <div style={{ marginTop: 18, borderTop: '1px solid #e5ede5', paddingTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#162016', marginBottom: 4 }}>
                {preview.empleado_nombre}
              </div>
              <div style={{ fontSize: 12, color: '#8fa890', marginBottom: 12 }}>
                {preview.es_eventual ? 'Eventual (jornada = días × 8h)' : 'Planta (jornada 43h)'}
                {preview.ya_existe && (
                  <span style={{ marginLeft: 8, color: preview.pagado ? '#16a34a' : '#b45309' }}>
                    · {preview.pagado ? 'Ya pagado' : 'Ya existe reporte'}
                  </span>
                )}
              </div>

              {[
                ['Horas trabajadas', preview.horas_trabajadas],
                ['Horas descontadas', preview.horas_descontadas],
                ['Horas computables', preview.horas_computables],
                ['Horas extras', preview.horas_extra],
                ['Pago / hora', formatMonto(preview.pago_hora || 55)],
              ].map(([label, value]) => (
                <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f4f0', fontSize: 14 }}>
                  <span style={{ color: '#374151' }}>{label}</span>
                  <span style={{ fontWeight: 600, color: '#162016' }}>{value}</span>
                </div>
              ))}

              <div style={{ marginTop: 12, background: '#f0fdf4', borderRadius: 10, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Total a pagar</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>{formatMonto(preview.total_pago)}</span>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                {!preview.ya_existe && (
                  <button
                    onClick={guardarReporte}
                    disabled={guardando}
                    style={{
                      flex: 1, background: guardando ? '#86efac' : '#162016', color: 'white', border: 'none',
                      borderRadius: 8, padding: 10, fontSize: 14, fontWeight: 600,
                      cursor: guardando ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {guardando ? 'Guardando…' : 'Guardar reporte'}
                  </button>
                )}
                {preview.existente_id && (
                  <>
                    <button
                      onClick={() => abrirRecibo(preview.existente_id!)}
                      style={{ flex: 1, background: 'white', border: '1px solid #d1e0d1', borderRadius: 8, padding: 10, fontSize: 14, cursor: 'pointer' }}
                    >
                      Recibo PDF
                    </button>
                    {!preview.pagado && (
                      <button
                        onClick={() => marcarPagado(preview.existente_id!)}
                        style={{ flex: 1, background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, padding: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Marcar pagado
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Lista semana */}
        <div style={{ background: 'white', border: '1px solid #e5ede5', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid #e5ede5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#162016' }}>Reportes de la semana</div>
              <div style={{ fontSize: 12, color: '#8fa890' }}>{formatFecha(semanaInicio)} — {formatFecha(domingo)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a' }}>{formatMonto(totalSemana)}</div>
              <div style={{ fontSize: 11, color: '#8fa890' }}>Total extras</div>
            </div>
          </div>

          {cargandoLista ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#8fa890', fontSize: 14 }}>Cargando…</div>
          ) : historial.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#8fa890', fontSize: 14 }}>
              Aún no hay reportes guardados esta semana.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5ede5', background: '#f9fdf9' }}>
                  {['Empleado', 'Hrs extra', 'Total', 'Estado', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#8fa890' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historial.map(h => (
                  <tr key={h.id} style={{ borderBottom: '1px solid #f0f4f0' }}>
                    <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 600, color: '#162016' }}>{h.empleado_nombre}</td>
                    <td style={{ padding: '12px 14px', fontSize: 14 }}>{h.horas_extra}</td>
                    <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 700, color: '#16a34a' }}>{formatMonto(h.total_pago)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, borderRadius: 999, padding: '3px 8px',
                        background: h.pagado ? '#dcfce7' : '#fef3c7',
                        color: h.pagado ? '#166534' : '#92400e',
                      }}>
                        {h.pagado ? 'Pagado' : 'Pendiente'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => {
                          setEmpleado(String(h.empleado))
                          setSemanaInicio(h.semana_inicio)
                          calcularPreview(String(h.empleado), h.semana_inicio)
                        }}
                        style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 13, cursor: 'pointer', marginRight: 8 }}
                      >
                        Ver
                      </button>
                      <button
                        onClick={() => abrirRecibo(h.id)}
                        style={{ background: 'none', border: 'none', color: '#374151', fontSize: 13, cursor: 'pointer', marginRight: 8 }}
                      >
                        PDF
                      </button>
                      {!h.pagado && (
                        <button
                          onClick={() => marcarPagado(h.id)}
                          style={{ background: 'none', border: 'none', color: '#16a34a', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                        >
                          Pagar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
