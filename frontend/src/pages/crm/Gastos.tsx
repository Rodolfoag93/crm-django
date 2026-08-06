import { useCallback, useEffect, useState } from 'react'
import {
  gastosService,
  type Gasto,
  type GastoCatalogo,
  type GastoPayload,
  type GastoStats,
  type PresupuestoInfo,
  type DuplicadoGasto,
} from '../../lib/finanzas/gastos.service'
import {
  formatMonto,
  formatSemanaLabel,
  lunesDe,
  sumarDias,
  validateGastoForm,
} from '../../lib/validations/gastos'

const FORM_EMPTY = (): GastoPayload => ({
  tipo: 'GASTO',
  categoria: 'INSUMOS',
  cuenta_id: '',
  descripcion: '',
  monto: '',
  fecha: new Date().toISOString().split('T')[0],
  referencia: '',
  comprobante: null,
})

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function cuentaIcon(tipo: string) {
  return tipo?.toLowerCase().includes('efectivo') ? '💵' : '🏦'
}

export default function Gastos() {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [stats, setStats] = useState<GastoStats | null>(null)
  const [catalogo, setCatalogo] = useState<GastoCatalogo | null>(null)
  const [loading, setLoading] = useState(true)
  const [semanaInicio, setSemanaInicio] = useState(lunesDe())
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const [panel, setPanel] = useState<'nuevo' | 'editar' | null>(null)
  const [editando, setEditando] = useState<Gasto | null>(null)
  const [form, setForm] = useState<GastoPayload>(FORM_EMPTY())
  const [presupuesto, setPresupuesto] = useState<PresupuestoInfo | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  const [eliminarTarget, setEliminarTarget] = useState<Gasto | null>(null)
  const [duplicados, setDuplicados] = useState<DuplicadoGasto[] | null>(null)

  const semanaFin = sumarDias(semanaInicio, 6)

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    gastosService.getCatalogo().then(r => setCatalogo(r.data)).catch(console.error)
  }, [])

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = { semana_inicio: semanaInicio }
    Promise.all([
      gastosService.getGastos({
        ...params,
        ...(filtroTipo ? { tipo: filtroTipo } : {}),
        ...(filtroCategoria ? { categoria: filtroCategoria } : {}),
        ...(busqueda ? { search: busqueda } : {}),
      }),
      gastosService.getStats(semanaInicio),
    ])
      .then(([gRes, sRes]) => {
        const results = Array.isArray(gRes.data) ? gRes.data : (gRes.data as { results?: Gasto[] }).results ?? []
        setGastos(results)
        setStats(sRes.data)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [semanaInicio, filtroTipo, filtroCategoria, busqueda])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!panel) return
    gastosService
      .getPresupuesto(form.categoria, editando?.id)
      .then(r => setPresupuesto(r.data))
      .catch(() => setPresupuesto(null))
  }, [form.categoria, panel, editando?.id])

  const abrirNuevo = () => {
    setEditando(null)
    setForm(FORM_EMPTY())
    setErrors({})
    setPanel('nuevo')
  }

  const abrirEditar = (g: Gasto) => {
    if (g.nomina) {
      showToast('No puedes editar gastos generados automáticamente por nómina.', 'err')
      return
    }
    setEditando(g)
    setForm({
      tipo: g.tipo,
      categoria: g.categoria,
      cuenta_id: g.cuenta ? String(g.cuenta) : '',
      descripcion: g.descripcion,
      monto: g.monto,
      fecha: g.fecha,
      referencia: g.referencia || '',
      comprobante: null,
    })
    setErrors({})
    setPanel('editar')
  }

  const guardar = async (ignorarDuplicados = false) => {
    const validation = validateGastoForm(form, presupuesto)
    if (!validation.isValid) {
      setErrors(validation.errors)
      return
    }

    if (!ignorarDuplicados) {
      try {
        const dupRes = await gastosService.checkDuplicados({
          descripcion: form.descripcion,
          monto: form.monto,
          categoria: form.categoria,
          excluir_id: editando?.id,
        })
        if (dupRes.data.tiene_duplicados) {
          setDuplicados(dupRes.data.duplicados)
          return
        }
      } catch { /* continuar */ }
    }

    setGuardando(true)
    setErrors({})
    try {
      if (panel === 'nuevo') {
        await gastosService.createGasto(form)
        showToast('Gasto registrado correctamente.')
      } else if (editando) {
        await gastosService.updateGasto(editando.id, form)
        showToast('Gasto actualizado correctamente.')
      }
      setPanel(null)
      setDuplicados(null)
      fetchData()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      const msg = err.response?.data?.error || 'Error al guardar el gasto.'
      setErrors({ general: msg })
    } finally {
      setGuardando(false)
    }
  }

  const confirmarEliminar = async () => {
    if (!eliminarTarget) return
    try {
      await gastosService.deleteGasto(eliminarTarget.id)
      showToast('Gasto eliminado.')
      setEliminarTarget(null)
      fetchData()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      showToast(err.response?.data?.error || 'No se pudo eliminar.', 'err')
    }
  }

  const pctPresupuesto = presupuesto ? Math.min(presupuesto.porcentaje, 100) : 0
  const presupuestoWarn = presupuesto && presupuesto.porcentaje >= 80

  return (
    <div className="p-6 flex flex-col gap-5">
      {toast && (
        <div
          className="fixed top-4 right-4 z-[60] px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{
            background: toast.type === 'ok' ? '#dcfce7' : '#fee2e2',
            color: toast.type === 'ok' ? '#15803d' : '#b91c1c',
            border: `1px solid ${toast.type === 'ok' ? '#bbf7d0' : '#fecaca'}`,
          }}
        >
          {toast.msg}
        </div>
      )}

      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-bold" style={{ fontSize: 20, letterSpacing: '-0.4px', color: '#162016' }}>
            Gastos
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#5a7060' }}>
            Registro y control de egresos operativos
          </p>
        </div>
        <button
          onClick={abrirNuevo}
          className="flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-lg"
          style={{ background: '#16a34a', color: 'white' }}
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nuevo gasto
        </button>
      </div>

      {/* Navegación semanal */}
      <div
        className="flex items-center justify-between bg-white rounded-xl border px-5 py-3"
        style={{ borderColor: '#ddeadd' }}
      >
        <button
          onClick={() => setSemanaInicio(s => sumarDias(s, -7))}
          className="text-sm px-3 py-1.5 rounded-lg border"
          style={{ borderColor: '#ddeadd', color: '#5a7060' }}
        >
          ← Semana anterior
        </button>
        <strong className="text-sm" style={{ color: '#162016' }}>
          {formatSemanaLabel(semanaInicio, semanaFin)}
        </strong>
        <button
          onClick={() => setSemanaInicio(s => sumarDias(s, 7))}
          className="text-sm px-3 py-1.5 rounded-lg border"
          style={{ borderColor: '#ddeadd', color: '#5a7060' }}
        >
          Semana siguiente →
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Total semana"
          value={stats ? formatMonto(stats.total_semana) : '—'}
          sub={stats ? `${stats.count_semana} gasto${stats.count_semana !== 1 ? 's' : ''}` : '…'}
          color="#16a34a"
          width="100%"
        />
        <StatCard
          label="Total mes"
          value={stats ? formatMonto(stats.total_mes) : '—'}
          sub="Acumulado del mes actual"
          color="#3b82f6"
          width="70%"
        />
        <StatCard
          label="Categoría top"
          value={
            stats?.por_categoria[0]
              ? stats.por_categoria[0].categoria
              : '—'
          }
          sub={
            stats?.por_categoria[0]
              ? formatMonto(stats.por_categoria[0].total)
              : 'Sin datos'
          }
          color="#8b5cf6"
          width="55%"
          smallValue
        />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#ddeadd' }}>
        <div
          className="flex items-center gap-3 px-5 py-3.5 flex-wrap"
          style={{ borderBottom: '1px solid #ddeadd' }}
        >
          <span className="font-semibold text-sm" style={{ color: '#162016' }}>Registro</span>

          <select
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-xs"
            style={{ borderColor: '#ddeadd', color: '#162016' }}
          >
            <option value="">Todos los tipos</option>
            {catalogo?.tipos.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <select
            value={filtroCategoria}
            onChange={e => setFiltroCategoria(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-xs"
            style={{ borderColor: '#ddeadd', color: '#162016' }}
          >
            <option value="">Todas las categorías</option>
            {catalogo?.categorias.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          <div
            className="flex items-center gap-2 border rounded-lg px-3 py-1.5 ml-auto"
            style={{ borderColor: '#ddeadd', minWidth: 200 }}
          >
            <svg width="13" height="13" fill="none" stroke="#8fa890" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar descripción…"
              className="flex-1 text-sm outline-none"
              style={{ color: '#162016' }}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fbf8', borderBottom: '1px solid #ddeadd' }}>
                {['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Origen', 'Monto', ''].map(h => (
                  <th
                    key={h}
                    className="text-left px-4 py-2.5 font-semibold uppercase tracking-wide whitespace-nowrap"
                    style={{ fontSize: 11, color: '#5a7060', letterSpacing: '0.3px' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading &&
                [...Array(4)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f5f8f5' }}>
                    {[80, 70, 90, 180, 90, 80, 100].map((w, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded animate-pulse" style={{ background: '#e8f0e8', width: w }} />
                      </td>
                    ))}
                  </tr>
                ))}
              {!loading && gastos.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-sm" style={{ color: '#8fa890' }}>
                    No hay gastos registrados en esta semana.
                  </td>
                </tr>
              )}
              {!loading &&
                gastos.map(g => (
                  <tr
                    key={g.id}
                    style={{ borderBottom: '1px solid #f5f8f5' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#f8fbf8')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '')}
                  >
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: '#5a7060' }}>
                      {formatFecha(g.fecha)}
                    </td>
                    <td className="px-4 py-3">{g.tipo_display}</td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: '#fef9c3', color: '#a16207' }}
                      >
                        {g.categoria_display}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: '#162016', maxWidth: 240 }}>
                      <div className="truncate">{g.descripcion}</div>
                      {g.comprobante_url && (
                        <a
                          href={g.comprobante_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs"
                          style={{ color: '#16a34a' }}
                        >
                          Ver comprobante
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: g.cuenta ? '#dbeafe' : '#f3f4f6',
                          color: g.cuenta ? '#1d4ed8' : '#6b7280',
                        }}
                      >
                        {g.cuenta ? '🏦' : '💵'} {g.cuenta_nombre}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 font-medium whitespace-nowrap"
                      style={{ fontVariantNumeric: 'tabular-nums', color: '#162016' }}
                    >
                      {formatMonto(g.monto)}
                    </td>
                    <td className="px-4 py-3">
                      {!g.nomina ? (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => abrirEditar(g)}
                            className="text-xs px-3 py-1 rounded-lg"
                            style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => setEliminarTarget(g)}
                            className="text-xs px-3 py-1 rounded-lg"
                            style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
                          >
                            Eliminar
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: '#8fa890' }}>Nómina</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 flex justify-between" style={{ borderTop: '1px solid #ddeadd', background: '#f8fbf8' }}>
          <span className="text-xs" style={{ color: '#8fa890' }}>
            {gastos.length} gasto{gastos.length !== 1 ? 's' : ''}
          </span>
          {stats && (
            <span className="text-xs font-semibold" style={{ color: '#15803d' }}>
              Total: {formatMonto(stats.total_semana)}
            </span>
          )}
        </div>
      </div>

      {/* Panel crear / editar */}
      {panel && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end"
          style={{ background: 'rgba(0,0,0,0.25)' }}
          onClick={e => { if (e.target === e.currentTarget) setPanel(null) }}
        >
          <div
            className="flex flex-col h-full bg-white"
            style={{ width: 420, borderLeft: '1px solid #ddeadd' }}
          >
            <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid #ddeadd' }}>
              <div>
                <div className="font-bold" style={{ fontSize: 16, color: '#162016' }}>
                  {panel === 'nuevo' ? 'Registrar gasto' : 'Editar gasto'}
                </div>
                <div className="text-xs mt-0.5" style={{ color: '#8fa890' }}>
                  {panel === 'nuevo' ? 'Nuevo egreso operativo' : form.descripcion}
                </div>
              </div>
              <button
                onClick={() => setPanel(null)}
                className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border text-sm"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              <Field label="Tipo">
                <select
                  value={form.tipo}
                  onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm"
                  style={{ borderColor: '#ddeadd', color: '#162016' }}
                >
                  {catalogo?.tipos.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Categoría">
                <select
                  value={form.categoria}
                  onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm"
                  style={{ borderColor: '#ddeadd', color: '#162016' }}
                >
                  {catalogo?.categorias.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </Field>

              {presupuesto && !presupuesto.sin_limite && presupuesto.presupuesto && (
                <div
                  className="rounded-lg px-4 py-3 text-sm"
                  style={{
                    background: presupuestoWarn ? '#fef9c3' : '#f0fdf4',
                    border: `1px solid ${presupuestoWarn ? '#fde047' : '#bbf7d0'}`,
                  }}
                >
                  <div className="flex justify-between text-xs mb-1.5" style={{ color: '#5a7060' }}>
                    <span>Presupuesto mensual — {form.categoria}</span>
                    <span>{presupuesto.porcentaje}% usado</span>
                  </div>
                  <div className="h-2 rounded-full mb-1" style={{ background: '#ddeadd' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pctPresupuesto}%`,
                        background: presupuesto.excedido ? '#dc2626' : presupuestoWarn ? '#eab308' : '#16a34a',
                      }}
                    />
                  </div>
                  <div className="text-xs" style={{ color: '#5a7060' }}>
                    {formatMonto(presupuesto.gastado)} / {formatMonto(presupuesto.presupuesto!)} ·{' '}
                    {formatMonto(presupuesto.disponible!)} disponibles
                  </div>
                </div>
              )}

              <Field label="Cuenta de origen">
                <select
                  value={form.cuenta_id}
                  onChange={e => setForm(f => ({ ...f, cuenta_id: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm"
                  style={{ borderColor: '#ddeadd', color: '#162016' }}
                >
                  <option value="">💵 Efectivo (sin cuenta bancaria)</option>
                  {catalogo?.cuentas.map(c => (
                    <option key={c.id} value={c.id}>
                      {cuentaIcon(c.tipo)} {c.nombre} — {formatMonto(c.saldo)}
                    </option>
                  ))}
                </select>
                {catalogo && !form.cuenta_id && (
                  <p className="text-xs mt-1" style={{ color: '#8fa890' }}>
                    Saldo efectivo: {formatMonto(catalogo.saldo_efectivo)}
                  </p>
                )}
              </Field>

              <Field label="Descripción">
                <textarea
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  rows={2}
                  placeholder="Ej. Compra de gasolina para entregas…"
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
                  style={{ borderColor: errors.descripcion ? '#fca5a5' : '#ddeadd', color: '#162016' }}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Monto ($)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.monto}
                    onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                    style={{ borderColor: errors.monto ? '#fca5a5' : '#ddeadd', color: '#162016' }}
                  />
                </Field>
                <Field label="Fecha">
                  <input
                    type="date"
                    value={form.fecha}
                    onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm"
                    style={{ borderColor: errors.fecha ? '#fca5a5' : '#ddeadd', color: '#162016' }}
                  />
                </Field>
              </div>

              <Field label="Referencia (opcional)">
                <input
                  value={form.referencia}
                  onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))}
                  placeholder="Factura #123, ticket, etc."
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: '#ddeadd', color: '#162016' }}
                />
              </Field>

              <Field label="Comprobante (opcional · PDF/JPG/PNG, máx. 5 MB)">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={e => setForm(f => ({ ...f, comprobante: e.target.files?.[0] ?? null }))}
                  className="w-full text-sm"
                />
                {editando?.comprobante_url && !form.comprobante && (
                  <a
                    href={editando.comprobante_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs mt-1 inline-block"
                    style={{ color: '#16a34a' }}
                  >
                    Comprobante actual adjunto
                  </a>
                )}
              </Field>

              {Object.keys(errors).length > 0 && (
                <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                  <div className="font-semibold mb-1">Por favor corrige los errores:</div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {Object.values(errors).map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex gap-2 p-4" style={{ borderTop: '1px solid #ddeadd' }}>
              <button
                onClick={() => setPanel(null)}
                className="flex-1 text-sm font-medium py-2 rounded-lg border"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => guardar(false)}
                disabled={guardando}
                className="flex-1 text-sm font-semibold py-2 rounded-lg disabled:opacity-60"
                style={{ background: '#16a34a', color: 'white' }}
              >
                {guardando ? 'Guardando…' : panel === 'nuevo' ? 'Registrar' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal eliminar */}
      {eliminarTarget && (
        <Modal
          title="Eliminar gasto"
          onClose={() => setEliminarTarget(null)}
          actions={
            <>
              <button
                onClick={() => setEliminarTarget(null)}
                className="flex-1 text-sm py-2 rounded-lg border"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarEliminar}
                className="flex-1 text-sm font-semibold py-2 rounded-lg"
                style={{ background: '#dc2626', color: 'white' }}
              >
                Eliminar
              </button>
            </>
          }
        >
          <p className="text-sm" style={{ color: '#5a7060' }}>
            ¿Eliminar el gasto <strong>{eliminarTarget.descripcion}</strong> por{' '}
            {formatMonto(eliminarTarget.monto)}? También se eliminará el movimiento contable asociado.
          </p>
        </Modal>
      )}

      {/* Modal duplicados */}
      {duplicados && (
        <Modal
          title="⚠️ Posible duplicado"
          onClose={() => setDuplicados(null)}
          actions={
            <>
              <button
                onClick={() => setDuplicados(null)}
                className="flex-1 text-sm py-2 rounded-lg border"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}
              >
                Revisar
              </button>
              <button
                onClick={() => { setDuplicados(null); guardar(true) }}
                className="flex-1 text-sm font-semibold py-2 rounded-lg"
                style={{ background: '#eab308', color: 'white' }}
              >
                Registrar igual
              </button>
            </>
          }
        >
          <p className="text-sm mb-3" style={{ color: '#5a7060' }}>
            Existe un gasto parecido en los últimos 7 días. ¿Es un duplicado?
          </p>
          <ul className="space-y-2">
            {duplicados.map(d => (
              <li
                key={d.id}
                className="text-sm rounded-lg px-3 py-2"
                style={{ background: '#fef9c3', color: '#854d0e' }}
              >
                {formatFecha(d.fecha)} — {d.descripcion} — {formatMonto(d.monto)}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  color,
  width,
  smallValue,
}: {
  label: string
  value: string
  sub: string
  color: string
  width: string
  smallValue?: boolean
}) {
  return (
    <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#ddeadd' }}>
      <div
        className="text-xs font-semibold uppercase tracking-wide mb-2"
        style={{ color: '#5a7060', letterSpacing: '0.3px' }}
      >
        {label}
      </div>
      <div
        className="font-bold leading-none truncate"
        style={{
          fontSize: smallValue ? 16 : 26,
          letterSpacing: '-1px',
          color: '#162016',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      <div className="text-xs mt-1.5" style={{ color: '#8fa890' }}>{sub}</div>
      <div className="mt-3 h-1 rounded-full" style={{ background: '#ddeadd' }}>
        <div className="h-full rounded-full" style={{ width, background: color }} />
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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

function Modal({
  title,
  children,
  actions,
  onClose,
}: {
  title: string
  children: React.ReactNode
  actions: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.35)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl w-full max-w-md p-5" style={{ border: '1px solid #ddeadd' }}>
        <h3 className="font-bold mb-3" style={{ fontSize: 16, color: '#162016' }}>{title}</h3>
        {children}
        <div className="flex gap-2 mt-5">{actions}</div>
      </div>
    </div>
  )
}
