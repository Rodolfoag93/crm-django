import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'

interface DashboardData {
  pedidos: { total: number; por_enviar: number; enviados: number }
  rutas: { total: number; pendientes: number; en_camino: number }
  asistencia: { con_entrada: number; con_salida: number }
  solicitudes_pendientes: number
}

interface RentaHoy {
  id: number; folio: string; cliente: string; hora_inicio: string | null
  hora_fin: string | null; estado_entrega: string; pagado: boolean; total: string
  direccion: string
}

const ESTADO: Record<string, { label: string; dot: string }> = {
  PENDIENTE:  { label: 'Pendiente',  dot: '#f59e0b' },
  ASIGNADO:   { label: 'Asignado',   dot: '#6b7280' },
  EN_RUTA:    { label: 'En ruta',    dot: '#3b82f6' },
  ENTREGADO:  { label: 'Entregado',  dot: '#16a34a' },
  RECOGIDO:   { label: 'Recogido',   dot: '#8b5cf6' },
  CANCELADO:  { label: 'Cancelado',  dot: '#ef4444' },
}

function StatCard({ label, value, sub, barColor, barPct }: {
  label: string; value: string | number; sub?: string; barColor?: string; barPct?: number
}) {
  return (
    <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#ddeadd' }}>
      <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#5a7060', letterSpacing: '0.3px' }}>
        {label}
      </div>
      <div className="font-bold leading-none mb-1" style={{ fontSize: 26, letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {sub && <div className="text-xs mt-1.5" style={{ color: '#8fa890' }}>{sub}</div>}
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
  const sinPagar = rentas.filter(r => !r.pagado).length

  return (
    <div className="p-6 flex flex-col gap-5">
      {/* Title */}
      <div>
        <h1 className="font-bold" style={{ fontSize: 20, letterSpacing: '-0.4px', color: '#162016' }}>Dashboard</h1>
        <p className="text-sm capitalize mt-0.5" style={{ color: '#5a7060' }}>{hoy}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Rentas hoy" value={totalRentas} sub={`${data?.pedidos.por_enviar ?? 0} sin asignar`} barColor="#16a34a" barPct={Math.min((totalRentas / 20) * 100, 100)} />
        <StatCard label="En ruta" value={data?.rutas.en_camino ?? 0} sub={`${data?.rutas.pendientes ?? 0} rutas pendientes`} barColor="#3b82f6" barPct={Math.min(((data?.rutas.en_camino ?? 0) / 5) * 100, 100)} />
        <StatCard label="Asistencia" value={data?.asistencia.con_entrada ?? 0} sub={`${data?.asistencia.con_salida ?? 0} con salida registrada`} barColor="#8b5cf6" barPct={Math.min(((data?.asistencia.con_entrada ?? 0) / 15) * 100, 100)} />
        <StatCard label="Sin cobrar" value={sinPagar} sub="rentas de hoy sin pago" barColor="#ef4444" barPct={totalRentas ? (sinPagar / totalRentas) * 100 : 0} />
      </div>

      {/* Rentas del día */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#ddeadd' }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid #ddeadd' }}>
          <span className="font-semibold text-sm" style={{ color: '#162016' }}>Rentas de hoy</span>
          <button
            onClick={() => navigate('/crm/rentas')}
            className="text-xs font-medium"
            style={{ color: '#16a34a' }}
          >
            Ver todas →
          </button>
        </div>

        {rentas.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: '#8fa890' }}>Sin rentas registradas para hoy</p>
        ) : (
          <div>
            {rentas.map(r => {
              const est = ESTADO[r.estado_entrega] ?? { label: r.estado_entrega, dot: '#8fa890' }
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-4 px-5 py-3 cursor-pointer transition-colors"
                  style={{ borderBottom: '1px solid #f5f8f5' }}
                  onClick={() => navigate('/crm/rentas')}
                >
                  <div className="w-12 text-xs font-semibold tabular-nums flex-shrink-0" style={{ color: '#5a7060' }}>
                    {r.hora_inicio?.slice(0, 5) ?? '—'}
                  </div>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: est.dot }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: '#162016' }}>{r.cliente}</p>
                    <p className="text-xs truncate" style={{ color: '#8fa890' }}>{r.direccion}</p>
                  </div>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      background: r.pagado ? '#dcfce7' : '#fef9c3',
                      color: r.pagado ? '#15803d' : '#a16207',
                    }}
                  >
                    {r.pagado ? 'Pagado' : 'Sin pagar'}
                  </span>
                  <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#5a7060', fontVariantNumeric: 'tabular-nums' }}>
                    ${parseFloat(r.total).toLocaleString('es-MX')}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Quick links */}
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
