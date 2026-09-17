import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../lib/api'

export interface MaterialCatalogoItem {
  id: number
  nombre: string
  descripcion: string
  tipo: string
  stock_disponible: number
  foto: string | null
}

interface StagingFoto {
  nombre: string
  url: string
}

type Props = {
  puedeEditar: boolean
  /** pwa = tarjetas móvil; crm = tabla admin */
  variant?: 'pwa' | 'crm'
}

export default function MaterialCatalogoPanel({ puedeEditar, variant = 'pwa' }: Props) {
  const [materiales, setMateriales] = useState<MaterialCatalogoItem[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(false)
  const [todos, setTodos] = useState<MaterialCatalogoItem[]>([])
  const [fotoExpandida, setFotoExpandida] = useState<{ url: string; nombre: string } | null>(null)
  const [materialEditando, setMaterialEditando] = useState<MaterialCatalogoItem | null>(null)
  const [staging, setStaging] = useState<StagingFoto[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [quitandoFondo, setQuitandoFondo] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const inputCamaraRef = useRef<HTMLInputElement>(null)

  const cargarCatalogo = useCallback(() => {
    setLoading(true)
    api.get('/coordinador/catalogo-materiales/')
      .then(res => {
        setMateriales(res.data)
        setTodos(res.data)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    cargarCatalogo()
  }, [cargarCatalogo])

  useEffect(() => {
    if (!busqueda.trim()) {
      setMateriales(todos)
      return
    }
    const q = busqueda.toLowerCase()
    setMateriales(todos.filter(m => m.nombre.toLowerCase().includes(q)))
  }, [busqueda, todos])

  const abrirEditor = (m: MaterialCatalogoItem, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!puedeEditar) return
    setErrorMsg('')
    setMaterialEditando(m)
    api.get('/encargado/materiales-staging/')
      .then(r => setStaging(r.data))
      .catch(() => setStaging([]))
  }

  const actualizarMaterial = (actualizado: MaterialCatalogoItem) => {
    const patch = (list: MaterialCatalogoItem[]) =>
      list.map(x => (x.id === actualizado.id ? actualizado : x))
    setTodos(patch)
    setMateriales(patch)
    setMaterialEditando(prev => (prev?.id === actualizado.id ? actualizado : prev))
  }

  const subirArchivo = async (materialId: number, file: File) => {
    setSubiendo(true)
    try {
      const fd = new FormData()
      fd.append('foto', file)
      const r = await api.post(`/encargado/materiales/${materialId}/foto/`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      actualizarMaterial(r.data)
    } finally {
      setSubiendo(false)
    }
  }

  const asignarStaging = async (materialId: number, stagingFile: string) => {
    setSubiendo(true)
    setErrorMsg('')
    try {
      const r = await api.post(`/encargado/materiales/${materialId}/foto/`, {
        staging_file: stagingFile,
      })
      actualizarMaterial(r.data)
    } finally {
      setSubiendo(false)
    }
  }

  const quitarFondo = async (materialId: number) => {
    setQuitandoFondo(true)
    setErrorMsg('')
    try {
      const r = await api.post(`/encargado/materiales/${materialId}/quitar-fondo/`, null, {
        timeout: 120_000,
      })
      actualizarMaterial(r.data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setErrorMsg(msg || 'No se pudo quitar el fondo.')
    } finally {
      setQuitandoFondo(false)
    }
  }

  const tipoLabel = (tipo: string) =>
    tipo === 'CONSUMIBLE' ? 'Consumible' : tipo === 'REUTILIZABLE' ? 'Reutilizable' : tipo

  const Thumbnail = ({ m }: { m: MaterialCatalogoItem }) => (
    <div className="relative shrink-0" style={{ width: 56, height: 56 }}>
      {m.foto ? (
        <button
          type="button"
          onClick={() => setFotoExpandida({ url: m.foto!, nombre: m.nombre })}
          className="w-full h-full rounded-lg overflow-hidden border border-gray-200 focus:ring-2 focus:ring-green-600"
          title="Ver foto"
        >
          <img src={m.foto} alt="" className="w-full h-full object-cover" />
        </button>
      ) : (
        <div className="w-full h-full rounded-lg bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs">
          Sin foto
        </div>
      )}
      {puedeEditar && (
        <button
          type="button"
          onClick={e => abrirEditor(m, e)}
          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-700 text-white text-[10px] shadow-md flex items-center justify-center"
          title={m.foto ? 'Editar foto' : 'Agregar foto'}
        >
          {m.foto ? '✎' : '+'}
        </button>
      )}
    </div>
  )

  return (
    <>
      {fotoExpandida && (
        <div
          className="fixed inset-0 bg-black/80 z-[60] flex flex-col items-center justify-center p-4"
          onClick={() => setFotoExpandida(null)}
        >
          <img
            src={fotoExpandida.url}
            alt={fotoExpandida.nombre}
            className="max-w-full max-h-[80vh] rounded-xl object-contain"
          />
          <p className="text-white text-sm mt-3 font-medium">{fotoExpandida.nombre}</p>
          <p className="text-gray-400 text-xs mt-1">Clic fuera para cerrar</p>
        </div>
      )}

      {materialEditando && (
        <div
          className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setMaterialEditando(null)}
        >
          <div
            className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-100 flex justify-between items-start gap-2">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Foto del material</p>
                <p className="font-semibold text-gray-900">{materialEditando.nombre}</p>
              </div>
              <button type="button" onClick={() => setMaterialEditando(null)} className="text-gray-400 text-xl px-2">
                ×
              </button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              {materialEditando.foto ? (
                <img
                  src={materialEditando.foto}
                  alt=""
                  className="w-full max-h-48 object-contain rounded-xl bg-white border border-gray-100"
                />
              ) : (
                <div className="h-32 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
                  Sin foto
                </div>
              )}
              <input
                ref={inputCamaraRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) subirArchivo(materialEditando.id, f)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                disabled={subiendo || quitandoFondo}
                onClick={() => inputCamaraRef.current?.click()}
                className="w-full py-3 rounded-xl bg-green-700 text-white font-semibold text-sm disabled:opacity-60"
              >
                {subiendo ? 'Subiendo…' : 'Subir nueva foto (archivo o cámara)'}
              </button>
              {materialEditando.foto && (
                <button
                  type="button"
                  disabled={subiendo || quitandoFondo}
                  onClick={() => quitarFondo(materialEditando.id)}
                  className="w-full py-3 rounded-xl border-2 border-green-700 text-green-800 font-semibold text-sm disabled:opacity-60 bg-white"
                >
                  {quitandoFondo
                    ? 'Quitando fondo… (puede tardar ~30 s)'
                    : '✂️ Quitar fondo → blanco'}
                </button>
              )}
              {errorMsg && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorMsg}</p>
              )}
              {staging.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">
                    Biblioteca en servidor ({staging.length})
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {staging.map(s => (
                      <button
                        key={s.nombre}
                        type="button"
                        disabled={subiendo}
                        onClick={() => asignarStaging(materialEditando.id, s.nombre)}
                        className="aspect-square rounded-lg overflow-hidden border border-gray-200 hover:ring-2 ring-green-600"
                      >
                        <img src={s.url} alt={s.nombre} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={variant === 'crm' ? 'mb-4' : ''}>
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar material…"
          className={
            variant === 'crm'
              ? 'w-full max-w-md border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600'
              : 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600'
          }
        />
        {puedeEditar && variant === 'crm' && (
          <p className="text-xs text-gray-500 mt-2">
            Miniatura: clic para ampliar · ✎ o + para asignar foto (biblioteca o subida nueva).
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Cargando catálogo…</p>
      ) : materiales.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">Sin resultados</p>
      ) : variant === 'crm' ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="p-3 w-20">Foto</th>
                <th className="p-3">Material</th>
                <th className="p-3 hidden sm:table-cell">Tipo</th>
                <th className="p-3 text-right">Stock</th>
              </tr>
            </thead>
            <tbody>
              {materiales.map(m => (
                <tr key={m.id} className="border-t border-gray-100 hover:bg-gray-50/80">
                  <td className="p-3">
                    <Thumbnail m={m} />
                  </td>
                  <td className="p-3">
                    <p className="font-medium text-gray-900">{m.nombre}</p>
                    {m.descripcion && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{m.descripcion}</p>
                    )}
                  </td>
                  <td className="p-3 hidden sm:table-cell text-gray-600">{tipoLabel(m.tipo)}</td>
                  <td className="p-3 text-right font-medium text-green-700">{m.stock_disponible}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {materiales.map(m => (
            <div key={m.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex gap-3">
              <Thumbnail m={m} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{m.nombre}</p>
                {m.descripcion && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{m.descripcion}</p>}
                <p className="text-xs font-semibold text-green-700 mt-2">Stock: {m.stock_disponible}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <p className="text-xs text-gray-400 mt-3 text-center">
          {materiales.length} de {todos.length} materiales
        </p>
      )}
    </>
  )
}
