import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../../lib/api'

type Tipo = 'NORMAL' | 'PROYECTO' | 'RALLY'
type Status = 'BORRADOR' | 'ENVIADA' | 'ACEPTADA' | 'RECHAZADA' | 'CONVERTIDA'

const TIPO_LABEL: Record<Tipo, string> = {
  NORMAL: 'Normal',
  PROYECTO: 'Proyecto',
  RALLY: 'Rally',
}

const PAQUETES_RALLY = [
  {
    titulo: 'Trotavesura acuática',
    descripcion: 'Evento acuático: fiesta de espuma, gladiadores, volei/beis splash, meseros locos, cascos acuáticos, resbalón, patos al agua, guerra de globinos, entre otros.',
  },
  {
    titulo: 'Feria de destreza',
    descripcion: 'Juegos y módulos de feria con premios a ganadores: canicas, tiro al blanco, futbol, tira latas, lotería, aros, ruleta, boliche, entre otros.',
  },
  {
    titulo: 'Rally de retos e integración',
    descripcion: 'Retos y trabajo en equipo: Roller Ball, Rally de colores, Reloj, Cazadores, Canaletas, Papa caliente, catapultas, Código secreto, entre otros.',
  },
  {
    titulo: 'Evento de sensaciones',
    descripcion: 'Actividades con harina, lodo, espuma, gelatina, agua, plumas: guerra de harina, pastelazo, estaciones de sensaciones, chiquero, pista ciega, entre otros.',
  },
  {
    titulo: 'Olimpiadas recreativas',
    descripcion: 'Actividades olímpicas por equipos: carrera de costales, obstáculos, tiro al blanco, quemados, luz verde luz roja, futbol modificado, encestando, entre otros.',
  },
]

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
  es_sugerencia: boolean
}

interface ZonaImagen {
  id: number
  url: string
  pie?: string
}

interface ZonaDraft {
  id?: number
  titulo: string
  descripcion: string
  imagenes: ZonaImagen[]
  pendingFiles: File[]
}

interface ClienteEncontrado {
  id: number
  nombre: string
  telefono: string
  calle_y_numero: string
  colonia: string
  ciudad_o_municipio: string
}

interface ProductoEncontrado {
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
  const [editingId, setEditingId] = useState<number | null>(null)
  const [tipoNueva, setTipoNueva] = useState<Tipo>('NORMAL')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [detalle, setDetalle] = useState<any>(null)
  const [showServicio, setShowServicio] = useState(false)
  const [servicioNombre, setServicioNombre] = useState('')
  const [servicioDesc, setServicioDesc] = useState('')
  const [servicioCant, setServicioCant] = useState('1')
  const [servicioMonto, setServicioMonto] = useState('')
  const [modalConvertir, setModalConvertir] = useState(false)
  const [anticipoConv, setAnticipoConv] = useState('')
  const [metodoPagoConv, setMetodoPagoConv] = useState<'efectivo' | 'transferencia'>('efectivo')
  const [cuentaAnticipoId, setCuentaAnticipoId] = useState<number | ''>('')
  const [cuentas, setCuentas] = useState<{ id: number; nombre: string; banco?: string; tipo: string }[]>([])
  const [convirtiendo, setConvirtiendo] = useState(false)
  const [errorConvertir, setErrorConvertir] = useState('')

