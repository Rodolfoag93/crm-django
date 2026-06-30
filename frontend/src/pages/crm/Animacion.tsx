import { useEffect, useState } from 'react'
import api from '../../lib/api'

interface Coordinador {
  id: number
  nombre: string
}

interface Evento {
  id: number
  folio: string
  fecha_renta: string
  cliente_nombre: string
  servicios: string[]
  asignacion_id: number | null
  coordinador: { id: number; nombre: string } | null
  lista_estado: string | null
  animadores_count: number
}

const PIPELINE_STEPS = [
  'Sin coordinador',
  'Sin lista',
  'Lista enviada',
  'Material surtido',
  'En evento',
  'Completado',
]

function getPipelineStep(ev: Evento): number {
  if (!ev.coordinador) return 0
  if (!ev.lista_estado) return 1
  if (ev.lista_estado === 'BORRADOR') return 1
  if (ev.lista_estado === 'ENVIADA') return 2
  if (ev.lista_estado === 'SURTIDA') return 3
  if (ev.lista_estado === 'EN_EVENTO') return 4
  return 5
}

const STEP_COLORS = [
  'bg-red-500',
  'bg-orange-400',
  'bg-yellow-400',
  'bg-blue-400',
  'bg-purple-500',
  'bg-green-500',
]

