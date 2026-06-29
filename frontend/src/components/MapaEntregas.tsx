import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../lib/api'

interface Parada {
  parada_id: number
  renta_id: number
  folio: string
  cliente: string
  telefono: string
  direccion: string
  hora_inicio: string | null
  estado: 'pendiente' | 'entregado' | 'recogido'
  lat: number | null
  lon: number | null
  repartidores: string[]
}

interface RepartidorActivo {
  id: number
  nombre: string
  lat: number | null
  lon: number | null
  ultima_ubicacion: string | null
}

const COLORES: Record<string, { fill: string; stroke: string; label: string }> = {
  pendiente: { fill: '#f97316', stroke: '#c2410c', label: 'Pendiente' },
  entregado: { fill: '#16a34a', stroke: '#15803d', label: 'Entregado' },
  recogido:  { fill: '#8b5cf6', stroke: '#6d28d9', label: 'Recogido'  },
}

function svgIcon(fill: string, stroke: string, num: number) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
      <path d="M16 0C7.16 0 0 7.16 0 16c0 10.5 16 24 16 24S32 26.5 32 16C32 7.16 24.84 0 16 0z"
            fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
      <text x="16" y="20" text-anchor="middle" dominant-baseline="middle"
            font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="white">
        ${num}
      </text>
    </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -42],
  })
}

function carIcon(nombre: string) {
  const inicial = nombre.charAt(0).toUpperCase()
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="19" fill="#1d4ed8" stroke="#1e3a8a" stroke-width="1.5"/>
      <text x="20" y="16" text-anchor="middle" dominant-baseline="middle"
            font-family="system-ui,sans-serif" font-size="14">🚚</text>
      <text x="20" y="30" text-anchor="middle" dominant-baseline="middle"
            font-family="system-ui,sans-serif" font-size="9" font-weight="700" fill="white">
        ${inicial}
      </text>
    </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
  })
}

function AjustarVista({ puntos }: { puntos: [number, number][] }) {
  const map = useMap()
  const first = useRef(true)
  useEffect(() => {
    if (!first.current || puntos.length === 0) return
    first.current = false
    if (puntos.length === 1) {
      map.setView(puntos[0], 14)
    } else {
      map.fitBounds(puntos, { padding: [40, 40] })
    }
  }, [puntos.length])
  return null
}

export default function MapaEntregas() {
  const [paradas, setParadas] = useState<Parada[]>([])
  const [repartidores, setRepartidores] = useState<RepartidorActivo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cargar = (inicial = false) => {
    api.get('/mapa-entregas/')
      .then(r => {
        setParadas(r.data.entregas ?? [])
        setRepartidores(r.data.repartidores ?? [])
      })
      .catch(() => { if (inicial) setError('No se pudo cargar el mapa.') })
      .finally(() => { if (inicial) setLoading(false) })
  }

  useEffect(() => {
    cargar(true)
    const id = setInterval(() => cargar(), 30_000)
    return () => clearInterval(id)
  }, [])

  const conCoords = paradas.filter(p => p.lat !== null && p.lon !== null)
  const puntos: [number, number][] = [
    ...conCoords.map(p => [p.lat!, p.lon!] as [number, number]),
    ...repartidores.filter(r => r.lat && r.lon).map(r => [r.lat!, r.lon!] as [number, number]),
  ]

  const counts = {
    pendiente: paradas.filter(p => p.estado === 'pendiente').length,
    entregado: paradas.filter(p => p.estado === 'entregado').length,
    recogido:  paradas.filter(p => p.estado === 'recogido').length,
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#ddeadd' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #ddeadd' }}>
        <span className="font-semibold text-sm" style={{ color: '#162016' }}>Mapa de entregas hoy</span>
        <div className="flex items-center gap-3">
          {(['pendiente', 'entregado', 'recogido'] as const).map(e => (
            <span key={e} className="flex items-center gap-1 text-xs" style={{ color: '#5a7060' }}>
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: COLORES[e].fill }} />
              {counts[e]} {COLORES[e].label.toLowerCase()}
            </span>
          ))}
          {repartidores.length > 0 && (
            <span className="flex items-center gap-1 text-xs" style={{ color: '#5a7060' }}>
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#1d4ed8' }} />
              {repartidores.length} en ruta
            </span>
          )}
        </div>
      </div>

      {/* Mapa */}
      <div style={{ height: 340, position: 'relative' }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#f8fbf8' }}>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: '#ddeadd', borderTopColor: '#16a34a' }} />
              <span className="text-sm" style={{ color: '#8fa890' }}>Cargando mapa…</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#f8fbf8' }}>
            <span className="text-sm" style={{ color: '#b91c1c' }}>{error}</span>
          </div>
        )}
        {!loading && !error && (
          <MapContainer
            center={[19.2433, -103.7241]}
            zoom={11}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <AjustarVista puntos={puntos} />

            {/* Pines de entregas */}
            {conCoords.map((p, i) => {
              const col = COLORES[p.estado] ?? COLORES.pendiente
              return (
                <Marker
                  key={p.parada_id}
                  position={[p.lat!, p.lon!]}
                  icon={svgIcon(col.fill, col.stroke, i + 1)}
                >
                  <Popup>
                    <div style={{ minWidth: 180, fontFamily: 'system-ui, sans-serif' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: '#162016' }}>
                        {p.cliente}
                      </div>
                      <div style={{ fontSize: 11, color: '#5a7060', marginBottom: 2 }}>{p.folio}</div>
                      <div style={{ fontSize: 11, color: '#5a7060', marginBottom: 2 }}>{p.direccion}</div>
                      {p.hora_inicio && (
                        <div style={{ fontSize: 11, color: '#5a7060', marginBottom: 4 }}>
                          🕐 {p.hora_inicio.slice(0, 5)}
                        </div>
                      )}
                      {p.repartidores.length > 0 && (
                        <div style={{ fontSize: 11, color: '#5a7060', marginBottom: 4 }}>
                          🚚 {p.repartidores.join(', ')}
                        </div>
                      )}
                      <span style={{
                        display: 'inline-block', fontSize: 10, fontWeight: 600,
                        padding: '2px 8px', borderRadius: 99,
                        background: col.fill + '22', color: col.stroke,
                      }}>
                        {col.label}
                      </span>
                    </div>
                  </Popup>
                </Marker>
              )
            })}

            {/* Marcadores de repartidores activos */}
            {repartidores.filter(r => r.lat && r.lon).map(r => (
              <Marker
                key={`rep-${r.id}`}
                position={[r.lat!, r.lon!]}
                icon={carIcon(r.nombre)}
              >
                <Popup>
                  <div style={{ minWidth: 140, fontFamily: 'system-ui, sans-serif' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: '#162016' }}>
                      🚚 {r.nombre}
                    </div>
                    {r.ultima_ubicacion && (
                      <div style={{ fontSize: 10, color: '#5a7060' }}>
                        Última señal: {new Date(r.ultima_ubicacion).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
        {!loading && !error && paradas.length > 0 && conCoords.length < paradas.length && (
          <div
            className="absolute bottom-2 left-2 z-[999] text-xs px-2 py-1 rounded"
            style={{ background: 'rgba(255,255,255,0.9)', color: '#8fa890', border: '1px solid #ddeadd' }}
          >
            {paradas.length - conCoords.length} entrega{paradas.length - conCoords.length !== 1 ? 's' : ''} sin geocodificar
          </div>
        )}
        {!loading && !error && paradas.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#f8fbf8' }}>
            <span className="text-sm" style={{ color: '#8fa890' }}>Sin entregas asignadas para hoy</span>
          </div>
        )}
      </div>
    </div>
  )
}
