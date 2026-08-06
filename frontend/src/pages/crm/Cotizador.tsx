import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../lib/api'

type Tipo = 'NORMAL' | 'PROYECTO'
type Status = 'BORRADOR' | 'ENVIADA' | 'ACEPTADA' | 'RECHAZADA' | 'CONVERTIDA'

interface CotizacionListItem {
  id: number
  folio: string
  tipo: Tipo
  status: Status
  cliente_nombre: string
  nombre_evento: string
  fecha_evento: string | null
  total: string
  renta_folio: string | null
}

interface ConceptoDraft {
  nombre: string
  descripcion: string
  cantidad: number
  monto: string
  producto_id: number | null
}

interface ZonaDraft {
  titulo: string
  descripcion: string
}

interface ClienteOpt {
  id: number
  nombre: string
  telefono?: string
}

interface ProductoOpt {
  id: number
  nombre: string
  precio: string
  tipo: string
}

const STATUS_LABEL: Record<Status, string> = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Enviada',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  CONVERTIDA: 'Convertida',
}

function money(n: string | number) {
  const v = Number(n) || 0
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

export default function CotizadorCRM() {
  const [items, setItems] = useState<CotizacionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [tipoNueva, setTipoNueva] = useState<Tipo>('NORMAL')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [detalle, setDetalle] = useState<any>(null)

  const [clientes, setClientes] = useState<ClienteOpt[]>([])
  const [productos, setProductos] = useState<ProductoOpt[]>([])
  const [clienteId, setClienteId] = useState('')
  const [destinatario, setDestinatario] = useState('')
  const [nombreEvento, setNombreEvento] = useState('')
  const [asistentes, setAsistentes] = useState('')
  const [sede, setSede] = useState('')
  const [fecha, setFecha] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFin, setHoraFin] = useState('')
  const [aplicarIva, setAplicarIva] = useState(false)
  const [aplicarIsr, setAplicarIsr] = useState(false)
  const [conceptos, setConceptos] = useState<ConceptoDraft[]>([])
  const [zonas, setZonas] = useState<ZonaDraft[]>([])
  const [productoSel, setProductoSel] = useState('')
  const [cantidadProd, setCantidadProd] = useState('1')

  const fetchList = useCallback(() => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (q) params.q = q
    if (tipoFiltro) params.tipo = tipoFiltro
    if (statusFiltro) params.status = statusFiltro
    api.get('/crm/cotizaciones/', { params })
      .then(r => setItems(r.data.results || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [q, tipoFiltro, statusFiltro])

  useEffect(() => { fetchList() }, [fetchList])

  useEffect(() => {
    api.get('/clientes/', { params: { page: 1 } }).then(r => {
      const results = r.data.results || r.data || []
      setClientes(results.map((c: any) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono })))
    }).catch(console.error)
    api.get('/productos/', { params: { activo: true } }).then(r => {
      const results = r.data.results || r.data || []
      setProductos(results.filter((p: any) => p.nombre !== 'Proyecto recreativo'))
    }).catch(console.error)
  }, [])

  const subtotalPreview = useMemo(
    () => conceptos.reduce((s, c) => s + (Number(c.monto) || 0), 0),
    [conceptos],
  )

  const abrirNueva = (tipo: Tipo) => {
    setTipoNueva(tipo)
    setShowForm(true)
    setDetalle(null)
    setError('')
    setClienteId('')
    setDestinatario('')
    setNombreEvento('')
    setAsistentes('')
    setSede('')
    setFecha('')
    setHoraInicio('')
    setHoraFin('')
    setAplicarIva(tipo === 'PROYECTO')
    setAplicarIsr(tipo === 'PROYECTO')
    setConceptos([])
    setZonas(tipo === 'PROYECTO' ? [{ titulo: 'Bienvenida', descripcion: '' }] : [])
  }

  const addProducto = () => {
    const p = productos.find(x => String(x.id) === productoSel)
    if (!p) return
    const cant = Math.max(1, parseInt(cantidadProd || '1', 10))
    const unit = Number(p.precio) || 0
    setConceptos(prev => [...prev, {
      nombre: p.nombre,
      descripcion: '',
      cantidad: cant,
      monto: String((unit * cant).toFixed(2)),
      producto_id: p.id,
    }])
  }

  const addConceptoLibre = () => {
    const nombre = window.prompt('Nombre del concepto')
    if (!nombre) return
    const monto = window.prompt('Monto', '0') || '0'
    setConceptos(prev => [...prev, {
      nombre,
      descripcion: '',
      cantidad: 1,
      monto: String(Number(monto) || 0),
      producto_id: null,
    }])
  }

  const guardar = async () => {
    setSaving(true)
    setError('')
    try {
      const payload = {
        tipo: tipoNueva,
        cliente_id: Number(clienteId),
        destinatario,
        nombre_evento: nombreEvento,
        asistentes: asistentes ? Number(asistentes) : null,
        sede,
        fecha_evento: fecha || null,
        hora_inicio: horaInicio || null,
        hora_fin: horaFin || null,
        aplicar_iva: aplicarIva,
        aplicar_isr: aplicarIsr,
        conceptos: conceptos.map((c, i) => ({ ...c, orden: i })),
        zonas: zonas.map((z, i) => ({ ...z, orden: i })),
      }
      const { data } = await api.post('/crm/cotizaciones/', payload)
      setShowForm(false)
      setDetalle(data)
      fetchList()
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const verDetalle = async (id: number) => {
    const { data } = await api.get(`/crm/cotizaciones/${id}/`)
    setDetalle(data)
    setShowForm(false)
  }

  const cambiarStatus = async (status: Status) => {
    if (!detalle) return
    await api.post(`/crm/cotizaciones/${detalle.id}/status/`, { status })
    verDetalle(detalle.id)
    fetchList()
  }

  const convertir = async () => {
    if (!detalle) return
    if (!window.confirm('¿Convertir esta cotización en renta?')) return
    try {
      const { data } = await api.post(`/crm/cotizaciones/${detalle.id}/convertir/`, { anticipo: 0 })
      alert(`Convertida a renta ${data.folio}`)
      verDetalle(detalle.id)
      fetchList()
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Error al convertir')
    }
  }

  const abrirPdf = async () => {
    if (!detalle) return
    const res = await api.get(`/crm/cotizaciones/${detalle.id}/pdf/`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    window.open(url, '_blank')
  }

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-bold" style={{ fontSize: 20, letterSpacing: '-0.4px', color: '#162016' }}>Cotizador</h1>
          <p className="text-sm mt-0.5" style={{ color: '#5a7060' }}>Cotizaciones normales y de proyectos recreativos</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => abrirNueva('NORMAL')} className="px-3 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: '#16a34a' }}>
            + Normal
          </button>
          <button onClick={() => abrirNueva('PROYECTO')} className="px-3 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: '#0f3d22' }}>
            + Proyecto
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-4 flex gap-3 flex-wrap" style={{ borderColor: '#ddeadd' }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar folio, cliente, evento..."
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]"
          style={{ borderColor: '#ddeadd' }}
        />
        <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#ddeadd' }}>
          <option value="">Todos los tipos</option>
          <option value="NORMAL">Normal</option>
          <option value="PROYECTO">Proyecto</option>
        </select>
        <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#ddeadd' }}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border p-5 flex flex-col gap-4" style={{ borderColor: '#ddeadd' }}>
          <h2 className="font-semibold" style={{ color: '#162016' }}>Nueva cotización {tipoNueva.toLowerCase()}</h2>
          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label className="text-sm flex flex-col gap-1">
              Cliente
              <select value={clienteId} onChange={e => {
                setClienteId(e.target.value)
                const c = clientes.find(x => String(x.id) === e.target.value)
                if (c && !destinatario) setDestinatario(c.nombre)
              }} className="border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd' }}>
                <option value="">— Seleccionar —</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <label className="text-sm flex flex-col gap-1">
              Destinatario
              <input value={destinatario} onChange={e => setDestinatario(e.target.value)} className="border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd' }} />
            </label>
            <label className="text-sm flex flex-col gap-1">
              Fecha
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd' }} />
            </label>
            <label className="text-sm flex flex-col gap-1">
              Inicio
              <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} className="border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd' }} />
            </label>
            <label className="text-sm flex flex-col gap-1">
              Fin
              <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} className="border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd' }} />
            </label>
            {tipoNueva === 'PROYECTO' && (
              <>
                <label className="text-sm flex flex-col gap-1">
                  Evento
                  <input value={nombreEvento} onChange={e => setNombreEvento(e.target.value)} className="border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd' }} />
                </label>
                <label className="text-sm flex flex-col gap-1">
                  Asistentes
                  <input type="number" value={asistentes} onChange={e => setAsistentes(e.target.value)} className="border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd' }} />
                </label>
                <label className="text-sm flex flex-col gap-1">
                  Sede
                  <input value={sede} onChange={e => setSede(e.target.value)} className="border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd' }} />
                </label>
              </>
            )}
          </div>

          {tipoNueva === 'PROYECTO' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Zonas narrativas</h3>
                <button type="button" className="text-sm" style={{ color: '#0f3d22' }} onClick={() => setZonas(z => [...z, { titulo: '', descripcion: '' }])}>+ Zona</button>
              </div>
              <div className="flex flex-col gap-2">
                {zonas.map((z, i) => (
                  <div key={i} className="border rounded-lg p-3" style={{ borderColor: '#ddeadd' }}>
                    <input value={z.titulo} onChange={e => setZonas(arr => arr.map((x, idx) => idx === i ? { ...x, titulo: e.target.value } : x))} placeholder="Título" className="border rounded px-2 py-1 text-sm w-full mb-2" style={{ borderColor: '#ddeadd' }} />
                    <textarea value={z.descripcion} onChange={e => setZonas(arr => arr.map((x, idx) => idx === i ? { ...x, descripcion: e.target.value } : x))} placeholder="Descripción" rows={2} className="border rounded px-2 py-1 text-sm w-full" style={{ borderColor: '#ddeadd' }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold mb-2">Conceptos</h3>
            <div className="flex gap-2 flex-wrap mb-3">
              <select value={productoSel} onChange={e => setProductoSel(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[220px]" style={{ borderColor: '#ddeadd' }}>
                <option value="">Producto del catálogo</option>
                {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} — {money(p.precio)}</option>)}
              </select>
              <input type="number" min={1} value={cantidadProd} onChange={e => setCantidadProd(e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-20" style={{ borderColor: '#ddeadd' }} />
              <button type="button" onClick={addProducto} className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#ddeadd' }}>+ Catálogo</button>
              <button type="button" onClick={addConceptoLibre} className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#ddeadd' }}>+ Libre</button>
            </div>
            <div className="flex flex-col gap-2">
              {conceptos.map((c, i) => (
                <div key={i} className="flex gap-2 flex-wrap items-center text-sm">
                  <input value={c.nombre} onChange={e => setConceptos(arr => arr.map((x, idx) => idx === i ? { ...x, nombre: e.target.value } : x))} className="border rounded px-2 py-1 flex-1 min-w-[160px]" style={{ borderColor: '#ddeadd' }} />
                  <input type="number" value={c.cantidad} onChange={e => setConceptos(arr => arr.map((x, idx) => idx === i ? { ...x, cantidad: Number(e.target.value) || 1 } : x))} className="border rounded px-2 py-1 w-16" style={{ borderColor: '#ddeadd' }} />
                  <input type="number" step="0.01" value={c.monto} onChange={e => setConceptos(arr => arr.map((x, idx) => idx === i ? { ...x, monto: e.target.value } : x))} className="border rounded px-2 py-1 w-28" style={{ borderColor: '#ddeadd' }} />
                  <span className="text-xs" style={{ color: '#8fa890' }}>{c.producto_id ? 'Catálogo' : 'Libre'}</span>
                  <button type="button" onClick={() => setConceptos(arr => arr.filter((_, idx) => idx !== i))} className="text-red-600">Quitar</button>
                </div>
              ))}
            </div>
            <p className="text-sm mt-2" style={{ color: '#5a7060' }}>Subtotal: <strong>{money(subtotalPreview)}</strong></p>
          </div>

          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={aplicarIva} onChange={e => setAplicarIva(e.target.checked)} /> IVA 16%</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={aplicarIsr} onChange={e => setAplicarIsr(e.target.checked)} /> ISR 1.25%</label>
          </div>

          <div className="flex gap-2">
            <button disabled={saving || !clienteId || !fecha} onClick={guardar} className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50" style={{ background: '#16a34a' }}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: '#ddeadd' }}>Cancelar</button>
          </div>
        </div>
      )}

      {detalle && !showForm && (
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#ddeadd' }}>
          <div className="flex justify-between gap-3 flex-wrap mb-3">
            <div>
              <h2 className="font-semibold" style={{ color: '#162016' }}>{detalle.folio} — {detalle.cliente_nombre}</h2>
              <p className="text-sm" style={{ color: '#5a7060' }}>{detalle.tipo} · {STATUS_LABEL[detalle.status as Status]} · Total {money(detalle.total)}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={abrirPdf} className="px-3 py-1.5 rounded-lg text-sm text-white" style={{ background: '#7c3aed' }}>PDF</button>
              {detalle.status !== 'CONVERTIDA' && (
                <button onClick={convertir} className="px-3 py-1.5 rounded-lg text-sm text-white" style={{ background: '#ea580c' }}>Convertir a renta</button>
              )}
              <button onClick={() => setDetalle(null)} className="px-3 py-1.5 rounded-lg text-sm border" style={{ borderColor: '#ddeadd' }}>Cerrar</button>
            </div>
          </div>
          {detalle.status !== 'CONVERTIDA' && (
            <div className="flex gap-2 mb-3 flex-wrap">
              {detalle.status === 'BORRADOR' && <button onClick={() => cambiarStatus('ENVIADA')} className="text-sm px-2 py-1 rounded border" style={{ borderColor: '#ddeadd' }}>Marcar enviada</button>}
              {detalle.status === 'ENVIADA' && <button onClick={() => cambiarStatus('ACEPTADA')} className="text-sm px-2 py-1 rounded border" style={{ borderColor: '#ddeadd' }}>Marcar aceptada</button>}
              {['BORRADOR', 'ENVIADA', 'ACEPTADA'].includes(detalle.status) && <button onClick={() => cambiarStatus('RECHAZADA')} className="text-sm px-2 py-1 rounded border" style={{ borderColor: '#ddeadd' }}>Rechazar</button>}
            </div>
          )}
          {detalle.renta_folio && <p className="text-sm mb-2">Renta: <strong>{detalle.renta_folio}</strong></p>}
          <ul className="text-sm space-y-1">
            {(detalle.conceptos || []).map((c: any) => (
              <li key={c.id} className="flex justify-between border-b py-1" style={{ borderColor: '#eef3ee' }}>
                <span>{c.nombre} × {c.cantidad}</span>
                <span>{money(c.monto)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#ddeadd' }}>
        <table className="w-full text-sm">
          <thead style={{ background: '#f4f8f4', color: '#5a7060' }}>
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Folio</th>
              <th className="text-left px-4 py-3 font-semibold">Tipo</th>
              <th className="text-left px-4 py-3 font-semibold">Cliente</th>
              <th className="text-left px-4 py-3 font-semibold">Fecha</th>
              <th className="text-left px-4 py-3 font-semibold">Total</th>
              <th className="text-left px-4 py-3 font-semibold">Estado</th>
              <th className="text-left px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-center" style={{ color: '#8fa890' }}>Cargando...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center" style={{ color: '#8fa890' }}>Sin cotizaciones</td></tr>}
            {items.map(c => (
              <tr key={c.id} className="border-t" style={{ borderColor: '#eef3ee' }}>
                <td className="px-4 py-3 font-medium">{c.folio}</td>
                <td className="px-4 py-3">{c.tipo === 'PROYECTO' ? 'Proyecto' : 'Normal'}</td>
                <td className="px-4 py-3">{c.cliente_nombre}</td>
                <td className="px-4 py-3">{c.fecha_evento || '—'}</td>
                <td className="px-4 py-3">{money(c.total)}</td>
                <td className="px-4 py-3">{STATUS_LABEL[c.status]}</td>
                <td className="px-4 py-3">
                  <button onClick={() => verDetalle(c.id)} className="text-sm font-semibold" style={{ color: '#0f3d22' }}>Ver</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
