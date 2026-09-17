import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  cuentasService,
  type Cuenta,
  type CuentaPayload,
  type Movimiento,
  type ResumenBalances,
} from '../../lib/finanzas/cuentas.service'
import { formatMonto } from '../../lib/validations/gastos'

type Panel =
  | 'cuenta'
  | 'editar'
  | 'movimiento'
  | 'transferir'
  | 'traspasar'
  | null

function formatFechaHora(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function tipoLabel(tipo: string) {
  return (tipo || '').toLowerCase() === 'efectivo' ? 'Efectivo' : 'Banco'
}

function isEfectivo(tipo: string) {
  return (tipo || '').toLowerCase() === 'efectivo'
}

const CUENTA_EMPTY = (): CuentaPayload => ({
  nombre: '',
  tipo: 'Banco',
  banco: '',
  numero: '',
  activa: true,
})

export default function Cuentas() {
  const [resumen, setResumen] = useState<ResumenBalances | null>(null)
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [loading, setLoading] = useState(true)
  const [mostrarInactivas, setMostrarInactivas] = useState(false)

  const [detalle, setDetalle] = useState<Cuenta | null>(null)
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loadingMovs, setLoadingMovs] = useState(false)

  const [panel, setPanel] = useState<Panel>(null)
  const [editando, setEditando] = useState<Cuenta | null>(null)
  const [cuentaForm, setCuentaForm] = useState<CuentaPayload>(CUENTA_EMPTY())
  const [movForm, setMovForm] = useState({
    cuenta_id: '',
    tipo: 'INGRESO' as 'INGRESO' | 'EGRESO',
    monto: '',
    metodo_pago: '',
    descripcion: '',
  })
  const [transferForm, setTransferForm] = useState({
    origen_id: '',
    destino_id: '',
    monto: '',
    descripcion: '',
  })
  const [traspasoForm, setTraspasoForm] = useState({
    direccion: 'efectivo_a_banco' as 'efectivo_a_banco' | 'banco_a_efectivo',
    cuenta_banco_id: '',
    monto: '',
    descripcion: '',
  })

  const [guardando, setGuardando] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const fetchResumen = useCallback(() => {
    setLoading(true)
    Promise.all([
      cuentasService.resumen(),
      cuentasService.listar(mostrarInactivas),
    ])
      .then(([rRes, cRes]) => {
        setResumen(rRes.data)
        const list = Array.isArray(cRes.data) ? cRes.data : []
        setCuentas(list)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [mostrarInactivas])

  useEffect(() => {
    fetchResumen()
  }, [fetchResumen])

  const abrirDetalle = async (cuenta: Cuenta) => {
    setDetalle(cuenta)
    setLoadingMovs(true)
    try {
      const res = await cuentasService.movimientos(cuenta.id)
      setDetalle(res.data.cuenta)
      setMovimientos(res.data.movimientos)
    } catch (e) {
      console.error(e)
      showToast('No se pudieron cargar los movimientos.', 'err')
    } finally {
      setLoadingMovs(false)
    }
  }

  const refrescarDetalle = async (cuentaId: number) => {
    try {
      const res = await cuentasService.movimientos(cuentaId)
      setDetalle(res.data.cuenta)
      setMovimientos(res.data.movimientos)
    } catch {
      /* ignore */
    }
  }

  const activas = useMemo(() => cuentas.filter(c => c.activa), [cuentas])
  const bancos = useMemo(() => activas.filter(c => !isEfectivo(c.tipo)), [activas])

  const abrirNueva = () => {
    setEditando(null)
    setCuentaForm(CUENTA_EMPTY())
    setErrors({})
    setPanel('cuenta')
  }

  const abrirEditar = (c: Cuenta) => {
    setEditando(c)
    setCuentaForm({
      nombre: c.nombre,
      tipo: isEfectivo(c.tipo) ? 'Efectivo' : 'Banco',
      banco: c.banco || '',
      numero: c.numero || '',
      activa: c.activa,
    })
    setErrors({})
    setPanel('editar')
  }

  const abrirMovimiento = (cuentaId?: number) => {
    setMovForm({
      cuenta_id: cuentaId ? String(cuentaId) : (activas[0]?.id ? String(activas[0].id) : ''),
      tipo: 'INGRESO',
      monto: '',
      metodo_pago: '',
      descripcion: '',
    })
    setErrors({})
    setPanel('movimiento')
  }

  const abrirTransferir = () => {
    setTransferForm({
      origen_id: activas[0]?.id ? String(activas[0].id) : '',
      destino_id: activas[1]?.id ? String(activas[1].id) : '',
      monto: '',
      descripcion: '',
    })
    setErrors({})
    setPanel('transferir')
  }

  const abrirTraspaso = () => {
    setTraspasoForm({
      direccion: 'efectivo_a_banco',
      cuenta_banco_id: bancos[0]?.id ? String(bancos[0].id) : '',
      monto: '',
      descripcion: '',
    })
    setErrors({})
    setPanel('traspasar')
  }

  const guardarCuenta = async () => {
    const errs: Record<string, string> = {}
    if (!cuentaForm.nombre.trim() || cuentaForm.nombre.trim().length < 2) {
      errs.nombre = 'Nombre requerido (mín. 2 caracteres).'
    }
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }
    setGuardando(true)
    setErrors({})
    try {
      if (panel === 'editar' && editando) {
        await cuentasService.actualizar(editando.id, cuentaForm)
        showToast('Cuenta actualizada.')
      } else {
        await cuentasService.crear(cuentaForm)
        showToast('Cuenta creada.')
      }
      setPanel(null)
      fetchResumen()
      if (detalle && editando && detalle.id === editando.id) {
        await refrescarDetalle(editando.id)
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setErrors({ general: err.response?.data?.error || 'No se pudo guardar.' })
    } finally {
      setGuardando(false)
    }
  }

  const toggleActiva = async (c: Cuenta) => {
    try {
      await cuentasService.actualizar(c.id, { activa: !c.activa })
      showToast(c.activa ? 'Cuenta desactivada.' : 'Cuenta activada.')
      fetchResumen()
      if (detalle?.id === c.id) await refrescarDetalle(c.id)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      showToast(err.response?.data?.error || 'No se pudo actualizar.', 'err')
    }
  }

  const guardarMovimiento = async () => {
    const errs: Record<string, string> = {}
    if (!movForm.cuenta_id) errs.cuenta_id = 'Selecciona una cuenta.'
    if (!movForm.monto || Number(movForm.monto) <= 0) errs.monto = 'Monto inválido.'
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }
    setGuardando(true)
    setErrors({})
    try {
      await cuentasService.registrarMovimiento({
        cuenta_id: movForm.cuenta_id,
        tipo: movForm.tipo,
        monto: movForm.monto,
        metodo_pago: movForm.metodo_pago || undefined,
        descripcion: movForm.descripcion,
      })
      showToast('Movimiento registrado.')
      setPanel(null)
      fetchResumen()
      if (detalle) await refrescarDetalle(detalle.id)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setErrors({ general: err.response?.data?.error || 'No se pudo registrar.' })
    } finally {
      setGuardando(false)
    }
  }

  const guardarTransferencia = async () => {
    const errs: Record<string, string> = {}
    if (!transferForm.origen_id || !transferForm.destino_id) {
      errs.general = 'Indica origen y destino.'
    } else if (transferForm.origen_id === transferForm.destino_id) {
      errs.general = 'Origen y destino deben ser distintas.'
    }
    if (!transferForm.monto || Number(transferForm.monto) <= 0) errs.monto = 'Monto inválido.'
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }
    setGuardando(true)
    setErrors({})
    try {
      await cuentasService.transferir(transferForm)
      showToast('Transferencia realizada.')
      setPanel(null)
      fetchResumen()
      if (detalle) await refrescarDetalle(detalle.id)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setErrors({ general: err.response?.data?.error || 'No se pudo transferir.' })
    } finally {
      setGuardando(false)
    }
  }

  const guardarTraspaso = async () => {
    const errs: Record<string, string> = {}
    if (!traspasoForm.cuenta_banco_id) errs.cuenta_banco_id = 'Selecciona cuenta bancaria.'
    if (!traspasoForm.monto || Number(traspasoForm.monto) <= 0) errs.monto = 'Monto inválido.'
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }
    setGuardando(true)
    setErrors({})
    try {
      await cuentasService.traspasar(traspasoForm)
      showToast('Traspaso realizado.')
      setPanel(null)
      fetchResumen()
      if (detalle) await refrescarDetalle(detalle.id)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setErrors({ general: err.response?.data?.error || 'No se pudo traspasar.' })
    } finally {
      setGuardando(false)
    }
  }

  const cerrarPanel = () => {
    setPanel(null)
    setErrors({})
  }

  /* ── Vista detalle ─────────────────────────────────────────────── */
  if (detalle) {
    return (
      <div className="p-6 flex flex-col gap-5">
        {toast && <Toast toast={toast} />}

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <button
              onClick={() => { setDetalle(null); setMovimientos([]); fetchResumen() }}
              className="text-sm mb-2"
              style={{ color: '#16a34a' }}
            >
              ← Volver a cuentas
            </button>
            <h1 className="font-bold" style={{ fontSize: 20, letterSpacing: '-0.4px', color: '#162016' }}>
              {detalle.nombre}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#5a7060' }}>
              {tipoLabel(detalle.tipo)}
              {detalle.banco ? ` · ${detalle.banco}` : ''}
              {detalle.numero ? ` · ${detalle.numero}` : ''}
              {!detalle.activa ? ' · Inactiva' : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => abrirEditar(detalle)}
              className="text-sm px-3 py-1.5 rounded-lg border"
              style={{ borderColor: '#ddeadd', color: '#162016' }}
            >
              Editar
            </button>
            <button
              onClick={() => abrirMovimiento(detalle.id)}
              className="text-sm font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: '#16a34a', color: 'white' }}
            >
              Movimiento
            </button>
          </div>
        </div>

        <div
          className="bg-white rounded-xl border px-5 py-4"
          style={{ borderColor: '#ddeadd' }}
        >
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: '#5a7060' }}>
            Saldo actual
          </div>
          <div
            className="font-bold mt-1"
            style={{ fontSize: 28, color: '#162016', fontVariantNumeric: 'tabular-nums' }}
          >
            {formatMonto(detalle.saldo)}
          </div>
        </div>

        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#ddeadd' }}>
          <div className="px-5 py-3.5 font-semibold text-sm" style={{ borderBottom: '1px solid #ddeadd', color: '#162016' }}>
            Movimientos
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fbf8', borderBottom: '1px solid #ddeadd' }}>
                  {['Fecha', 'Tipo', 'Monto', 'Método', 'Descripción'].map(h => (
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
                {loadingMovs &&
                  [...Array(4)].map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f5f8f5' }}>
                      {[120, 70, 80, 90, 200].map((w, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 rounded animate-pulse" style={{ background: '#e8f0e8', width: w }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                {!loadingMovs && movimientos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-sm" style={{ color: '#8fa890' }}>
                      Sin movimientos en esta cuenta.
                    </td>
                  </tr>
                )}
                {!loadingMovs &&
                  movimientos.map(m => (
                    <tr key={m.id} style={{ borderBottom: '1px solid #f5f8f5' }}>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: '#5a7060' }}>
                        {formatFechaHora(m.fecha)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            background: m.tipo === 'INGRESO' ? '#dcfce7' : '#fee2e2',
                            color: m.tipo === 'INGRESO' ? '#15803d' : '#b91c1c',
                          }}
                        >
                          {m.tipo}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 font-medium whitespace-nowrap"
                        style={{
                          fontVariantNumeric: 'tabular-nums',
                          color: m.tipo === 'INGRESO' ? '#15803d' : '#b91c1c',
                        }}
                      >
                        {m.tipo === 'EGRESO' ? '−' : '+'}
                        {formatMonto(m.monto)}
                      </td>
                      <td className="px-4 py-3 capitalize" style={{ color: '#5a7060' }}>
                        {m.metodo_pago || '—'}
                      </td>
                      <td className="px-4 py-3" style={{ color: '#162016' }}>
                        {m.descripcion || '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {panel && (
          <ModalShell title={panelTitle(panel)} onClose={cerrarPanel}>
            {renderPanelBody()}
          </ModalShell>
        )}
      </div>
    )
  }

  /* ── Vista principal ───────────────────────────────────────────── */
  return (
    <div className="p-6 flex flex-col gap-5">
      {toast && <Toast toast={toast} />}

      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-bold" style={{ fontSize: 20, letterSpacing: '-0.4px', color: '#162016' }}>
            Cuentas
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#5a7060' }}>
            Saldos, movimientos y transferencias
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={abrirTransferir}
            className="text-sm px-3 py-1.5 rounded-lg border"
            style={{ borderColor: '#ddeadd', color: '#162016' }}
          >
            Transferir
          </button>
          <button
            onClick={abrirTraspaso}
            className="text-sm px-3 py-1.5 rounded-lg border"
            style={{ borderColor: '#ddeadd', color: '#162016' }}
          >
            Traspaso
          </button>
          <button
            onClick={() => abrirMovimiento()}
            className="text-sm px-3 py-1.5 rounded-lg border"
            style={{ borderColor: '#ddeadd', color: '#162016' }}
          >
            Movimiento
          </button>
          <button
            onClick={abrirNueva}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-lg"
            style={{ background: '#16a34a', color: 'white' }}
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nueva cuenta
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Efectivo" value={resumen ? formatMonto(resumen.saldo_efectivo) : '—'} color="#16a34a" />
        <StatCard label="Bancos" value={resumen ? formatMonto(resumen.saldo_bancos) : '—'} color="#3b82f6" />
        <StatCard label="Total" value={resumen ? formatMonto(resumen.total) : '—'} color="#162016" />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#ddeadd' }}>
        <div
          className="flex items-center gap-3 px-5 py-3.5 flex-wrap"
          style={{ borderBottom: '1px solid #ddeadd' }}
        >
          <span className="font-semibold text-sm" style={{ color: '#162016' }}>Cuentas</span>
          <label className="ml-auto flex items-center gap-2 text-xs" style={{ color: '#5a7060' }}>
            <input
              type="checkbox"
              checked={mostrarInactivas}
              onChange={e => setMostrarInactivas(e.target.checked)}
            />
            Mostrar inactivas
          </label>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fbf8', borderBottom: '1px solid #ddeadd' }}>
                {['Nombre', 'Tipo', 'Banco / Nº', 'Saldo', ''].map(h => (
                  <th
                    key={h || 'actions'}
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
                [...Array(3)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f5f8f5' }}>
                    {[140, 80, 120, 90, 160].map((w, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded animate-pulse" style={{ background: '#e8f0e8', width: w }} />
                      </td>
                    ))}
                  </tr>
                ))}
              {!loading && cuentas.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-sm" style={{ color: '#8fa890' }}>
                    No hay cuentas registradas.
                  </td>
                </tr>
              )}
              {!loading &&
                cuentas.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f5f8f5', opacity: c.activa ? 1 : 0.55 }}>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => abrirDetalle(c)}
                        className="font-medium text-left"
                        style={{ color: '#162016' }}
                      >
                        {c.nombre}
                      </button>
                    </td>
                    <td className="px-4 py-3" style={{ color: '#5a7060' }}>
                      {tipoLabel(c.tipo)}
                    </td>
                    <td className="px-4 py-3" style={{ color: '#5a7060' }}>
                      {[c.banco, c.numero].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td
                      className="px-4 py-3 font-medium whitespace-nowrap"
                      style={{ fontVariantNumeric: 'tabular-nums', color: '#162016' }}
                    >
                      {formatMonto(c.saldo)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 flex-wrap justify-end">
                        <button
                          onClick={() => abrirDetalle(c)}
                          className="text-xs px-3 py-1 rounded-lg"
                          style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}
                        >
                          Ver
                        </button>
                        <button
                          onClick={() => abrirEditar(c)}
                          className="text-xs px-3 py-1 rounded-lg border"
                          style={{ borderColor: '#ddeadd', color: '#162016' }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => toggleActiva(c)}
                          className="text-xs px-3 py-1 rounded-lg border"
                          style={{
                            borderColor: c.activa ? '#fecaca' : '#bbf7d0',
                            color: c.activa ? '#dc2626' : '#16a34a',
                          }}
                        >
                          {c.activa ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {panel && (
        <ModalShell title={panelTitle(panel)} onClose={cerrarPanel}>
          {renderPanelBody()}
        </ModalShell>
      )}
    </div>
  )

  function panelTitle(p: Panel) {
    switch (p) {
      case 'cuenta': return 'Nueva cuenta'
      case 'editar': return 'Editar cuenta'
      case 'movimiento': return 'Movimiento manual'
      case 'transferir': return 'Transferir entre cuentas'
      case 'traspasar': return 'Traspaso efectivo ↔ banco'
      default: return ''
    }
  }

  function renderPanelBody() {
    if (panel === 'cuenta' || panel === 'editar') {
      return (
        <>
          <Field label="Nombre" error={errors.nombre}>
            <input
              value={cuentaForm.nombre}
              onChange={e => setCuentaForm(f => ({ ...f, nombre: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: errors.nombre ? '#fca5a5' : '#ddeadd', color: '#162016' }}
              placeholder="Ej. BBVA Operativa"
            />
          </Field>
          <Field label="Tipo">
            <select
              value={cuentaForm.tipo}
              onChange={e => setCuentaForm(f => ({ ...f, tipo: e.target.value as 'Banco' | 'Efectivo' }))}
              className="w-full border rounded-lg px-3 py-2.5 text-sm"
              style={{ borderColor: '#ddeadd', color: '#162016' }}
            >
              <option value="Banco">Banco</option>
              <option value="Efectivo">Efectivo</option>
            </select>
          </Field>
          {cuentaForm.tipo === 'Banco' && (
            <>
              <Field label="Banco">
                <input
                  value={cuentaForm.banco || ''}
                  onChange={e => setCuentaForm(f => ({ ...f, banco: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: '#ddeadd', color: '#162016' }}
                />
              </Field>
              <Field label="Número de cuenta">
                <input
                  value={cuentaForm.numero || ''}
                  onChange={e => setCuentaForm(f => ({ ...f, numero: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: '#ddeadd', color: '#162016' }}
                />
              </Field>
            </>
          )}
          {panel === 'editar' && (
            <label className="flex items-center gap-2 text-sm" style={{ color: '#162016' }}>
              <input
                type="checkbox"
                checked={!!cuentaForm.activa}
                onChange={e => setCuentaForm(f => ({ ...f, activa: e.target.checked }))}
              />
              Cuenta activa
            </label>
          )}
          {errors.general && <ErrorText msg={errors.general} />}
          <FooterActions
            onCancel={cerrarPanel}
            onSave={guardarCuenta}
            saving={guardando}
            label={panel === 'editar' ? 'Guardar cambios' : 'Crear cuenta'}
          />
        </>
      )
    }

    if (panel === 'movimiento') {
      return (
        <>
          <Field label="Cuenta" error={errors.cuenta_id}>
            <select
              value={movForm.cuenta_id}
              onChange={e => setMovForm(f => ({ ...f, cuenta_id: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2.5 text-sm"
              style={{ borderColor: errors.cuenta_id ? '#fca5a5' : '#ddeadd', color: '#162016' }}
            >
              <option value="">Seleccionar…</option>
              {activas.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre} — {formatMonto(c.saldo)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo">
            <select
              value={movForm.tipo}
              onChange={e => setMovForm(f => ({ ...f, tipo: e.target.value as 'INGRESO' | 'EGRESO' }))}
              className="w-full border rounded-lg px-3 py-2.5 text-sm"
              style={{ borderColor: '#ddeadd', color: '#162016' }}
            >
              <option value="INGRESO">Ingreso</option>
              <option value="EGRESO">Egreso</option>
            </select>
          </Field>
          <Field label="Monto ($)" error={errors.monto}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={movForm.monto}
              onChange={e => setMovForm(f => ({ ...f, monto: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: errors.monto ? '#fca5a5' : '#ddeadd', color: '#162016' }}
            />
          </Field>
          <Field label="Método de pago">
            <select
              value={movForm.metodo_pago}
              onChange={e => setMovForm(f => ({ ...f, metodo_pago: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2.5 text-sm"
              style={{ borderColor: '#ddeadd', color: '#162016' }}
            >
              <option value="">Automático según cuenta</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </Field>
          <Field label="Descripción">
            <textarea
              value={movForm.descripcion}
              onChange={e => setMovForm(f => ({ ...f, descripcion: e.target.value }))}
              rows={2}
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
              style={{ borderColor: '#ddeadd', color: '#162016' }}
            />
          </Field>
          {errors.general && <ErrorText msg={errors.general} />}
          <FooterActions onCancel={cerrarPanel} onSave={guardarMovimiento} saving={guardando} label="Registrar" />
        </>
      )
    }

    if (panel === 'transferir') {
      return (
        <>
          <Field label="Origen">
            <select
              value={transferForm.origen_id}
              onChange={e => setTransferForm(f => ({ ...f, origen_id: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2.5 text-sm"
              style={{ borderColor: '#ddeadd', color: '#162016' }}
            >
              <option value="">Seleccionar…</option>
              {activas.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre} — {formatMonto(c.saldo)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Destino">
            <select
              value={transferForm.destino_id}
              onChange={e => setTransferForm(f => ({ ...f, destino_id: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2.5 text-sm"
              style={{ borderColor: '#ddeadd', color: '#162016' }}
            >
              <option value="">Seleccionar…</option>
              {activas.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre} — {formatMonto(c.saldo)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Monto ($)" error={errors.monto}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={transferForm.monto}
              onChange={e => setTransferForm(f => ({ ...f, monto: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: errors.monto ? '#fca5a5' : '#ddeadd', color: '#162016' }}
            />
          </Field>
          <Field label="Descripción">
            <input
              value={transferForm.descripcion}
              onChange={e => setTransferForm(f => ({ ...f, descripcion: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: '#ddeadd', color: '#162016' }}
            />
          </Field>
          {errors.general && <ErrorText msg={errors.general} />}
          <FooterActions onCancel={cerrarPanel} onSave={guardarTransferencia} saving={guardando} label="Transferir" />
        </>
      )
    }

    if (panel === 'traspasar') {
      return (
        <>
          <Field label="Dirección">
            <select
              value={traspasoForm.direccion}
              onChange={e =>
                setTraspasoForm(f => ({
                  ...f,
                  direccion: e.target.value as 'efectivo_a_banco' | 'banco_a_efectivo',
                }))
              }
              className="w-full border rounded-lg px-3 py-2.5 text-sm"
              style={{ borderColor: '#ddeadd', color: '#162016' }}
            >
              <option value="efectivo_a_banco">Efectivo → Banco</option>
              <option value="banco_a_efectivo">Banco → Efectivo</option>
            </select>
          </Field>
          <Field label="Cuenta bancaria" error={errors.cuenta_banco_id}>
            <select
              value={traspasoForm.cuenta_banco_id}
              onChange={e => setTraspasoForm(f => ({ ...f, cuenta_banco_id: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2.5 text-sm"
              style={{ borderColor: errors.cuenta_banco_id ? '#fca5a5' : '#ddeadd', color: '#162016' }}
            >
              <option value="">Seleccionar…</option>
              {bancos.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre} — {formatMonto(c.saldo)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Monto ($)" error={errors.monto}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={traspasoForm.monto}
              onChange={e => setTraspasoForm(f => ({ ...f, monto: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: errors.monto ? '#fca5a5' : '#ddeadd', color: '#162016' }}
            />
          </Field>
          <Field label="Descripción">
            <input
              value={traspasoForm.descripcion}
              onChange={e => setTraspasoForm(f => ({ ...f, descripcion: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: '#ddeadd', color: '#162016' }}
            />
          </Field>
          {errors.general && <ErrorText msg={errors.general} />}
          <FooterActions onCancel={cerrarPanel} onSave={guardarTraspaso} saving={guardando} label="Traspasar" />
        </>
      )
    }

    return null
  }
}

function Toast({ toast }: { toast: { msg: string; type: 'ok' | 'err' } }) {
  return (
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
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border px-5 py-4" style={{ borderColor: '#ddeadd' }}>
      <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: '#5a7060' }}>
        {label}
      </div>
      <div
        className="font-bold mt-1"
        style={{ fontSize: 22, color, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
    </div>
  )
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end"
      style={{ background: 'rgba(0,0,0,0.25)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col h-full bg-white"
        style={{ width: 420, borderLeft: '1px solid #ddeadd' }}
      >
        <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid #ddeadd' }}>
          <div className="font-bold" style={{ fontSize: 16, color: '#162016' }}>{title}</div>
          <button
            onClick={onClose}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border text-sm"
            style={{ borderColor: '#ddeadd', color: '#5a7060' }}
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {children}
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: '#5a7060' }}>
        {label}
      </label>
      {children}
      {error && <p className="text-xs mt-1" style={{ color: '#dc2626' }}>{error}</p>}
    </div>
  )
}

function ErrorText({ msg }: { msg: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2 text-sm"
      style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}
    >
      {msg}
    </div>
  )
}

function FooterActions({
  onCancel,
  onSave,
  saving,
  label,
}: {
  onCancel: () => void
  onSave: () => void
  saving: boolean
  label: string
}) {
  return (
    <div className="flex gap-2 mt-2 pt-2" style={{ borderTop: '1px solid #f0f4f0' }}>
      <button
        onClick={onCancel}
        className="flex-1 text-sm py-2.5 rounded-lg border"
        style={{ borderColor: '#ddeadd', color: '#5a7060' }}
      >
        Cancelar
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        className="flex-1 text-sm font-semibold py-2.5 rounded-lg"
        style={{ background: '#16a34a', color: 'white', opacity: saving ? 0.7 : 1 }}
      >
        {saving ? 'Guardando…' : label}
      </button>
    </div>
  )
}
