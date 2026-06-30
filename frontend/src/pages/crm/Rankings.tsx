import { useEffect, useState } from 'react'
import api from '../../lib/api'

type Rol = 'coordinadores' | 'animadores' | 'repartidores'

interface RankingItem {
  id: number
  nombre: string
  total_eventos: number
  total_monto?: number
  promedio_calificacion?: number
}

const ROLES: { key: Rol; label: string; icon: string; color: string }[] = [
  { key: 'coordinadores', label: 'Coordinadores', icon: '🎯', color: '#2563eb' },
  { key: 'animadores',    label: 'Animadores',    icon: '🎉', color: '#9333ea' },
  { key: 'repartidores',  label: 'Repartidores',  icon: '🚛', color: '#ea580c' },
]

const MEDAL = ['🥇','🥈','🥉']
const PODIUM_BG = ['#fef9c3','#f3f4f6','#fff7ed']
const PODIUM_BORDER = ['#fde047','#d1d5db','#fed7aa']

const AÑO_ACTUAL = new Date().getFullYear()
const AÑOS = Array.from({ length: 4 }, (_, i) => AÑO_ACTUAL - i)

export default function Rankings() {
  const [rol, setRol] = useState<Rol>('coordinadores')
  const [año, setAño] = useState(AÑO_ACTUAL)
  const [data, setData] = useState<RankingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    api.get(`/crm/rankings/?rol=${rol}&anio=${año}`)
      .then(r => setData(Array.isArray(r.data) ? r.data : []))
      .catch(e => setError(e?.response?.data?.error || `Error ${e?.response?.status || ''}`))
      .finally(() => setLoading(false))
  }, [rol, año])

  const rolInfo = ROLES.find(r => r.key === rol)!
  const top3 = data.slice(0, 3)
  const resto = data.slice(3)
  const max = data[0]?.total_eventos ?? 1

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-bold" style={{ fontSize: 20, letterSpacing: '-0.4px', color: '#162016' }}>Rankings</h1>
          <p className="text-sm mt-0.5" style={{ color: '#5a7060' }}>Empleados destacados por número de eventos</p>
        </div>
        <select
          value={año}
          onChange={e => setAño(Number(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm font-medium"
          style={{ borderColor: '#ddeadd', color: '#162016', background: 'white' }}
        >
          {AÑOS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Tabs rol */}
      <div className="flex gap-2">
        {ROLES.map(r => (
          <button
            key={r.key}
            onClick={() => setRol(r.key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: rol === r.key ? r.color : 'white',
              color: rol === r.key ? 'white' : '#5a7060',
              border: `1px solid ${rol === r.key ? r.color : '#ddeadd'}`,
            }}
          >
            <span>{r.icon}</span>
            {r.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-4 mb-2">
            {[...Array(3)].map((_,i) => (
              <div key={i} className="flex-1 rounded-xl border animate-pulse" style={{ height: 140, background: '#e8f0e8', borderColor: '#ddeadd' }} />
            ))}
          </div>
          {[...Array(5)].map((_,i) => (
            <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: '#e8f0e8' }} />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#8fa890' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{rolInfo.icon}</div>
          <p className="text-sm">Sin datos de {rolInfo.label.toLowerCase()} para {año}.</p>
        </div>
      ) : (
        <>
          {/* Podio top 3 */}
          {top3.length > 0 && (
            <div className="flex gap-4 items-end">
              {/* Reorder: 2nd, 1st, 3rd */}
              {[
                top3[1] ? { ...top3[1], rank: 1 } : null,
                { ...top3[0], rank: 0 },
                top3[2] ? { ...top3[2], rank: 2 } : null,
              ].filter(Boolean).map((item) => {
                if (!item) return null
                const rank = item.rank
                const height = rank === 0 ? 160 : rank === 1 ? 130 : 110
                return (
                  <div
                    key={item.id}
                    className="flex-1 rounded-xl border flex flex-col items-center justify-end pb-5 pt-4 relative"
                    style={{
                      height,
                      background: PODIUM_BG[rank],
                      borderColor: PODIUM_BORDER[rank],
                      borderWidth: rank === 0 ? 2 : 1,
                    }}
                  >
                    <div style={{ fontSize: rank === 0 ? 28 : 22, lineHeight: 1 }}>{MEDAL[rank]}</div>
                    <div
                      className="font-bold text-center mt-1 px-3 truncate w-full"
                      style={{ fontSize: rank === 0 ? 15 : 13.5, color: '#162016' }}
                    >
                      {item.nombre.split(' ').slice(0, 2).join(' ')}
                    </div>
                    <div
                      className="font-black tabular-nums mt-0.5"
                      style={{ fontSize: rank === 0 ? 28 : 22, color: rolInfo.color, letterSpacing: '-1px' }}
                    >
                      {item.total_eventos}
                    </div>
                    <div style={{ fontSize: 11, color: '#8fa890' }}>eventos</div>
                    {item.total_monto && (
                      <div className="mt-1 text-xs font-semibold" style={{ color: '#5a7060' }}>
                        ${Number(item.total_monto).toLocaleString('es-MX')}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Tabla resto */}
          {resto.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#ddeadd' }}>
              {resto.map((item, idx) => {
                const rank = idx + 3
                const pct = max > 0 ? (item.total_eventos / max) * 100 : 0
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 px-5 py-3.5"
                    style={{ borderBottom: idx < resto.length - 1 ? '1px solid #f5f8f5' : 'none' }}
                  >
                    <div
                      className="w-7 h-7 flex items-center justify-center rounded-full font-bold flex-shrink-0"
                      style={{ fontSize: 12, background: '#f0f4f0', color: '#5a7060' }}
                    >
                      {rank + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate" style={{ color: '#162016' }}>{item.nombre}</div>
                      <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: '#e8f0e8', width: '100%' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: rolInfo.color, opacity: 0.7 }} />
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="font-bold tabular-nums" style={{ fontSize: 18, color: rolInfo.color, letterSpacing: '-0.5px' }}>
                        {item.total_eventos}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#8fa890' }}>eventos</div>
                    </div>
                    {item.total_monto !== undefined && (
                      <div className="flex-shrink-0 text-right min-w-[80px]">
                        <div className="text-sm font-semibold tabular-nums" style={{ color: '#5a7060' }}>
                          ${Number(item.total_monto).toLocaleString('es-MX')}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#8fa890' }}>ganado</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Resumen */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#ddeadd' }}>
              <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#8fa890', fontSize: 10.5 }}>Participantes</div>
              <div className="font-bold" style={{ fontSize: 24, color: '#162016', letterSpacing: '-1px' }}>{data.length}</div>
            </div>
            <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#ddeadd' }}>
              <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#8fa890', fontSize: 10.5 }}>Total eventos</div>
              <div className="font-bold tabular-nums" style={{ fontSize: 24, color: '#162016', letterSpacing: '-1px' }}>
                {data.reduce((s, d) => s + d.total_eventos, 0)}
              </div>
            </div>
            {data.some(d => d.total_monto) && (
              <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#ddeadd' }}>
                <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#8fa890', fontSize: 10.5 }}>Monto total</div>
                <div className="font-bold tabular-nums" style={{ fontSize: 20, color: '#162016', letterSpacing: '-1px' }}>
                  ${data.reduce((s, d) => s + Number(d.total_monto ?? 0), 0).toLocaleString('es-MX')}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