function Pipeline({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1 mt-2">
      {PIPELINE_STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className="flex flex-col items-center">
            <div
              className={`w-3 h-3 rounded-full border-2 ${
                i <= step
                  ? `${STEP_COLORS[step]} border-transparent`
                  : 'bg-gray-200 border-gray-300'
              }`}
              title={label}
            />
          </div>
          {i < PIPELINE_STEPS.length - 1 && (
            <div className={`h-0.5 w-4 ${i < step ? STEP_COLORS[step] : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
      <span className="ml-2 text-xs text-gray-500">{PIPELINE_STEPS[step]}</span>
    </div>
  )
}

interface ModalAsignarProps {
  evento: Evento
  coordinadores: Coordinador[]
  onClose: () => void
  onGuardado: () => void
}

function ModalAsignar({ evento, coordinadores, onClose, onGuardado }: ModalAsignarProps) {
  const [coordinadorId, setCoordinadorId] = useState<number | ''>(
    evento.coordinador?.id ?? ''
  )
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    try {
      await api.post('/crm/animacion/asignar-coordinador/', {
        renta_id: evento.id,
        coordinador_id: coordinadorId || null,
      })
      onGuardado()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h3 className="font-semibold text-lg mb-1">Asignar coordinador</h3>
        <p className="text-sm text-gray-500 mb-4">{evento.folio} — {evento.cliente_nombre}</p>
        <select
          className="w-full border rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={coordinadorId}
          onChange={e => setCoordinadorId(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">— Sin asignar —</option>
          {coordinadores.map(c => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm border hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EventoCard({
  evento,
  onAsignar,
}: {
  evento: Evento
  onAsignar: (ev: Evento) => void
}) {
  const step = getPipelineStep(evento)
  const fecha = new Date(evento.fecha_renta + 'T12:00:00').toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4">
      <div className="flex justify-between items-start">
        <div>
          <span className="text-xs font-mono text-gray-400">{evento.folio}</span>
          <p className="font-semibold text-gray-800 leading-tight">{evento.cliente_nombre}</p>
          <p className="text-sm text-gray-500">{fecha}</p>
        </div>
        <button
          onClick={() => onAsignar(evento)}
          className="text-xs px-2 py-1 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50"
        >
          {evento.coordinador ? 'Cambiar' : 'Asignar'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1 mt-2">
        {evento.servicios.map((s, i) => (
          <span key={i} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
            {s}
          </span>
        ))}
      </div>

      <Pipeline step={step} />

      <div className="flex gap-4 mt-3 text-xs text-gray-500">
        {evento.coordinador ? (
          <span className="text-blue-700 font-medium">👤 {evento.coordinador.nombre}</span>
        ) : (
          <span className="text-red-500">Sin coordinador</span>
        )}
        {evento.animadores_count > 0 && (
          <span>🎭 {evento.animadores_count} animador{evento.animadores_count !== 1 ? 'es' : ''}</span>
        )}
      </div>
    </div>
  )
}

interface RankingEntry {
  id: number
  nombre: string
  total_eventos: number
}

function RankingTab() {
  const [año, setAño] = useState(new Date().getFullYear())
  const [coordinadores, setCoordinadores] = useState<RankingEntry[]>([])
  const [animadores, setAnimadores] = useState<RankingEntry[]>([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    setCargando(true)
    Promise.all([
      api.get(`/crm/rankings/?rol=coordinadores&año=${año}`),
      api.get(`/crm/rankings/?rol=animadores&año=${año}`),
    ])
      .then(([r1, r2]) => {
        setCoordinadores(r1.data)
        setAnimadores(r2.data)
      })
      .finally(() => setCargando(false))
  }, [año])

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-gray-600">Año</label>
        <input
          type="number"
          value={año}
          onChange={e => setAño(Number(e.target.value))}
          className="border rounded-lg px-3 py-1 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {cargando ? (
        <p className="text-sm text-gray-400">Cargando...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-gray-700 mb-3">Coordinadores</h3>
            {coordinadores.length === 0 ? (
              <p className="text-sm text-gray-400">Sin datos</p>
            ) : (
              <ol className="space-y-2">
                {coordinadores.map((c, i) => (
                  <li key={c.id} className="flex items-center gap-3 bg-white border rounded-lg px-4 py-2">
                    <span className="text-lg font-bold text-gray-300 w-6">{i + 1}</span>
                    <span className="flex-1 text-sm font-medium text-gray-800">{c.nombre}</span>
                    <span className="text-sm text-blue-600 font-semibold">{c.total_eventos} eventos</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-gray-700 mb-3">Animadores</h3>
            {animadores.length === 0 ? (
              <p className="text-sm text-gray-400">Sin datos</p>
            ) : (
              <ol className="space-y-2">
                {animadores.map((a, i) => (
                  <li key={a.id} className="flex items-center gap-3 bg-white border rounded-lg px-4 py-2">
                    <span className="text-lg font-bold text-gray-300 w-6">{i + 1}</span>
                    <span className="flex-1 text-sm font-medium text-gray-800">{a.nombre}</span>
                    <span className="text-sm text-purple-600 font-semibold">{a.total_eventos} eventos</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Animacion() {
  const [tab, setTab] = useState<'eventos' | 'rankings'>('eventos')
  const [eventos, setEventos] = useState<Evento[]>([])
  const [coordinadores, setCoordinadores] = useState<Coordinador[]>([])
  const [cargando, setCargando] = useState(false)
  const [modalEvento, setModalEvento] = useState<Evento | null>(null)

  const [filtroAño, setFiltroAño] = useState<string>(String(new Date().getFullYear()))
  const [filtroMes, setFiltroMes] = useState<string>('')

  function cargar() {
    setCargando(true)
    const params = new URLSearchParams()
    if (filtroAño) params.set('año', filtroAño)
    if (filtroMes) params.set('mes', filtroMes)
    api.get(`/crm/animacion/eventos/?${params}`)
      .then(r => setEventos(r.data))
      .finally(() => setCargando(false))
  }

  useEffect(() => {
    cargar()
    api.get('/crm/animacion/coordinadores/').then(r => setCoordinadores(r.data))
  }, [filtroAño, filtroMes])

  const hoy = new Date().toISOString().slice(0, 10)
  const sinCoordinador = eventos.filter(e => !e.coordinador).length
  const enPreparacion = eventos.filter(e => {
    const s = e.lista_estado
    return e.coordinador && (!s || s === 'BORRADOR' || s === 'ENVIADA' || s === 'SURTIDA')
  }).length
  const eventosHoy = eventos.filter(e => e.fecha_renta === hoy).length

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Animación</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b">
        {(['eventos', 'rankings'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'eventos' ? 'Eventos' : 'Rankings'}
          </button>
        ))}
      </div>

      {tab === 'eventos' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Año</label>
              <input
                type="number"
                value={filtroAño}
                onChange={e => setFiltroAño(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Mes</label>
              <select
                value={filtroMes}
                onChange={e => setFiltroMes(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Todos</option>
                {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m, i) => (
                  <option key={i+1} value={i+1}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white border rounded-xl p-3">
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-2xl font-bold text-gray-800">{eventos.length}</p>
            </div>
            <div className={`border rounded-xl p-3 ${sinCoordinador > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
              <p className="text-xs text-gray-400">Sin coordinador</p>
              <p className={`text-2xl font-bold ${sinCoordinador > 0 ? 'text-red-600' : 'text-gray-800'}`}>
                {sinCoordinador}
              </p>
            </div>
            <div className="bg-white border rounded-xl p-3">
              <p className="text-xs text-gray-400">En preparación</p>
              <p className="text-2xl font-bold text-blue-600">{enPreparacion}</p>
            </div>
            <div className="bg-white border rounded-xl p-3">
              <p className="text-xs text-gray-400">Hoy</p>
              <p className="text-2xl font-bold text-purple-600">{eventosHoy}</p>
            </div>
          </div>

          {/* Cards */}
          {cargando ? (
            <p className="text-sm text-gray-400">Cargando...</p>
          ) : eventos.length === 0 ? (
            <p className="text-sm text-gray-400">No hay eventos de animación en este periodo.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {eventos.map(ev => (
                <EventoCard key={ev.id} evento={ev} onAsignar={setModalEvento} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'rankings' && <RankingTab />}

      {modalEvento && (
        <ModalAsignar
          evento={modalEvento}
          coordinadores={coordinadores}
          onClose={() => setModalEvento(null)}
          onGuardado={() => { setModalEvento(null); cargar() }}
        />
      )}
    </div>
  )
}
