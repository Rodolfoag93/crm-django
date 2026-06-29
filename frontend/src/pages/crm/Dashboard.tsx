import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'

interface AsistenciaEmpleado {
  id: number
  nombre: string
  tipo: string
  hora_entrada: string | null
}

interface DashboardData {
  pedidos: { total: number; por_enviar: number; enviados: number }
  rutas: { total: number; pendientes: number; en_camino: number }
  asistencia: { con_entrada: number; con_salida: number }
  ingreso_mes: number
  ingreso_mes_anterior: number
  sin_cobrar_monto: number
  asistencia_lista: AsistenciaEmpleado[]
  solicitudes_pendientes: number
}

interface RentaHoy {
  id: number; folio: string; cliente: string; hora_inicio: string | null
  hora_fin: string | null; estado_entrega: string; pagado: boolean; total: string
  direccion: string
}

const ESTADO: Record<string, { label: string; dot: string; pillBg: string; pillColor: string }> = {
  PENDIENTE:  { label: 'Pendiente',  dot: '#f59e0b', pillBg: '#fef9c3', pillColor: '#a16207' },
  ASIGNADO:   { label: 'Asignado',   dot: '#6b7280', pillBg: '#f3f4f6', pillColor: '#6b7280' },
  EN_RUTA:    { label: 'En ruta',    dot: '#3b82f6', pillBg: '#dbeafe', pillColor: '#1d4ed8' },
  ENTREGADO:  { label: 'Entregado',  dot: '#16a34a', pillBg: '#dcfce7', pillColor: '#15803d' },
  RECOGIDO:   { label: 'Recogido',   dot: '#8b5cf6', pillBg: '#ede9fe', pillColor: '#6d28d9' },
  CANCELADO:  { label: 'Cancelado',  dot: '#ef4444', pillBg: '#fee2e2', pillColor: '#b91c1c' },
}

const AVATAR_COLORS = ['#0f3d22', '#1a5c35', '#1e6b3e', '#1e3a5f', '#7c2d12', '#4c1d95']

