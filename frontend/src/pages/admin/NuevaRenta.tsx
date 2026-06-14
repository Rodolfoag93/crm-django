import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'

interface Cliente {
  id: number
  nombre: string
  telefono: string
  calle_y_numero: string
  colonia: string
  ciudad_o_municipio: string
}

interface Producto {
  id: number
  nombre: string
  precio: number
  tipo: string
}

interface ProductoSeleccionado extends Producto {
  cantidad: number
  precio_unitario: number
}

export default function NuevaRenta() {
  const navigate = useNavigate()

  // Cliente
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [clientesSugeridos, setClientesSugeridos] = useState<Cliente[]>([])
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [clienteNuevo, setClienteNuevo] = useState(false)
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [clienteDireccion, setClienteDireccion] = useState('')
  const [clienteColonia, setClienteColonia] = useState('')
  const [clienteCiudad, setClienteCiudad] = useState('')

  // Renta
  const [fechaRenta, setFechaRenta] = useState(new Date().toISOString().split('T')[0])
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFin, setHoraFin] = useState('')
  const [calleNumero, setCalleNumero] = useState('')
  const [colonia, setColonia] = useState('')
  const [ciudad, setCiudad] = useState('')

  // Productos
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [productosSugeridos, setProductosSugeridos] = useState<Producto[]>([])
  const [productosSeleccionados, setProductosSeleccionados] = useState<ProductoSeleccionado[]>([])

  // Pago
  const [precioTotal, setPrecioTotal] = useState('')
  const [anticipo, setAnticipo] = useState('')
  const [metodoPago, setMetodoPago] = useState('EFECTIVO')
  const [pagado, setPagado] = useState(false)
  const [notas, setNotas] = useState('')

  // Estado
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  // Buscar clientes
  useEffect(() => {
    if (busquedaCliente.length < 2) { setClientesSugeridos([]); return }
    const timer = setTimeout(async () => {
      const res = await api.get(`/clientes/buscar/?q=${busquedaCliente}`)
      setClientesSugeridos(res.data)
    }, 300)
    return () => clearTimeout(timer)
  }, [busquedaCliente])

  // Buscar productos
  useEffect(() => {
    if (busquedaProducto.length < 2) { setProductosSugeridos([]); return }
    const timer = setTimeout(async () => {
      const res = await api.get(`/productos/buscar/?q=${busquedaProducto}`)
      setProductosSugeridos(res.data)
    }, 300)
    return () => clearTimeout(timer)
  }, [busquedaProducto])

  // Total calculado
  const totalCalculado = productosSeleccionados.reduce(
    (sum, p) => sum + p.precio_unitario * p.cantidad, 0
  )

  const seleccionarCliente = (c: Cliente) => {
    setClienteSeleccionado(c)
    setBusquedaCliente(c.nombre)
    setClientesSugeridos([])
    setCalleNumero(c.calle_y_numero)
    setColonia(c.colonia)
    setCiudad(c.ciudad_o_municipio)
  }

  const agregarProducto = (p: Producto) => {
    const existe = productosSeleccionados.find(ps => ps.id === p.id)
    if (existe) {
      setProductosSeleccionados(prev =>
        prev.map(ps => ps.id === p.id ? { ...ps, cantidad: ps.cantidad + 1 } : ps)
      )
    } else {
      setProductosSeleccionados(prev => [...prev, { ...p, cantidad: 1, precio_unitario: p.precio }])
    }
    setBusquedaProducto('')
    setProductosSugeridos([])
  }

  const quitarProducto = (id: number) => {
    setProductosSeleccionados(prev => prev.filter(p => p.id !== id))
  }

  const guardar = async () => {
    if (!fechaRenta) { setError('La fecha es requerida.'); return }
    if (!clienteSeleccionado && !clienteNuevo) { setError('Selecciona o crea un cliente.'); return }
    if (clienteNuevo && !clienteNombre) { setError('El nombre del cliente es requerido.'); return }
    if (productosSeleccionados.length === 0) { setError('Agrega al menos un producto.'); return }

    setGuardando(true)
    setError('')

    try {
      const body: any = {
        fecha_renta: fechaRenta,
        hora_inicio: horaInicio || null,
        hora_fin: horaFin || null,
        calle_y_numero: calleNumero,
        colonia: colonia,
        ciudad_o_municipio: ciudad,
        precio_total: precioTotal || null,
        anticipo: anticipo || 0,
        metodo_pago: metodoPago,
        pagado,
        notas,
        productos: productosSeleccionados.map(p => ({
          id: p.id,
          cantidad: p.cantidad,
          precio_unitario: p.precio_unitario,
        })),
      }

      if (clienteSeleccionado) {
        body.cliente_id = clienteSeleccionado.id
      } else {
        body.cliente_nombre = clienteNombre
        body.cliente_telefono = clienteTelefono
        body.cliente_direccion = clienteDireccion
        body.cliente_colonia = clienteColonia
        body.cliente_ciudad = clienteCiudad
      }

      const res = await api.post('/nueva-renta/', body)
      if (res.data.ok) {
        navigate('/admin/rentas')
      }
    } catch (e: any) {
      setError(e.response?.data?.error || 'Error al crear la renta.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button onClick={() => navigate('/home')} className="text-green-300 text-xl">←</button>
        <h1 className="text-xl font-bold">➕ Nueva renta</h1>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4">

        {/* Cliente */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-700 mb-3">👤 Cliente</h2>

          {!clienteNuevo ? (
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar cliente por nombre..."
                value={busquedaCliente}
                onChange={e => { setBusquedaCliente(e.target.value); setClienteSeleccionado(null) }}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              />
              {clientesSugeridos.length > 0 && (
                <div className="absolute z-10 w-full bg-white border rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {clientesSugeridos.map(c => (
                    <div
                      key={c.id}
                      onClick={() => seleccionarCliente(c)}
                      className="px-4 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <p className="font-medium text-sm">{c.nombre}</p>
                      <p className="text-xs text-gray-400">{c.telefono}</p>
                    </div>
                  ))}
                </div>
              )}
              {clienteSeleccionado && (
                <div className="mt-2 bg-green-50 rounded-xl p-3">
                  <p className="font-medium text-sm text-green-800">{clienteSeleccionado.nombre}</p>
                  <p className="text-xs text-green-600">{clienteSeleccionado.telefono}</p>
                </div>
              )}
              <button
                onClick={() => setClienteNuevo(true)}
                className="mt-2 text-xs text-blue-600 underline"
              >
                + Crear cliente nuevo
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input type="text" placeholder="Nombre *" value={clienteNombre}
                onChange={e => setClienteNombre(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input type="tel" placeholder="Teléfono" value={clienteTelefono}
                onChange={e => setClienteTelefono(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input type="text" placeholder="Calle y número" value={clienteDireccion}
                onChange={e => setClienteDireccion(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input type="text" placeholder="Colonia" value={clienteColonia}
                onChange={e => setClienteColonia(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input type="text" placeholder="Ciudad" value={clienteCiudad}
                onChange={e => setClienteCiudad(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm" />
              <button
                onClick={() => { setClienteNuevo(false); setBusquedaCliente('') }}
                className="text-xs text-blue-600 underline text-left"
              >
                ← Buscar cliente existente
              </button>
            </div>
          )}
        </div>

        {/* Fecha y horario */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-700 mb-3">📅 Fecha y horario</h2>
          <div className="flex flex-col gap-2">
            <input type="date" value={fechaRenta}
              onChange={e => setFechaRenta(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-1">Hora inicio</p>
                <input type="time" value={horaInicio}
                  onChange={e => setHoraInicio(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-sm" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-1">Hora fin</p>
                <input type="time" value={horaFin}
                  onChange={e => setHoraFin(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>
          </div>
        </div>

        {/* Dirección del evento */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-700 mb-3">📍 Dirección del evento</h2>
          <div className="flex flex-col gap-2">
            <input type="text" placeholder="Calle y número" value={calleNumero}
              onChange={e => setCalleNumero(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" />
            <input type="text" placeholder="Colonia" value={colonia}
              onChange={e => setColonia(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" />
            <input type="text" placeholder="Ciudad" value={ciudad}
              onChange={e => setCiudad(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" />
          </div>
        </div>

        {/* Productos */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-700 mb-3">📦 Productos</h2>
          <div className="relative mb-3">
            <input
              type="text"
              placeholder="Buscar producto..."
              value={busquedaProducto}
              onChange={e => setBusquedaProducto(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            {productosSugeridos.length > 0 && (
              <div className="absolute z-10 w-full bg-white border rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                {productosSugeridos.map(p => (
                  <div
                    key={p.id}
                    onClick={() => agregarProducto(p)}
                    className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex justify-between"
                  >
                    <p className="text-sm">{p.nombre}</p>
                    <p className="text-xs text-gray-400">${p.precio}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {productosSeleccionados.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-3">Sin productos agregados</p>
          ) : (
            <div className="flex flex-col gap-2">
              {productosSeleccionados.map(p => (
                <div key={p.id} className="bg-gray-50 rounded-xl p-3">
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-medium text-sm">{p.nombre}</p>
                    <button onClick={() => quitarProducto(p.id)} className="text-red-400 text-xs">✕</button>
                  </div>
                  <div className="flex gap-3 items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Cant:</span>
                      <input
                        type="number"
                        min={1}
                        value={p.cantidad}
                        onChange={e => setProductosSeleccionados(prev =>
                          prev.map(ps => ps.id === p.id ? { ...ps, cantidad: Number(e.target.value) } : ps)
                        )}
                        className="w-16 border rounded-lg px-2 py-1 text-sm text-center"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Precio:</span>
                      <input
                        type="number"
                        value={p.precio_unitario}
                        onChange={e => setProductosSeleccionados(prev =>
                          prev.map(ps => ps.id === p.id ? { ...ps, precio_unitario: Number(e.target.value) } : ps)
                        )}
                        className="w-24 border rounded-lg px-2 py-1 text-sm text-center"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div className="text-right text-sm font-semibold text-gray-700 mt-1">
                Total calculado: ${totalCalculado.toLocaleString('es-MX')}
              </div>
            </div>
          )}
        </div>

        {/* Pago */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-700 mb-3">💰 Pago</h2>
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-xs text-gray-500 mb-1">Precio total (dejar vacío para usar total calculado)</p>
              <input type="number" placeholder={`${totalCalculado}`} value={precioTotal}
                onChange={e => setPrecioTotal(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Anticipo</p>
              <input type="number" placeholder="0" value={anticipo}
                onChange={e => setAnticipo(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Método de pago</p>
              <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm">
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="TARJETA">Tarjeta</option>
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={pagado} onChange={e => setPagado(e.target.checked)} />
              <span className="text-sm">Pagado completo</span>
            </label>
          </div>
        </div>

        {/* Notas */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-700 mb-3">📝 Notas</h2>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm"
            rows={3}
            placeholder="Instrucciones especiales..."
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <button
          onClick={guardar}
          disabled={guardando}
          className="w-full bg-green-700 text-white py-4 rounded-2xl font-semibold text-sm disabled:opacity-50"
        >
          {guardando ? 'Creando renta...' : '✅ Crear renta'}
        </button>
      </div>
    </div>
  )
}