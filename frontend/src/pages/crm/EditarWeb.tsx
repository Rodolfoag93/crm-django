import { useCallback, useEffect, useState } from 'react'
import api from '../../lib/api'

type TabId =
  | 'contacto'
  | 'hero'
  | 'servicios'
  | 'paquetes'
  | 'nosotros'
  | 'faq'
  | 'imagenes'

type SitioDatos = Record<string, unknown>

type Payload = {
  datos: SitioDatos
  imagenes: Record<string, string | null>
  media_labels: Record<string, string>
  actualizado_en?: string | null
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'contacto', label: 'Contacto' },
  { id: 'hero', label: 'Hero' },
  { id: 'servicios', label: 'Servicios' },
  { id: 'paquetes', label: 'Paquetes' },
  { id: 'nosotros', label: 'Nosotros' },
  { id: 'faq', label: 'FAQ' },
  { id: 'imagenes', label: 'Imágenes' },
]

const SITE_URL = 'https://trotacrm.com'

function deepGet(obj: SitioDatos, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

function deepSet(obj: SitioDatos, path: string, value: unknown): SitioDatos {
  const parts = path.split('.')
  const next = structuredClone(obj)
  let cur: Record<string, unknown> = next as Record<string, unknown>
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]
    if (!(k in cur) || typeof cur[k] !== 'object' || cur[k] === null) {
      cur[k] = {}
    }
    cur = cur[k] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]] = value
  return next
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: '#5a7060', letterSpacing: '0.3px' }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  multiline,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  placeholder?: string
}) {
  const style = {
    borderColor: '#ddeadd',
    color: '#162016',
  } as const
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder={placeholder}
        className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none resize-y"
        style={style}
      />
    )
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
      style={style}
    />
  )
}