  const [clienteId, setClienteId] = useState<number | null>(null)
  const [clienteNuevo, setClienteNuevo] = useState(false)
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [sugerencias, setSugerencias] = useState<ClienteEncontrado[]>([])
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [nombreCliente, setNombreCliente] = useState('')
  const [telefonoCliente, setTelefonoCliente] = useState('')
  const [calleCliente, setCalleCliente] = useState('')
  const [coloniaCliente, setColoniaCliente] = useState('')
  const [ciudadCliente, setCiudadCliente] = useState('')
  const debounceCliente = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  const [queryProducto, setQueryProducto] = useState('')
  const [resultProductos, setResultProductos] = useState<ProductoEncontrado[]>([])
  const [buscandoProducto, setBuscandoProducto] = useState(false)
  const [cantidadProd, setCantidadProd] = useState('1')
  const [modoAgregarRally, setModoAgregarRally] = useState<'sugerido' | 'confirmado'>('sugerido')

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
    if (clienteId || clienteNuevo) return
    const qCliente = busquedaCliente.trim()
    if (qCliente.length < 2) { setSugerencias([]); return }
    if (debounceCliente.current) clearTimeout(debounceCliente.current)
    debounceCliente.current = setTimeout(() => {
      setBuscandoCliente(true)
      api.get('/clientes-buscar/', { params: { q: qCliente } })
        .then(r => setSugerencias(r.data || []))
        .catch(console.error)
        .finally(() => setBuscandoCliente(false))
    }, 300)
    return () => {
      if (debounceCliente.current) clearTimeout(debounceCliente.current)
    }
  }, [busquedaCliente, clienteId, clienteNuevo])

  useEffect(() => {
    const qProd = queryProducto.trim()
    if (qProd.length < 2) { setResultProductos([]); return }
    const t = setTimeout(() => {
      setBuscandoProducto(true)
      api.get('/productos-buscar/', { params: { q: qProd, limit: 20 } })
        .then(r => {
          const lista = (r.data || []).filter((p: ProductoEncontrado) => p.nombre !== 'Proyecto recreativo')
          setResultProductos(lista)
        })
        .catch(console.error)
        .finally(() => setBuscandoProducto(false))
    }, 300)
    return () => clearTimeout(t)
  }, [queryProducto])

  const seleccionarCliente = (c: ClienteEncontrado) => {
    setClienteId(c.id)
    setClienteNuevo(false)
    setNombreCliente(c.nombre)
    setTelefonoCliente(c.telefono || '')
    setCalleCliente(c.calle_y_numero || '')
    setColoniaCliente(c.colonia || '')
    setCiudadCliente(c.ciudad_o_municipio || '')
    setBusquedaCliente('')
    setSugerencias([])
    if (!destinatario) setDestinatario(c.nombre)
  }

  const marcarClienteNuevo = () => {
    setClienteId(null)
    setClienteNuevo(true)
    setSugerencias([])
    setNombreCliente('')
    setTelefonoCliente(busquedaCliente.replace(/[^\d+\s()-]/g, '') || '')
    setCalleCliente('')
    setColoniaCliente('')
    setCiudadCliente('')
  }

  const limpiarCliente = () => {
    setClienteId(null)
    setClienteNuevo(false)
    setNombreCliente('')
    setTelefonoCliente('')
    setCalleCliente('')
    setColoniaCliente('')
    setCiudadCliente('')
    setBusquedaCliente('')
    setSugerencias([])
  }

  const clienteListo = Boolean(
    clienteId || (clienteNuevo && nombreCliente.trim() && telefonoCliente.trim()),
  )

  const subtotalPreview = useMemo(
    () => conceptos.reduce((s, c) => s + (c.es_sugerencia ? 0 : (Number(c.monto) || 0)), 0),
    [conceptos],
  )

  const sugeridosPreview = useMemo(
    () => conceptos.filter(c => c.es_sugerencia),
    [conceptos],
  )

  const resetServicioForm = () => {
    setShowServicio(false)
    setServicioNombre('')
    setServicioDesc('')
    setServicioCant('1')
    setServicioMonto('')
  }

  const abrirNueva = (tipo: Tipo) => {
    setEditingId(null)
    setTipoNueva(tipo)
    setShowForm(true)
    setDetalle(null)
    setError('')
    limpiarCliente()
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
    setZonas(tipo === 'PROYECTO' ? [{ titulo: 'Bienvenida', descripcion: '', imagenes: [], pendingFiles: [] }] : [])
    setQueryProducto('')
    setResultProductos([])
    setCantidadProd(tipo === 'RALLY' ? '6' : '1')
    setModoAgregarRally(tipo === 'RALLY' ? 'sugerido' : 'sugerido')
    resetServicioForm()
  }

  const cargarEnFormulario = (data: any) => {
    setEditingId(data.id)
    setTipoNueva(data.tipo)
    setShowForm(true)
    setDetalle(null)
    setError('')
    setClienteId(data.cliente_id)
    setClienteNuevo(false)
    setNombreCliente(data.cliente_nombre || '')
    setTelefonoCliente('')
    setBusquedaCliente('')
    setSugerencias([])
    setDestinatario(data.destinatario || data.cliente_nombre || '')
    setNombreEvento(data.nombre_evento || '')
    setAsistentes(data.asistentes != null ? String(data.asistentes) : '')
    setSede(data.sede || '')
    setFecha(data.fecha_evento || '')
    setHoraInicio((data.hora_inicio || '').slice(0, 5))
    setHoraFin((data.hora_fin || '').slice(0, 5))
    setAplicarIva(Boolean(data.aplicar_iva))
    setAplicarIsr(Boolean(data.aplicar_isr))
    setConceptos((data.conceptos || []).map((c: any) => ({
      nombre: c.nombre,
      descripcion: c.descripcion || '',
      cantidad: c.cantidad || 1,
      monto: String(c.monto ?? '0'),
      producto_id: c.producto_id ?? null,
      es_sugerencia: Boolean(c.es_sugerencia),
    })))
    setZonas((data.zonas || []).map((z: any) => ({
      id: z.id,
      titulo: z.titulo || '',
      descripcion: z.descripcion || '',
      imagenes: z.imagenes || [],
      pendingFiles: [],
    })))
    setQueryProducto('')
    setResultProductos([])
    setCantidadProd('1')
    setModoAgregarRally('sugerido')
    resetServicioForm()
  }

  const abrirEditar = async (id: number) => {
    try {
      const { data } = await api.get(`/crm/cotizaciones/${id}/`)
      if (data.status === 'CONVERTIDA') {
        alert('No se puede editar una cotización ya convertida a renta.')
        return
      }
      cargarEnFormulario(data)
    } catch (e: any) {
      alert(e?.response?.data?.error || 'No se pudo cargar la cotización')
    }
  }

  const addProducto = (p: ProductoEncontrado) => {
    const cant = Math.max(1, parseInt(cantidadProd || '1', 10))
    const unit = Number(p.precio) || 0
    const esBaseRally = (p.nombre || '').startsWith('Base Rally')
    const esTraslado = (p.nombre || '').toLowerCase().startsWith('traslado')
    // RALLY propuesta: lo agregado en modo "sugerido" no suma al total.
    // Traslado se guarda igual (sin sumar) pero en PDF va en sección propia, no como sugerencia.
    const esSugerencia = tipoNueva === 'RALLY' && modoAgregarRally === 'sugerido'
    let descripcion = ''
    if (esBaseRally) descripcion = 'Precio por base/grupo'
    else if (esTraslado) descripcion = 'Traslado fuera de zona conurbada (cliente)'
    else if (esSugerencia) descripcion = 'Sugerencia (no suma al total)'
    setConceptos(prev => [...prev, {
      nombre: p.nombre,
      descripcion,
      cantidad: cant,
      monto: String((unit * cant).toFixed(2)),
      producto_id: p.id,
      es_sugerencia: esSugerencia,
    }])
    setQueryProducto('')
    setResultProductos([])
  }

  const addConceptoServicio = () => {
    if (!servicioNombre.trim()) return
    const cant = Math.max(1, parseInt(servicioCant || '1', 10))
    setConceptos(prev => [...prev, {
      nombre: servicioNombre.trim(),
      descripcion: servicioDesc.trim(),
      cantidad: cant,
      monto: String(Number(servicioMonto) || 0),
      producto_id: null,
      es_sugerencia: false,
    }])
    resetServicioForm()
  }

  const toggleSugerencia = (idx: number) => {
    setConceptos(arr => arr.map((c, i) => i === idx ? {
      ...c,
      es_sugerencia: !c.es_sugerencia,
      descripcion: !c.es_sugerencia
        ? (c.descripcion || 'Sugerencia (no suma al total)')
        : (c.descripcion === 'Sugerencia (no suma al total)' ? '' : c.descripcion),
    } : c))
  }

  const subirImagenesPendientes = async (cotizacionId: number, zonasGuardadas: any[], drafts: ZonaDraft[]) => {
    const conTitulo = drafts.filter(z => z.titulo.trim())
    for (let i = 0; i < conTitulo.length; i++) {
      const draft = conTitulo[i]
      const saved = zonasGuardadas[i]
      if (!saved?.id || !draft.pendingFiles?.length) continue
      for (const file of draft.pendingFiles) {
        const fd = new FormData()
        fd.append('imagen', file)
        await api.post(
          `/crm/cotizaciones/${cotizacionId}/zonas/${saved.id}/imagenes/`,
          fd,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        )
      }
    }
  }

  const borrarImagenZona = async (zonaIdx: number, imagenId: number) => {
    const zona = zonas[zonaIdx]
    if (zona?.id && editingId) {
      try {
        await api.delete(`/crm/cotizaciones/${editingId}/zonas/${zona.id}/imagenes/${imagenId}/`)
      } catch (e: any) {
        alert(e?.response?.data?.error || 'No se pudo borrar la imagen')
        return
      }
    }
    setZonas(arr => arr.map((z, i) => i === zonaIdx
      ? { ...z, imagenes: z.imagenes.filter(img => img.id !== imagenId) }
      : z))
  }

  const guardar = async () => {
    if (!clienteListo || !fecha) return
    setSaving(true)
    setError('')
    try {
      let idCliente = clienteId
      if (!idCliente && clienteNuevo) {
        const creado = await api.post('/clientes/', {
          nombre: nombreCliente.trim(),
          telefono: telefonoCliente.trim(),
          calle_y_numero: calleCliente.trim(),
          colonia: coloniaCliente.trim(),
          ciudad_o_municipio: ciudadCliente.trim(),
        })
        idCliente = creado.data.id
      }
      if (!idCliente) {
        setError('Selecciona o registra un cliente.')
        return
      }
      const payload = {
        tipo: tipoNueva,
        cliente_id: idCliente,
        destinatario: destinatario || nombreCliente,
        nombre_evento: nombreEvento,
        asistentes: asistentes ? Number(asistentes) : null,
        sede,
        fecha_evento: fecha || null,
        hora_inicio: horaInicio || null,
        hora_fin: horaFin || null,
        aplicar_iva: aplicarIva,
        aplicar_isr: aplicarIsr,
        conceptos: conceptos.map((c, i) => ({ ...c, orden: i })),
        zonas: zonas.map((z, i) => ({
          id: z.id,
          titulo: z.titulo,
          descripcion: z.descripcion,
          orden: i,
        })),
      }
      const { data } = editingId
        ? await api.put(`/crm/cotizaciones/${editingId}/`, payload)
        : await api.post('/crm/cotizaciones/', payload)

      if (tipoNueva === 'PROYECTO') {
        await subirImagenesPendientes(data.id, data.zonas || [], zonas)
        const refreshed = await api.get(`/crm/cotizaciones/${data.id}/`)
        setDetalle(refreshed.data)
      } else {
        setDetalle(data)
      }
      setShowForm(false)
      setEditingId(null)
      fetchList()
    } catch (e: any) {
      const data = e?.response?.data
      setError(data?.error || data?.nombre?.[0] || data?.telefono?.[0] || data?.detail || 'No se pudo guardar')
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

  const abrirConvertir = () => {
    if (!detalle) return
    setAnticipoConv(detalle.tipo === 'RALLY' ? '1000' : '')
    setMetodoPagoConv('efectivo')
    setCuentaAnticipoId('')
    setErrorConvertir('')
    setModalConvertir(true)
  }

  const confirmarConvertir = async () => {
    if (!detalle) return
    const anticipoNum = parseFloat(anticipoConv || '0') || 0
    const totalNum = Number(detalle.total) || 0
    if (anticipoNum < 0) {
      setErrorConvertir('El anticipo no puede ser negativo.')
      return
    }
    if (anticipoNum > totalNum) {
      setErrorConvertir('El anticipo no puede ser mayor al total.')
      return
    }
    if (anticipoNum > 0 && metodoPagoConv === 'transferencia' && !cuentaAnticipoId) {
      setErrorConvertir('Selecciona la cuenta destino del anticipo.')
      return
    }
    setConvirtiendo(true)
    setErrorConvertir('')
    try {
      const payload: Record<string, unknown> = {
        anticipo: anticipoNum,
        metodo_pago: anticipoNum > 0 ? metodoPagoConv : 'efectivo',
      }
      if (anticipoNum > 0 && metodoPagoConv === 'transferencia' && cuentaAnticipoId) {
        payload.cuenta_anticipo_id = cuentaAnticipoId
      }
      const { data } = await api.post(`/crm/cotizaciones/${detalle.id}/convertir/`, payload)
      setModalConvertir(false)
      const saldo = Math.max(0, totalNum - anticipoNum)
      alert(
        anticipoNum > 0
          ? `Convertida a renta ${data.folio}\nAnticipo: ${money(anticipoNum)}\nSaldo: ${money(saldo)}`
          : `Convertida a renta ${data.folio}\nSin anticipo · Saldo: ${money(totalNum)}`,
      )
      verDetalle(detalle.id)
      fetchList()
    } catch (e: any) {
      setErrorConvertir(e?.response?.data?.error || 'Error al convertir')
    } finally {
      setConvirtiendo(false)
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
          <p className="text-sm mt-0.5" style={{ color: '#5a7060' }}>Cotizaciones normales, proyectos y rally por base/grupo</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => abrirNueva('NORMAL')} className="px-3 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: '#16a34a' }}>
            + Normal
          </button>
          <button onClick={() => abrirNueva('PROYECTO')} className="px-3 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: '#0f3d22' }}>
            + Proyecto
          </button>
          <button onClick={() => abrirNueva('RALLY')} className="px-3 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: '#ea580c' }}>
            + Rally
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
          <option value="RALLY">Rally</option>
        </select>
        <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#ddeadd' }}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border p-5 flex flex-col gap-4" style={{ borderColor: '#ddeadd' }}>
          <h2 className="font-semibold" style={{ color: '#162016' }}>
            {editingId ? 'Editar' : 'Nueva'} cotización {tipoNueva.toLowerCase()}
          </h2>
          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex flex-col gap-3">
            <div>
              <div className="text-sm font-medium mb-1" style={{ color: '#162016' }}>Cliente</div>
              {!clienteId && !clienteNuevo && (
                <>
                  <div className="relative">
                    <input
                      value={busquedaCliente}
                      onChange={e => setBusquedaCliente(e.target.value)}
                      placeholder="Buscar por nombre o teléfono…"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      style={{ borderColor: '#ddeadd' }}
                    />
                    {buscandoCliente && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: '#ddeadd', borderTopColor: '#16a34a' }} />
                      </div>
                    )}
                  </div>

                  {sugerencias.length > 0 && (
                    <div className="mt-2 rounded-xl border overflow-hidden" style={{ borderColor: '#ddeadd' }}>
                      {sugerencias.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => seleccionarCliente(c)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                          style={{ borderBottom: '1px solid #f5f8f5' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8fbf8' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs flex-shrink-0" style={{ background: '#16a34a' }}>
                            {(c.nombre[0] || '?').toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate" style={{ color: '#162016' }}>{c.nombre}</div>
                            <div className="text-xs truncate" style={{ color: '#8fa890' }}>{c.telefono}{c.colonia ? ` · ${c.colonia}` : ''}</div>
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: '#dcfce7', color: '#15803d' }}>Seleccionar</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={marcarClienteNuevo}
                        className="w-full px-4 py-3 text-left text-sm transition-colors"
                        style={{ color: '#5a7060' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8fbf8' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        + Registrar como cliente nuevo
                      </button>
                    </div>
                  )}

                  {!buscandoCliente && busquedaCliente.trim().length >= 2 && sugerencias.length === 0 && (
                    <div className="mt-2 rounded-xl border p-4 flex items-center justify-between gap-3" style={{ borderColor: '#ddeadd', background: '#f8fbf8' }}>
                      <span className="text-sm" style={{ color: '#5a7060' }}>No encontramos este cliente.</span>
                      <button
                        type="button"
                        onClick={marcarClienteNuevo}
                        className="text-sm font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                        style={{ background: '#162016', color: 'white' }}
                      >
                        Cliente nuevo
                      </button>
                    </div>
                  )}

                  {busquedaCliente.trim().length < 2 && (
                    <button
                      type="button"
                      onClick={marcarClienteNuevo}
                      className="mt-2 text-sm font-medium"
                      style={{ color: '#0f3d22' }}
                    >
                      + Cliente nuevo
                    </button>
                  )}
                </>
              )}

              {clienteId && (
                <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <svg width="16" height="16" fill="none" stroke="#16a34a" strokeWidth="2.5" viewBox="0 0 24 24" className="flex-shrink-0 mt-0.5"><path d="M20 6L9 17l-5-5"/></svg>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm" style={{ color: '#15803d' }}>{nombreCliente}</div>
                    <div className="text-xs mt-0.5" style={{ color: '#5a7060' }}>
                      {telefonoCliente}
                      {coloniaCliente ? ` · ${coloniaCliente}` : ''}
                    </div>
                  </div>
                  <button type="button" onClick={limpiarCliente} className="text-xs" style={{ color: '#8fa890' }}>Cambiar</button>
                </div>
              )}

              {clienteNuevo && (
                <div className="mt-2 rounded-xl border p-4 flex flex-col gap-3" style={{ borderColor: '#ddeadd' }}>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8fa890' }}>Nuevo cliente</div>
                    <button type="button" onClick={limpiarCliente} className="text-xs" style={{ color: '#8fa890' }}>Cancelar</button>
                  </div>
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <label className="text-sm flex flex-col gap-1">
                      Nombre *
                      <input value={nombreCliente} onChange={e => {
                        setNombreCliente(e.target.value)
                        if (!destinatario || destinatario === nombreCliente) setDestinatario(e.target.value)
                      }} className="border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd' }} placeholder="Nombre completo" />
                    </label>
                    <label className="text-sm flex flex-col gap-1">
                      Teléfono *
                      <input value={telefonoCliente} onChange={e => setTelefonoCliente(e.target.value.replace(/[^\d+\s()-]/g, ''))} className="border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd', fontFamily: 'monospace' }} placeholder="Ej. 6671234567" />
                    </label>
                    <label className="text-sm flex flex-col gap-1">
                      Calle y número
                      <input value={calleCliente} onChange={e => setCalleCliente(e.target.value)} className="border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd' }} />
                    </label>
                    <label className="text-sm flex flex-col gap-1">
                      Colonia
                      <input value={coloniaCliente} onChange={e => setColoniaCliente(e.target.value)} className="border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd' }} />
                    </label>
                    <label className="text-sm flex flex-col gap-1">
                      Ciudad
                      <input value={ciudadCliente} onChange={e => setCiudadCliente(e.target.value)} className="border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd' }} />
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
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
              {tipoNueva === 'RALLY' && (
                <>
                  <label className="text-sm flex flex-col gap-1">
                    Evento
                    <input value={nombreEvento} onChange={e => setNombreEvento(e.target.value)} className="border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd' }} />
                  </label>
                  <label className="text-sm flex flex-col gap-1">
                    Sede
                    <input value={sede} onChange={e => setSede(e.target.value)} className="border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd' }} />
                  </label>
                </>
              )}
            </div>
          </div>

          {tipoNueva === 'PROYECTO' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Zonas narrativas</h3>
                <button
                  type="button"
                  className="text-sm"
                  style={{ color: '#0f3d22' }}
                  onClick={() => setZonas(z => [...z, { titulo: '', descripcion: '', imagenes: [], pendingFiles: [] }])}
                >+ Zona</button>
              </div>
              <div className="flex flex-col gap-3">
                {zonas.map((z, i) => (
                  <div key={z.id || i} className="border rounded-lg p-3 flex flex-col gap-2" style={{ borderColor: '#ddeadd' }}>
                    <div className="flex gap-2">
                      <input
                        value={z.titulo}
                        onChange={e => setZonas(arr => arr.map((x, idx) => idx === i ? { ...x, titulo: e.target.value } : x))}
                        placeholder="Título de la zona"
                        className="border rounded px-2 py-1 text-sm w-full"
                        style={{ borderColor: '#ddeadd' }}
                      />
                      <button
                        type="button"
                        className="text-xs text-red-600 px-2"
                        onClick={() => setZonas(arr => arr.filter((_, idx) => idx !== i))}
                      >Quitar</button>
                    </div>
                    <textarea
                      value={z.descripcion}
                      onChange={e => setZonas(arr => arr.map((x, idx) => idx === i ? { ...x, descripcion: e.target.value } : x))}
                      placeholder="Descripción / narrativa"
                      rows={2}
                      className="border rounded px-2 py-1 text-sm w-full"
                      style={{ borderColor: '#ddeadd' }}
                    />
                    <div>
                      <div className="text-xs font-medium mb-1.5" style={{ color: '#5a7060' }}>Imágenes de referencia (salen en el PDF)</div>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {z.imagenes.map(img => (
                          <div key={img.id} className="relative" style={{ width: 72, height: 72 }}>
                            <img src={img.url} alt="" className="w-full h-full object-cover rounded-md border" style={{ borderColor: '#ddeadd' }} />
                            <button
                              type="button"
                              onClick={() => borrarImagenZona(i, img.id)}
                              className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-white text-xs"
                              style={{ background: '#b91c1c' }}
                            >×</button>
                          </div>
                        ))}
                        {z.pendingFiles.map((file, fi) => (
                          <div key={`p-${fi}`} className="relative" style={{ width: 72, height: 72 }}>
                            <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover rounded-md border" style={{ borderColor: '#86efac' }} />
                            <button
                              type="button"
                              onClick={() => setZonas(arr => arr.map((x, idx) => idx === i
                                ? { ...x, pendingFiles: x.pendingFiles.filter((_, j) => j !== fi) }
                                : x))}
                              className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-white text-xs"
                              style={{ background: '#b91c1c' }}
                            >×</button>
                          </div>
                        ))}
                      </div>
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer" style={{ borderColor: '#ddeadd', color: '#0f3d22' }}>
                        + Adjuntar imagen
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const files = Array.from(e.target.files || [])
                            if (!files.length) return
                            setZonas(arr => arr.map((x, idx) => {
                              if (idx !== i) return x
                              const total = x.imagenes.length + x.pendingFiles.length + files.length
                              if (total > 6) {
                                alert('Máximo 6 imágenes por zona')
                                return x
                              }
                              return { ...x, pendingFiles: [...x.pendingFiles, ...files] }
                            }))
                            e.target.value = ''
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tipoNueva === 'RALLY' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Paquetes / actividades</h3>
                <button
                  type="button"
                  className="text-sm"
                  style={{ color: '#0f3d22' }}
                  onClick={() => setZonas(z => [...z, { titulo: '', descripcion: '', imagenes: [], pendingFiles: [] }])}
                >+ Paquete libre</button>
              </div>
              <p className="text-xs mb-2" style={{ color: '#5a7060' }}>
                Texto del PDF. El cobro va en Base Rally × bases (+ brincolines/traslado del catálogo).
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {PAQUETES_RALLY.map(p => (
                  <button
                    key={p.titulo}
                    type="button"
                    className="text-xs px-2.5 py-1.5 rounded-lg border"
                    style={{ borderColor: '#fdba74', color: '#c2410c', background: '#fff7ed' }}
                    onClick={() => setZonas(z => [...z, { titulo: p.titulo, descripcion: p.descripcion, imagenes: [], pendingFiles: [] }])}
                  >+ {p.titulo}</button>
                ))}
              </div>
              <div className="flex flex-col gap-3">
                {zonas.map((z, i) => (
                  <div key={z.id || i} className="border rounded-lg p-3 flex flex-col gap-2" style={{ borderColor: '#ddeadd' }}>
                    <div className="flex gap-2">
                      <input
                        value={z.titulo}
                        onChange={e => setZonas(arr => arr.map((x, idx) => idx === i ? { ...x, titulo: e.target.value } : x))}
                        placeholder="Título del paquete"
                        className="border rounded px-2 py-1 text-sm w-full"
                        style={{ borderColor: '#ddeadd' }}
                      />
                      <button
                        type="button"
                        className="text-xs text-red-600 px-2"
                        onClick={() => setZonas(arr => arr.filter((_, idx) => idx !== i))}
                      >Quitar</button>
                    </div>
                    <textarea
                      value={z.descripcion}
                      onChange={e => setZonas(arr => arr.map((x, idx) => idx === i ? { ...x, descripcion: e.target.value } : x))}
                      placeholder="Descripción / actividades"
                      rows={2}
                      className="border rounded px-2 py-1 text-sm w-full"
                      style={{ borderColor: '#ddeadd' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold mb-2">
              {tipoNueva === 'RALLY' ? 'Productos de la propuesta' : 'Conceptos'}
            </h3>
            {tipoNueva === 'RALLY' && (
              <div className="mb-3">
                <p className="text-xs mb-2" style={{ color: '#5a7060' }}>
                  La propuesta se envía <strong>sin total fijo</strong>. Los brincolines van como
                  sugerencia (no suman). Antes de convertir a renta, cambia a
                  <strong> cobro confirmado</strong> y agrega Base Rally × bases + lo elegido.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setModoAgregarRally('sugerido'); setCantidadProd('1') }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
                    style={{
                      borderColor: modoAgregarRally === 'sugerido' ? '#ea580c' : '#ddeadd',
                      background: modoAgregarRally === 'sugerido' ? '#fff7ed' : 'white',
                      color: modoAgregarRally === 'sugerido' ? '#c2410c' : '#5a7060',
                    }}
                  >Agregar como sugerencia</button>
                  <button
                    type="button"
                    onClick={() => { setModoAgregarRally('confirmado'); setCantidadProd('6') }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
                    style={{
                      borderColor: modoAgregarRally === 'confirmado' ? '#16a34a' : '#ddeadd',
                      background: modoAgregarRally === 'confirmado' ? '#f0fdf4' : 'white',
                      color: modoAgregarRally === 'confirmado' ? '#15803d' : '#5a7060',
                    }}
                  >Agregar a cobro confirmado</button>
                </div>
              </div>
            )}
            <div className="flex gap-2 flex-wrap items-start mb-3">
              <div className="relative flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 border rounded-lg px-3 py-2" style={{ borderColor: '#ddeadd' }}>
                  <svg width="13" height="13" fill="none" stroke="#8fa890" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    value={queryProducto}
                    onChange={e => setQueryProducto(e.target.value)}
                    placeholder={tipoNueva === 'RALLY' ? 'Buscar Base Rally, traslado, brincolín…' : 'Buscar producto del catálogo…'}
                    className="flex-1 text-sm outline-none"
                    style={{ color: '#162016' }}
                  />
                  {buscandoProducto && (
                    <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin flex-shrink-0" style={{ borderColor: '#ddeadd', borderTopColor: '#16a34a' }} />
                  )}
                </div>
                {resultProductos.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border shadow-lg z-10 overflow-hidden" style={{ borderColor: '#ddeadd' }}>
                    {resultProductos.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProducto(p)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors"
                        style={{ borderBottom: '1px solid #f5f8f5' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8fbf8' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        <span style={{ color: '#162016' }}>{p.nombre}</span>
                        <span className="font-semibold tabular-nums flex-shrink-0" style={{ color: '#5a7060', fontSize: 12 }}>{money(p.precio)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {!buscandoProducto && queryProducto.trim().length >= 2 && resultProductos.length === 0 && (
                  <div className="mt-2 text-xs" style={{ color: '#8fa890' }}>Sin productos para “{queryProducto.trim()}”.</div>
                )}
              </div>
              <input
                type="number"
                min={1}
                value={cantidadProd}
                onChange={e => setCantidadProd(e.target.value)}
                title={tipoNueva === 'RALLY' ? 'Cantidad (bases si es Base Rally)' : 'Cantidad al agregar del catálogo'}
                className="border rounded-lg px-3 py-2 text-sm w-20"
                style={{ borderColor: '#ddeadd' }}
              />
              {tipoNueva !== 'RALLY' && (
              <button
                type="button"
                onClick={() => setShowServicio(s => !s)}
                className="px-3 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: '#0f3d22' }}
              >+ Servicio</button>
              )}
            </div>

            {showServicio && (
              <div className="mb-3 rounded-xl border p-3 flex flex-col gap-2" style={{ borderColor: '#bbf7d0', background: '#f0fdf4' }}>
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#15803d' }}>
                  Servicio / subcontrato (no está en catálogo)
                </div>
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                  <input value={servicioNombre} onChange={e => setServicioNombre(e.target.value)} placeholder="Nombre del servicio *" className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#ddeadd' }} />
                  <input value={servicioDesc} onChange={e => setServicioDesc(e.target.value)} placeholder="Descripción (opcional)" className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#ddeadd' }} />
                  <input type="number" min={1} value={servicioCant} onChange={e => setServicioCant(e.target.value)} placeholder="Cant." className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#ddeadd' }} />
                  <input type="number" step="0.01" value={servicioMonto} onChange={e => setServicioMonto(e.target.value)} placeholder="Monto $" className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#ddeadd' }} />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={addConceptoServicio} disabled={!servicioNombre.trim()} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#16a34a' }}>Agregar servicio</button>
                  <button type="button" onClick={resetServicioForm} className="px-3 py-1.5 rounded-lg text-sm border" style={{ borderColor: '#ddeadd' }}>Cancelar</button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {conceptos.map((c, i) => (
                <div key={i} className="flex gap-2 flex-wrap items-center text-sm">
                  <input value={c.nombre} onChange={e => setConceptos(arr => arr.map((x, idx) => idx === i ? { ...x, nombre: e.target.value } : x))} className="border rounded px-2 py-1 flex-1 min-w-[160px]" style={{ borderColor: '#ddeadd' }} />
                  {!c.producto_id && (
                    <input value={c.descripcion} onChange={e => setConceptos(arr => arr.map((x, idx) => idx === i ? { ...x, descripcion: e.target.value } : x))} placeholder="Nota" className="border rounded px-2 py-1 flex-1 min-w-[120px]" style={{ borderColor: '#ddeadd' }} />
                  )}
                  <input type="number" value={c.cantidad} onChange={e => setConceptos(arr => arr.map((x, idx) => idx === i ? { ...x, cantidad: Number(e.target.value) || 1 } : x))} className="border rounded px-2 py-1 w-16" style={{ borderColor: '#ddeadd' }} />
                  <input type="number" step="0.01" value={c.monto} onChange={e => setConceptos(arr => arr.map((x, idx) => idx === i ? { ...x, monto: e.target.value } : x))} className="border rounded px-2 py-1 w-28" style={{ borderColor: '#ddeadd' }} />
                  {tipoNueva === 'RALLY' ? (
                    <button
                      type="button"
                      onClick={() => toggleSugerencia(i)}
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: (c.nombre || '').toLowerCase().startsWith('traslado')
                          ? '#e0e7ff'
                          : c.es_sugerencia ? '#ffedd5' : '#dcfce7',
                        color: (c.nombre || '').toLowerCase().startsWith('traslado')
                          ? '#3730a3'
                          : c.es_sugerencia ? '#c2410c' : '#15803d',
                      }}
                      title="Clic para alternar sugerencia / cobro"
                    >
                      {(c.nombre || '').toLowerCase().startsWith('traslado')
                        ? (c.es_sugerencia ? 'Traslado' : 'Traslado ✓')
                        : (c.es_sugerencia ? 'Sugerido' : 'Confirmado')}
                    </button>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: c.producto_id ? '#dcfce7' : '#fef3c7', color: c.producto_id ? '#15803d' : '#b45309' }}>
                      {c.producto_id ? 'Catálogo' : 'Servicio'}
                    </span>
                  )}
                  <button type="button" onClick={() => setConceptos(arr => arr.filter((_, idx) => idx !== i))} className="text-red-600">Quitar</button>
                </div>
              ))}
            </div>
            <p className="text-sm mt-2" style={{ color: '#5a7060' }}>
              {tipoNueva === 'RALLY' ? (
                <>
                  Sugeridos: <strong>{sugeridosPreview.length}</strong>
                  {' · '}
                  Cobro confirmado: <strong>{money(subtotalPreview)}</strong>
                  {subtotalPreview <= 0 && <span className="ml-1 text-xs">(propuesta sin total)</span>}
                </>
              ) : (
                <>Subtotal: <strong>{money(subtotalPreview)}</strong></>
              )}
            </p>
          </div>

          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={aplicarIva} onChange={e => setAplicarIva(e.target.checked)} /> IVA 16%</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={aplicarIsr} onChange={e => setAplicarIsr(e.target.checked)} /> ISR 1.25%</label>
          </div>

          <div className="flex gap-2">
            <button disabled={saving || !clienteListo || !fecha} onClick={guardar} className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50" style={{ background: '#16a34a' }}>
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Guardar'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null) }} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: '#ddeadd' }}>Cancelar</button>
          </div>
        </div>
      )}

      {detalle && !showForm && (
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#ddeadd' }}>
          <div className="flex justify-between gap-3 flex-wrap mb-3">
            <div>
              <h2 className="font-semibold" style={{ color: '#162016' }}>{detalle.folio} — {detalle.cliente_nombre}</h2>
              <p className="text-sm" style={{ color: '#5a7060' }}>{TIPO_LABEL[detalle.tipo as Tipo] || detalle.tipo} · {STATUS_LABEL[detalle.status as Status]} · Total {money(detalle.total)}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {detalle.status !== 'CONVERTIDA' && (
                <button onClick={() => abrirEditar(detalle.id)} className="px-3 py-1.5 rounded-lg text-sm text-white" style={{ background: '#16a34a' }}>Editar</button>
              )}
              <button onClick={abrirPdf} className="px-3 py-1.5 rounded-lg text-sm text-white" style={{ background: '#7c3aed' }}>PDF</button>
              {detalle.status !== 'CONVERTIDA' && (
                <button onClick={abrirConvertir} className="px-3 py-1.5 rounded-lg text-sm text-white" style={{ background: '#ea580c' }}>Convertir a renta</button>
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

      {modalConvertir && detalle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={e => { if (e.target === e.currentTarget && !convirtiendo) setModalConvertir(false) }}
        >
          <div className="bg-white rounded-2xl border w-full max-w-md p-5 flex flex-col gap-4" style={{ borderColor: '#ddeadd' }}>
            <div>
              <h3 className="font-bold" style={{ fontSize: 16, color: '#162016' }}>Convertir a renta</h3>
              <p className="text-sm mt-1" style={{ color: '#5a7060' }}>
                {detalle.folio} · {detalle.cliente_nombre}
              </p>
            </div>

            <div className="rounded-xl border p-3 flex flex-col gap-1" style={{ borderColor: '#ddeadd', background: '#f8fbf8' }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: '#5a7060' }}>Total cotización</span>
                <strong style={{ color: '#162016' }}>{money(detalle.total)}</strong>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: '#5a7060' }}>Saldo estimado</span>
                <strong style={{ color: '#162016' }}>
                  {money(Math.max(0, (Number(detalle.total) || 0) - (parseFloat(anticipoConv || '0') || 0)))}
                </strong>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#5a7060' }}>
                ¿Hubo anticipo?
              </label>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => { setAnticipoConv(''); setMetodoPagoConv('efectivo'); setCuentaAnticipoId('') }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium border"
                  style={{
                    borderColor: !(parseFloat(anticipoConv || '0') > 0) ? '#16a34a' : '#ddeadd',
                    borderWidth: !(parseFloat(anticipoConv || '0') > 0) ? 2 : 1,
                    background: !(parseFloat(anticipoConv || '0') > 0) ? '#f0fdf4' : 'white',
                    color: !(parseFloat(anticipoConv || '0') > 0) ? '#15803d' : '#5a7060',
                  }}
                >
                  Sin anticipo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!(parseFloat(anticipoConv || '0') > 0)) {
                      const mitad = ((Number(detalle.total) || 0) / 2).toFixed(2)
                      setAnticipoConv(mitad)
                    }
                  }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium border"
                  style={{
                    borderColor: parseFloat(anticipoConv || '0') > 0 ? '#16a34a' : '#ddeadd',
                    borderWidth: parseFloat(anticipoConv || '0') > 0 ? 2 : 1,
                    background: parseFloat(anticipoConv || '0') > 0 ? '#f0fdf4' : 'white',
                    color: parseFloat(anticipoConv || '0') > 0 ? '#15803d' : '#5a7060',
                  }}
                >
                  Sí, registrar
                </button>
              </div>
            </div>

            {parseFloat(anticipoConv || '0') > 0 && (
              <>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#5a7060' }}>Monto del anticipo</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={anticipoConv}
                    onChange={e => setAnticipoConv(e.target.value)}
                    className="mt-1.5 w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                    style={{ borderColor: '#ddeadd', color: '#162016' }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="text-xs mt-1 font-medium"
                    style={{ color: '#0f3d22' }}
                    onClick={() => setAnticipoConv(((Number(detalle.total) || 0) / 2).toFixed(2))}
                  >
                    Usar 50% ({money((Number(detalle.total) || 0) / 2)})
                  </button>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#5a7060' }}>Método de pago</label>
                  <div className="flex gap-2 mt-1.5">
                    {(['efectivo', 'transferencia'] as const).map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setMetodoPagoConv(v)
                          if (v === 'transferencia' && cuentas.length === 0) {
                            api.get('/cuentas/').then(r => setCuentas(r.data)).catch(console.error)
                          }
                        }}
                        className="flex-1 py-2 rounded-lg text-sm font-medium border capitalize"
                        style={{
                          borderColor: metodoPagoConv === v ? '#16a34a' : '#ddeadd',
                          borderWidth: metodoPagoConv === v ? 2 : 1,
                          background: metodoPagoConv === v ? '#f0fdf4' : 'white',
                          color: metodoPagoConv === v ? '#15803d' : '#5a7060',
                        }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {metodoPagoConv === 'transferencia' && (
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#5a7060' }}>Cuenta destino</label>
                    <div className="flex flex-col gap-1.5 mt-1.5">
                      {cuentas.filter(c => c.tipo.toLowerCase() !== 'efectivo').map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCuentaAnticipoId(c.id)}
                          className="text-left px-3 py-2 rounded-lg border text-sm"
                          style={{
                            borderColor: cuentaAnticipoId === c.id ? '#16a34a' : '#ddeadd',
                            borderWidth: cuentaAnticipoId === c.id ? 2 : 1,
                            background: cuentaAnticipoId === c.id ? '#f0fdf4' : 'white',
                            color: '#162016',
                          }}
                        >
                          {c.nombre}{c.banco ? ` · ${c.banco}` : ''}
                        </button>
                      ))}
                      {cuentas.length === 0 && <div className="text-sm" style={{ color: '#8fa890' }}>Cargando cuentas…</div>}
                    </div>
                  </div>
                )}
              </>
            )}

            {errorConvertir && (
              <div className="rounded-lg px-3 py-2 text-sm" style={{ background: '#fee2e2', color: '#b91c1c' }}>{errorConvertir}</div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={convirtiendo}
                onClick={() => setModalConvertir(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={convirtiendo}
                onClick={confirmarConvertir}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: '#ea580c' }}
              >
                {convirtiendo ? 'Convirtiendo…' : 'Crear renta'}
              </button>
            </div>
          </div>
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
                <td className="px-4 py-3">{TIPO_LABEL[c.tipo] || c.tipo}</td>
                <td className="px-4 py-3">{c.cliente_nombre}</td>
                <td className="px-4 py-3">{c.fecha_evento || '—'}</td>
                <td className="px-4 py-3">
                  {c.tipo === 'RALLY' && Number(c.total) <= 0 ? 'Propuesta' : money(c.total)}
                </td>
                <td className="px-4 py-3">{STATUS_LABEL[c.status]}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <button onClick={() => verDetalle(c.id)} className="text-sm font-semibold" style={{ color: '#0f3d22' }}>Ver</button>
                    {c.status !== 'CONVERTIDA' && (
                      <button onClick={() => abrirEditar(c.id)} className="text-sm font-semibold" style={{ color: '#16a34a' }}>Editar</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
