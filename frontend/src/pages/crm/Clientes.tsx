import { useEffect, useState, useCallback } from 'react'
import api from '../../lib/api'

interface Cliente {
  id: number
  nombre: string
  telefono: string
  email: string
  notas: string
  rentas_count?: number
}

interface PaginatedResponse { count: number; next: string | null; previous: string | null; results: Cliente[] }

const PAGE_SIZE = 25

export default function Clientes() {
  const [searchInput, setSearchInput] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PaginatedResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [detalle, setDetalle] = useState<Cliente | null>(null)

  useEffect(() => {
    const t = setTimeout(() => { setBusqueda(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const fetchClientes = useCallback(() => {
    setLoading(true)
    const params: Record<string, string> = { page: String(page) }
    if (busqueda) params.search = busqueda
    api.get('/clientes/', { params })
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [busqueda, page])

  useEffect(() => { fetchClientes() }, [fetchClientes])

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 1
  const clientes = data?.results ?? []

  function initials(nombre: string) {
    return nombre.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  }

  const AVATAR_COLORS = ['#16a34a','#2563eb','#9333ea','#db2777','#ea580c','#0891b2','#65a30d']
  function avatarColor(id: number) { return AVATAR_COLORS[id % AVATAR_COLORS.length] }

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-bold" style={{ fontSize: 20, letterSpacing: '-0.4px', color: '#162016' }}>Clientes</h1>
          <p className="text-sm mt-0.5" style={{ color: '#5a7060' }}>
            {data ? `${data.count} cliente${data.count !== 1 ? 's' : ''}` : '…'}
          </p>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#ddeadd' }}>
        <div className="flex items-center gap-2 border rounded-lg px-3 py-2.5" style={{ borderColor: '#ddeadd' }}>
          <svg width="14" height="14" fill="none" stroke="#8fa890" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Buscar por nombre, teléfono, email…"
            className="flex-1 text-sm outline-none"
            style={{ color: '#162016' }}
          />
          {searchInput && (
            <button onClick={() => setSearchInput('')} style={{ color: '#8fa890', fontSize: 16 }}>×</button>
          )}
        </div>
      </div>

      {/* Grid de cards */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border p-4 animate-pulse" style={{ borderColor: '#ddeadd', height: 100 }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full" style={{ background: '#e8f0e8' }} />
                <div className="flex-1 flex flex-col gap-2">
                  <div className="h-3.5 rounded" style={{ background: '#e8f0e8', width: '60%' }} />
                  <div className="h-3 rounded" style={{ background: '#e8f0e8', width: '40%' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : clientes.length === 0 ? (
        <div className="text-center py-16 text-sm" style={{ color: '#8fa890' }}>
          {busqueda ? `Sin resultados para "${busqueda}"` : 'Sin clientes registrados.'}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {clientes.map(c => (
            <div
              key={c.id}
              className="bg-white rounded-xl border p-4 cursor-pointer transition-shadow"
              style={{ borderColor: '#ddeadd' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 10px rgba(15,61,34,0.08)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = 'none'}
              onClick={() => setDetalle(c)}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
                  style={{ background: avatarColor(c.id), fontSize: 13 }}
                >
                  {initials(c.nombre)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate" style={{ fontSize: 14, color: '#162016' }}>{c.nombre}</div>
                  <div className="truncate mt-0.5" style={{ fontSize: 12.5, color: '#5a7060' }}>{c.telefono}</div>
                  {c.email && <div className="truncate mt-0.5" style={{ fontSize: 12, color: '#8fa890' }}>{c.email}</div>}
                </div>
              </div>
              {c.notas && (
                <p className="mt-3 text-xs line-clamp-2" style={{ color: '#8fa890', lineHeight: 1.5 }}>{c.notas}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
            className="w-8 h-8 flex items-center justify-center rounded-lg border text-sm disabled:opacity-40"
            style={{ borderColor: '#ddeadd', color: '#5a7060', background: 'white' }}>‹</button>
          {[...Array(Math.min(totalPages, 7))].map((_, i) => {
            const p = i + 1
            return (
              <button key={p} onClick={() => setPage(p)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border text-xs font-medium"
                style={{ borderColor: page === p ? '#16a34a' : '#ddeadd', background: page === p ? '#16a34a' : 'white', color: page === p ? '#fff' : '#5a7060' }}>
                {p}
              </button>
            )
          })}
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
            className="w-8 h-8 flex items-center justify-center rounded-lg border text-sm disabled:opacity-40"
            style={{ borderColor: '#ddeadd', color: '#5a7060', background: 'white' }}>›</button>
        </div>
      )}

      {/* Panel detalle */}
      {detalle && (
        <div className="fixed inset-0 z-50 flex items-start justify-end" style={{ background: 'rgba(0,0,0,0.25)' }}
          onClick={e => { if (e.target === e.currentTarget) setDetalle(null) }}>
          <div className="flex flex-col h-full bg-white" style={{ width: 400, borderLeft: '1px solid #ddeadd' }}>
            <div className="flex items-start gap-4 px-5 py-5" style={{ borderBottom: '1px solid #ddeadd' }}>
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
                style={{ background: avatarColor(detalle.id), fontSize: 15 }}
              >
                {initials(detalle.nombre)}
              </div>
              <div className="flex-1">
                <div className="font-bold" style={{ fontSize: 16, color: '#162016' }}>{detalle.nombre}</div>
                <div style={{ fontSize: 13, color: '#8fa890' }}>Cliente #{detalle.id}</div>
              </div>
              <button onClick={() => setDetalle(null)}
                className="w-7 h-7 flex items-center justify-center rounded-md border text-sm"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}>×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <InfoRow icon="📞" label="Teléfono" value={detalle.telefono} />
                {detalle.email && <InfoRow icon="✉️" label="Email" value={detalle.email} />}
                {detalle.notas && <InfoRow icon="📝" label="Notas" value={detalle.notas} />}
              </div>
            </div>

            <div className="flex gap-2 p-4" style={{ borderTop: '1px solid #ddeadd' }}>
              <a href={`tel:${detalle.telefono}`}
                className="flex-1 text-center text-sm font-medium py-2 rounded-lg border transition-colors"
                style={{ borderColor: '#ddeadd', color: '#5a7060' }}>
                Llamar
              </a>
              {detalle.telefono && (
                <a href={`https://wa.me/52${detalle.telefono.replace(/\D/g,'')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex-1 text-center text-sm font-medium py-2 rounded-lg transition-colors"
                  style={{ background: '#22c55e', color: 'white' }}>
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span style={{ fontSize: 16, width: 20 }}>{icon}</span>
      <div>
        <div className="text-xs mb-0.5" style={{ color: '#8fa890' }}>{label}</div>
        <div className="text-sm font-medium" style={{ color: '#162016' }}>{value}</div>
      </div>
    </div>
  )
}