function StatCard({ label, value, sub, subColor, barColor, barPct, valueColor }: {
  label: string; value: string | number; sub?: string; subColor?: string
  barColor?: string; barPct?: number; valueColor?: string
}) {
  return (
    <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#ddeadd' }}>
      <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#5a7060', letterSpacing: '0.3px' }}>
        {label}
      </div>
      <div className="font-bold leading-none mb-1" style={{ fontSize: 26, letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums', color: valueColor ?? '#162016' }}>
        {value}
      </div>
      {sub && <div className="text-xs mt-1.5" style={{ color: subColor ?? '#8fa890' }}>{sub}</div>}
      {barColor && (
        <div className="mt-3 h-1 rounded-full" style={{ background: '#ddeadd' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${barPct ?? 0}%`, background: barColor }} />
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [rentas, setRentas] = useState<RentaHoy[]>([])
  const [loading, setLoading] = useState(true)

  const hoy = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/admin/'),
      api.get('/rentas-hoy/'),
    ]).then(([d, r]) => {
      setData(d.data)
      setRentas(r.data.slice(0, 6))
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="p-6">
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl animate-pulse" style={{ background: '#e8f0e8' }} />)}
      </div>
    </div>
  )

  const totalRentas = data?.pedidos.total ?? 0
  const empleadosActivos = data?.asistencia.con_entrada ?? 0
  const ingresoMes = data?.ingreso_mes ?? 0
  const ingresoMesAnterior = data?.ingreso_mes_anterior ?? 0
  const sinCobrarMonto = data?.sin_cobrar_monto ?? 0
  const sinPagarCount = rentas.filter(r => !r.pagado).length

  const formatMonto = (n: number) => {
    if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
    return `$${n.toLocaleString('es-MX')}`
  }

  const diffMes = ingresoMes - ingresoMesAnterior
  const ingresoSubLabel = ingresoMesAnterior === 0
    ? 'primer mes con datos'
    : `${diffMes >= 0 ? '↑' : '↓'} ${formatMonto(Math.abs(diffMes))} vs mes anterior`
  const ingresoSubColor = ingresoMesAnterior === 0 ? '#8fa890' : diffMes >= 0 ? '#16a34a' : '#ef4444'

  return (
    <div className="p-6 flex flex-col gap-5">
      <div>
        <h1 className="font-bold" style={{ fontSize: 20, letterSpacing: '-0.4px', color: '#162016' }}>Dashboard</h1>
        <p className="text-sm capitalize mt-0.5" style={{ color: '#5a7060' }}>{hoy}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Rentas hoy"
          value={totalRentas}
          sub={`${data?.pedidos.por_enviar ?? 0} sin asignar`}
          barColor="#16a34a"
          barPct={Math.min((totalRentas / 20) * 100, 100)}
        />
        <StatCard
          label="Empleados activos"
          value={empleadosActivos}
          sub={`${data?.rutas.en_camino ?? 0} en ruta ahora`}
          barColor="#3b82f6"
          barPct={Math.min((empleadosActivos / 15) * 100, 100)}
        />
        <StatCard
          label="Ingreso del mes"
          value={formatMonto(ingresoMes)}
          sub={ingresoSubLabel}
          subColor={ingresoSubColor}
          barColor="#8b5cf6"
          barPct={Math.min((ingresoMes / 200000) * 100, 100)}
        />
        <StatCard
          label="Sin cobrar"
          value={`$${sinCobrarMonto.toLocaleString('es-MX')}`}
          sub={`${sinPagarCount} renta${sinPagarCount !== 1 ? 's' : ''} hoy sin pago`}
          barColor="#ef4444"
          barPct={totalRentas ? (sinPagarCount / totalRentas) * 100 : 0}
          valueColor={sinCobrarMonto > 0 ? '#dc2626' : undefined}
        />
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Entregas de hoy */}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#ddeadd' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #ddeadd' }}>
            <span className="font-semibold text-sm" style={{ color: '#162016' }}>Entregas de hoy</span>
            <button onClick={() => navigate('/crm/rentas')} className="text-xs font-medium" style={{ color: '#16a34a' }}>
              Ver todas →
            </button>
          </div>
          {rentas.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: '#8fa890' }}>Sin rentas para hoy</p>
          ) : (
            rentas.map(r => {
              const est = ESTADO[r.estado_entrega] ?? { label: r.estado_entrega, dot: '#8fa890', pillBg: '#f3f4f6', pillColor: '#6b7280' }
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors"
                  style={{ borderBottom: '1px solid #f5f8f5' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fbf8')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                  onClick={() => navigate('/crm/rentas')}
                >
                  <div className="w-11 text-xs font-semibold tabular-nums flex-shrink-0" style={{ color: '#5a7060' }}>
                    {r.hora_inicio?.slice(0, 5) ?? '—'}
                  </div>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: est.dot }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: '#162016' }}>{r.cliente}</p>
                    <p className="text-xs truncate" style={{ color: '#8fa890' }}>{r.direccion}</p>
                  </div>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: est.pillBg, color: est.pillColor }}
                  >
                    {est.label}
                  </span>
                </div>
              )
            })
          )}
        </div>

        {/* Asistencia hoy */}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#ddeadd' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #ddeadd' }}>
            <span className="font-semibold text-sm" style={{ color: '#162016' }}>Asistencia hoy</span>
            <button onClick={() => navigate('/crm/empleados')} className="text-xs font-medium" style={{ color: '#16a34a' }}>
              Ver todos →
            </button>
          </div>
          {(data?.asistencia_lista ?? []).length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: '#8fa890' }}>Sin empleados registrados</p>
          ) : (
            (data?.asistencia_lista ?? []).map((emp, i) => (
              <div
                key={emp.id}
                className="flex items-center gap-3 px-4 py-2.5"
                style={{ borderBottom: '1px solid #f5f8f5' }}
              >
                <div
                  className="rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ width: 28, height: 28, background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                >
                  {emp.nombre.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#162016' }}>{emp.nombre}</p>
                  <p className="text-xs truncate" style={{ color: '#8fa890' }}>
                    {emp.tipo}{emp.hora_entrada ? ` · Entrada ${emp.hora_entrada}` : ''}
                  </p>
                </div>
                {emp.hora_entrada ? (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: '#dcfce7', color: '#15803d' }}>✓</span>
                ) : (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: '#fee2e2', color: '#b91c1c' }}>Sin entrada</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Solicitudes pendientes */}
      {data?.solicitudes_pendientes ? (
        <div
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 cursor-pointer"
          onClick={() => navigate('/crm/empleados')}
        >
          <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
          <p className="text-sm font-medium" style={{ color: '#92400e' }}>
            {data.solicitudes_pendientes} solicitud{data.solicitudes_pendientes !== 1 ? 'es' : ''} de registro pendiente{data.solicitudes_pendientes !== 1 ? 's' : ''}
          </p>
          <span className="ml-auto text-xs" style={{ color: '#a16207' }}>Revisar →</span>
        </div>
      ) : null}
    </div>
  )
}