export default function EditarWeb() {
  const [tab, setTab] = useState<TabId>('contacto')
  const [payload, setPayload] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  )
  const [uploading, setUploading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/crm/sitio-web/')
      setPayload(r.data)
    } catch {
      setMsg({ type: 'err', text: 'No se pudo cargar el contenido.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const datos = (payload?.datos || {}) as SitioDatos

  const setPath = (path: string, value: unknown) => {
    setPayload((prev) => {
      if (!prev) return prev
      return { ...prev, datos: deepSet(prev.datos, path, value) }
    })
  }

  const str = (path: string) => String(deepGet(datos, path) ?? '')

  const guardar = async () => {
    if (!payload) return
    setSaving(true)
    setMsg(null)
    try {
      const r = await api.put('/crm/sitio-web/', { datos: payload.datos })
      setPayload(r.data)
      setMsg({ type: 'ok', text: 'Cambios guardados. Ya se ven en el sitio público.' })
    } catch {
      setMsg({ type: 'err', text: 'Error al guardar. Intenta de nuevo.' })
    } finally {
      setSaving(false)
    }
  }

  const uploadImagen = async (clave: string, file: File) => {
    setUploading(clave)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append('clave', clave)
      fd.append('imagen', file)
      const r = await api.post('/crm/sitio-web/imagenes/', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPayload(r.data)
      setMsg({ type: 'ok', text: 'Imagen actualizada.' })
    } catch {
      setMsg({ type: 'err', text: 'No se pudo subir la imagen.' })
    } finally {
      setUploading(null)
    }
  }

  const borrarImagen = async (clave: string) => {
    if (!confirm('¿Quitar esta imagen?')) return
    try {
      const r = await api.delete(`/crm/sitio-web/imagenes/${clave}/`)
      setPayload(r.data)
      setMsg({ type: 'ok', text: 'Imagen eliminada.' })
    } catch {
      setMsg({ type: 'err', text: 'No se pudo eliminar.' })
    }
  }

  if (loading || !payload) {
    return (
      <div className="p-6 text-sm" style={{ color: '#5a7060' }}>
        Cargando editor…
      </div>
    )
  }

  const servicios = (deepGet(datos, 'servicios') as Array<Record<string, string>>) || []
  const paquetes = (deepGet(datos, 'paquetes') as Array<Record<string, unknown>>) || []
  const faq = (deepGet(datos, 'faq') as Array<{ q: string; a: string }>) || []
  const garantias = (deepGet(datos, 'hero.garantias') as string[]) || []
  const nosotrosStats =
    (deepGet(datos, 'nosotros.stats') as Array<{ valor: string; etiqueta: string }>) ||
    []
  const seguridadItems =
    (deepGet(datos, 'seguridad.items') as Array<{ title: string; blurb: string }>) ||
    []

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="font-bold"
            style={{ fontSize: 20, letterSpacing: '-0.4px', color: '#162016' }}
          >
            Editar web
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#5a7060' }}>
            Textos e imágenes del sitio público. No necesitas saber programar.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a
            href={SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium px-4 py-2 rounded-lg border"
            style={{ borderColor: '#ddeadd', color: '#162016' }}
          >
            Ver sitio público ↗
          </a>
          {tab !== 'imagenes' && (
            <button
              type="button"
              onClick={guardar}
              disabled={saving}
              className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60"
              style={{ background: '#16a34a', color: 'white' }}
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            background: msg.type === 'ok' ? '#dcfce7' : '#fee2e2',
            color: msg.type === 'ok' ? '#15803d' : '#b91c1c',
          }}
        >
          {msg.text}
        </div>
      )}

      <div
        className="flex gap-1 p-1 rounded-xl flex-wrap"
        style={{ background: '#f2f6f2', border: '1px solid #ddeadd' }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="text-xs px-3 py-2 rounded-lg font-medium transition-colors"
            style={{
              background: tab === t.id ? 'white' : 'transparent',
              color: tab === t.id ? '#162016' : '#5a7060',
              boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        className="bg-white rounded-xl border p-5 flex flex-col gap-4"
        style={{ borderColor: '#ddeadd' }}
      >
        {tab === 'contacto' && (
          <>
            <Field label="WhatsApp (cómo se muestra)">
              <TextInput
                value={str('contacto.whatsapp_display')}
                onChange={(v) => setPath('contacto.whatsapp_display', v)}
              />
            </Field>
            <Field label="WhatsApp (solo números, para el enlace)">
              <TextInput
                value={str('contacto.whatsapp_phone')}
                onChange={(v) => setPath('contacto.whatsapp_phone', v)}
                placeholder="5500000000"
              />
            </Field>
            <Field label="Correo">
              <TextInput
                value={str('contacto.email')}
                onChange={(v) => setPath('contacto.email', v)}
              />
            </Field>
            <Field label="Horario">
              <TextInput
                value={str('contacto.horario')}
                onChange={(v) => setPath('contacto.horario', v)}
              />
            </Field>
            <Field label="Texto del pie de página">
              <TextInput
                multiline
                value={str('footer.descripcion')}
                onChange={(v) => setPath('footer.descripcion', v)}
              />
            </Field>
          </>
        )}

        {tab === 'hero' && (
          <>
            <Field label="Píldora (arriba del título)">
              <TextInput
                value={str('hero.pill')}
                onChange={(v) => setPath('hero.pill', v)}
              />
            </Field>
            <Field label="Título — línea 1">
              <TextInput
                value={str('hero.titulo_l1')}
                onChange={(v) => setPath('hero.titulo_l1', v)}
              />
            </Field>
            <Field label="Título — línea 2">
              <TextInput
                value={str('hero.titulo_l2')}
                onChange={(v) => setPath('hero.titulo_l2', v)}
              />
            </Field>
            <Field label="Título — línea 3 (resaltada)">
              <TextInput
                value={str('hero.titulo_l3')}
                onChange={(v) => setPath('hero.titulo_l3', v)}
              />
            </Field>
            <Field label="Párrafo principal">
              <TextInput
                multiline
                value={str('hero.lead')}
                onChange={(v) => setPath('hero.lead', v)}
              />
            </Field>
            <Field label="Micro-garantías (una por línea)">
              <TextInput
                multiline
                value={garantias.join('\n')}
                onChange={(v) =>
                  setPath(
                    'hero.garantias',
                    v.split('\n').map((s) => s.trim()).filter(Boolean),
                  )
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Chip número">
                <TextInput
                  value={str('hero.chip_numero')}
                  onChange={(v) => setPath('hero.chip_numero', v)}
                />
              </Field>
              <Field label="Chip texto">
                <TextInput
                  value={str('hero.chip_texto')}
                  onChange={(v) => setPath('hero.chip_texto', v)}
                />
              </Field>
            </div>
            <Field label="Título bloque CTA final">
              <TextInput
                value={str('cta.titulo')}
                onChange={(v) => setPath('cta.titulo', v)}
              />
            </Field>
            <Field label="Texto bloque CTA final">
              <TextInput
                multiline
                value={str('cta.lead')}
                onChange={(v) => setPath('cta.lead', v)}
              />
            </Field>
          </>
        )}

        {tab === 'servicios' && (
          <>
            <Field label="Título de la sección">
              <TextInput
                value={str('servicios_intro.titulo')}
                onChange={(v) => setPath('servicios_intro.titulo', v)}
              />
            </Field>
            {servicios.map((s, i) => (
              <div
                key={i}
                className="rounded-xl border p-4 flex flex-col gap-3"
                style={{ borderColor: '#ddeadd' }}
              >
                <div className="text-sm font-semibold" style={{ color: '#162016' }}>
                  Servicio {i + 1}
                </div>
                <Field label="Nombre">
                  <TextInput
                    value={s.title || ''}
                    onChange={(v) => {
                      const next = [...servicios]
                      next[i] = { ...next[i], title: v }
                      setPath('servicios', next)
                    }}
                  />
                </Field>
                <Field label="Descripción">
                  <TextInput
                    multiline
                    value={s.blurb || ''}
                    onChange={(v) => {
                      const next = [...servicios]
                      next[i] = { ...next[i], blurb: v }
                      setPath('servicios', next)
                    }}
                  />
                </Field>
              </div>
            ))}
            <div className="text-sm font-semibold mt-2" style={{ color: '#162016' }}>
              Bloque seguridad
            </div>
            <Field label="Título seguridad">
              <TextInput
                value={str('seguridad.titulo')}
                onChange={(v) => setPath('seguridad.titulo', v)}
              />
            </Field>
            <Field label="Párrafo seguridad">
              <TextInput
                multiline
                value={str('seguridad.lead')}
                onChange={(v) => setPath('seguridad.lead', v)}
              />
            </Field>
            {seguridadItems.map((item, i) => (
              <div key={i} className="grid grid-cols-2 gap-3">
                <Field label={`Punto ${i + 1} — título`}>
                  <TextInput
                    value={item.title}
                    onChange={(v) => {
                      const next = [...seguridadItems]
                      next[i] = { ...next[i], title: v }
                      setPath('seguridad.items', next)
                    }}
                  />
                </Field>
                <Field label={`Punto ${i + 1} — texto`}>
                  <TextInput
                    value={item.blurb}
                    onChange={(v) => {
                      const next = [...seguridadItems]
                      next[i] = { ...next[i], blurb: v }
                      setPath('seguridad.items', next)
                    }}
                  />
                </Field>
              </div>
            ))}
          </>
        )}

        {tab === 'paquetes' && (
          <>
            <Field label="Título de la sección">
              <TextInput
                value={str('paquetes_intro.titulo')}
                onChange={(v) => setPath('paquetes_intro.titulo', v)}
              />
            </Field>
            <Field label="Texto introductorio">
              <TextInput
                multiline
                value={str('paquetes_intro.lead')}
                onChange={(v) => setPath('paquetes_intro.lead', v)}
              />
            </Field>
            {paquetes.map((pkg, i) => {
              const features = (pkg.features as string[]) || []
              return (
                <div
                  key={String(pkg.id || i)}
                  className="rounded-xl border p-4 flex flex-col gap-3"
                  style={{ borderColor: '#ddeadd' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold" style={{ color: '#162016' }}>
                      Paquete {i + 1}
                    </div>
                    <label className="text-xs flex items-center gap-2" style={{ color: '#5a7060' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(pkg.featured)}
                        onChange={(e) => {
                          const next = [...paquetes]
                          next[i] = { ...next[i], featured: e.target.checked }
                          setPath('paquetes', next)
                        }}
                      />
                      Destacar “El más pedido”
                    </label>
                  </div>
                  <Field label="Nombre">
                    <TextInput
                      value={String(pkg.title || '')}
                      onChange={(v) => {
                        const next = [...paquetes]
                        next[i] = { ...next[i], title: v }
                        setPath('paquetes', next)
                      }}
                    />
                  </Field>
                  <Field label="Descripción corta">
                    <TextInput
                      multiline
                      value={String(pkg.blurb || '')}
                      onChange={(v) => {
                        const next = [...paquetes]
                        next[i] = { ...next[i], blurb: v }
                        setPath('paquetes', next)
                      }}
                    />
                  </Field>
                  <Field label="Precio (texto)">
                    <TextInput
                      value={String(pkg.price || '')}
                      onChange={(v) => {
                        const next = [...paquetes]
                        next[i] = { ...next[i], price: v }
                        setPath('paquetes', next)
                      }}
                    />
                  </Field>
                  <Field label="Incluye (una línea por punto)">
                    <TextInput
                      multiline
                      value={features.join('\n')}
                      onChange={(v) => {
                        const next = [...paquetes]
                        next[i] = {
                          ...next[i],
                          features: v
                            .split('\n')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        }
                        setPath('paquetes', next)
                      }}
                    />
                  </Field>
                  <Field label="Texto del botón">
                    <select
                      value={String(pkg.cta || 'Cotizar')}
                      onChange={(e) => {
                        const next = [...paquetes]
                        next[i] = { ...next[i], cta: e.target.value }
                        setPath('paquetes', next)
                      }}
                      className="w-full border rounded-lg px-3 py-2.5 text-sm"
                      style={{ borderColor: '#ddeadd', color: '#162016' }}
                    >
                      <option value="Cotizar">Cotizar</option>
                      <option value="Hablar con ventas">Hablar con ventas</option>
                    </select>
                  </Field>
                </div>
              )
            })}
          </>
        )}

        {tab === 'nosotros' && (
          <>
            <Field label="Título">
              <TextInput
                value={str('nosotros.titulo')}
                onChange={(v) => setPath('nosotros.titulo', v)}
              />
            </Field>
            <Field label="Historia / párrafo">
              <TextInput
                multiline
                value={str('nosotros.lead')}
                onChange={(v) => setPath('nosotros.lead', v)}
              />
            </Field>
            {nosotrosStats.map((st, i) => (
              <div key={i} className="grid grid-cols-2 gap-3">
                <Field label={`Dato ${i + 1} — valor`}>
                  <TextInput
                    value={st.valor}
                    onChange={(v) => {
                      const next = [...nosotrosStats]
                      next[i] = { ...next[i], valor: v }
                      setPath('nosotros.stats', next)
                    }}
                  />
                </Field>
                <Field label={`Dato ${i + 1} — etiqueta`}>
                  <TextInput
                    value={st.etiqueta}
                    onChange={(v) => {
                      const next = [...nosotrosStats]
                      next[i] = { ...next[i], etiqueta: v }
                      setPath('nosotros.stats', next)
                    }}
                  />
                </Field>
              </div>
            ))}
          </>
        )}

        {tab === 'faq' && (
          <>
            <Field label="Título de la sección">
              <TextInput
                value={str('faq_intro.titulo')}
                onChange={(v) => setPath('faq_intro.titulo', v)}
              />
            </Field>
            <Field label="Texto introductorio">
              <TextInput
                multiline
                value={str('faq_intro.lead')}
                onChange={(v) => setPath('faq_intro.lead', v)}
              />
            </Field>
            {faq.map((item, i) => (
              <div
                key={i}
                className="rounded-xl border p-4 flex flex-col gap-3"
                style={{ borderColor: '#ddeadd' }}
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold" style={{ color: '#162016' }}>
                    Pregunta {i + 1}
                  </span>
                  <button
                    type="button"
                    className="text-xs"
                    style={{ color: '#b91c1c' }}
                    onClick={() => {
                      const next = faq.filter((_, j) => j !== i)
                      setPath('faq', next)
                    }}
                  >
                    Quitar
                  </button>
                </div>
                <Field label="Pregunta">
                  <TextInput
                    value={item.q}
                    onChange={(v) => {
                      const next = [...faq]
                      next[i] = { ...next[i], q: v }
                      setPath('faq', next)
                    }}
                  />
                </Field>
                <Field label="Respuesta">
                  <TextInput
                    multiline
                    value={item.a}
                    onChange={(v) => {
                      const next = [...faq]
                      next[i] = { ...next[i], a: v }
                      setPath('faq', next)
                    }}
                  />
                </Field>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setPath('faq', [...faq, { q: '', a: '' }])}
              className="text-sm font-medium py-2 rounded-lg border"
              style={{ borderColor: '#ddeadd', color: '#16a34a' }}
            >
              + Agregar pregunta
            </button>
          </>
        )}

        {tab === 'imagenes' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(payload.media_labels || {}).map(([clave, label]) => {
              const url = payload.imagenes?.[clave]
              return (
                <div
                  key={clave}
                  className="rounded-xl border p-4 flex flex-col gap-3"
                  style={{ borderColor: '#ddeadd' }}
                >
                  <div className="text-sm font-semibold" style={{ color: '#162016' }}>
                    {label}
                  </div>
                  <div
                    className="rounded-lg overflow-hidden flex items-center justify-center"
                    style={{ height: 160, background: '#f2f6f2' }}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={label}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span className="text-xs" style={{ color: '#8fa890' }}>
                        Sin imagen
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <label
                      className="flex-1 text-center text-sm font-semibold py-2 rounded-lg cursor-pointer"
                      style={{ background: '#16a34a', color: 'white' }}
                    >
                      {uploading === clave ? 'Subiendo…' : 'Elegir imagen'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploading === clave}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) uploadImagen(clave, f)
                          e.target.value = ''
                        }}
                      />
                    </label>
                    {url && (
                      <button
                        type="button"
                        onClick={() => borrarImagen(clave)}
                        className="text-sm px-3 py-2 rounded-lg border"
                        style={{ borderColor: '#ddeadd', color: '#b91c1c' }}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            <p className="text-xs md:col-span-2" style={{ color: '#8fa890' }}>
              Las fotos de brincolines del catálogo se suben en el menú Productos, no aquí.
            </p>
          </div>
        )}
      </div>

      {tab !== 'imagenes' && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={guardar}
            disabled={saving}
            className="text-sm font-semibold px-5 py-2.5 rounded-lg disabled:opacity-60"
            style={{ background: '#16a34a', color: 'white' }}
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </div>
  )
}
