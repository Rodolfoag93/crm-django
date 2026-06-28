import { useLocation } from 'react-router-dom'

const NAMES: Record<string, string> = {
  '/crm/productos': 'Productos',
  '/crm/rutas': 'Rutas',
  '/crm/empleados': 'Empleados',
  '/crm/nomina': 'Nómina',
  '/crm/animacion': 'Animación',
  '/crm/contabilidad': 'Contabilidad',
  '/crm/gastos': 'Gastos',
  '/crm/cuentas': 'Cuentas',
}

export default function Placeholder() {
  const { pathname } = useLocation()
  const name = NAMES[pathname] ?? 'Módulo'
  return (
    <div className="p-6 flex flex-col items-center justify-center" style={{ minHeight: 400 }}>
      <div className="text-center">
        <div style={{ fontSize: 40, marginBottom: 16 }}>🚧</div>
        <h2 className="font-bold mb-2" style={{ fontSize: 18, color: '#162016' }}>{name}</h2>
        <p className="text-sm" style={{ color: '#8fa890' }}>Este módulo estará disponible próximamente.</p>
      </div>
    </div>
  )
}
