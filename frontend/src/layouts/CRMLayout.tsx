import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import PoweredByNexoo from '../components/PoweredByNexoo'

type NavItem = { to: string; label: string; icon: React.ReactNode; exact?: boolean }
type NavSection = { label: string; items: NavItem[] }

const Icon = ({ d, d2 }: { d: string; d2?: string }) => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
)

const navSections: NavSection[] = [
  {
    label: 'Principal',
    items: [
      { to: '/crm', label: 'Dashboard', exact: true, icon: <Icon d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" d2="M9 22V12h6v10" /> },
      { to: '/crm/rentas', label: 'Rentas', icon: <Icon d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" /> },
      { to: '/crm/cotizador', label: 'Cotizador', icon: <Icon d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" /> },
      { to: '/crm/clientes', label: 'Clientes', icon: <Icon d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /> },
      { to: '/crm/productos', label: 'Productos', icon: <Icon d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01" /> },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      { to: '/crm/rutas', label: 'Rutas', icon: <Icon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /> },
      { to: '/crm/empleados', label: 'Empleados', icon: <Icon d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" /> },
      { to: '/crm/nomina', label: 'Nómina', icon: <Icon d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" /> },
      { to: '/crm/animacion', label: 'Animación', icon: <Icon d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /> },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { to: '/crm/contabilidad', label: 'Contabilidad', icon: <Icon d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /> },
      { to: '/crm/gastos', label: 'Gastos', icon: <Icon d="M22 12h-4l-3 9L9 3l-3 9H2" /> },
      { to: '/crm/cuentas', label: 'Cuentas', icon: <Icon d="M1 4h22v16H1zM1 10h22" /> },
    ],
  },
  {
    label: 'Equipo',
    items: [
      { to: '/crm/rankings', label: 'Rankings', icon: <Icon d="M23 6L13.5 15.5 8.5 10.5 1 18M17 6h6v6" /> },
    ],
  },
]

const BREADCRUMB: Record<string, string> = {
  '/crm': 'Dashboard',
  '/crm/rentas': 'Rentas',
  '/crm/cotizador': 'Cotizador',
  '/crm/clientes': 'Clientes',
  '/crm/productos': 'Productos',
  '/crm/rutas': 'Rutas',
  '/crm/empleados': 'Empleados',
  '/crm/nomina': 'Nómina',
  '/crm/animacion': 'Animación',
  '/crm/contabilidad': 'Contabilidad',
  '/crm/gastos': 'Gastos',
  '/crm/cuentas': 'Cuentas',
  '/crm/rankings': 'Rankings',
}

export default function CRMLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const initials = user?.nombre
    ? user.nombre.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const pageTitle = BREADCRUMB[pathname] ?? 'CRM'

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f2f6f2' }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col flex-shrink-0 overflow-y-auto overflow-x-hidden"
        style={{ width: 220, background: '#0f3d22' }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 py-[18px]" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 32, height: 32, background: '#1e6b3e' }}>
            <svg width="16" height="16" fill="none" stroke="#4ade80" strokeWidth="2.2" viewBox="0 0 24 24">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-white" style={{ fontSize: 15, letterSpacing: '-0.3px' }}>Trota</div>
            <div style={{ fontSize: 11, color: '#5a9470', letterSpacing: '0.3px' }}>Panel Admin</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2">
          {navSections.map(section => (
            <div key={section.label} className="pb-1">
              <div
                className="px-4 pb-1.5 font-semibold uppercase tracking-wide"
                style={{ fontSize: 10, color: '#5a9470', paddingTop: 14 }}
              >
                {section.label}
              </div>
              {section.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.exact}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-4 py-2 text-sm transition-colors duration-100 border-l-2 ${
                      isActive
                        ? 'text-white border-[#4ade80]'
                        : 'border-transparent hover:text-white'
                    }`
                  }
                  style={({ isActive }) => ({
                    background: isActive ? '#1e6b3e' : 'transparent',
                    color: isActive ? '#fff' : '#a8d5b8',
                    fontSize: 13.5,
                  })}
                  onMouseEnter={e => { if (!(e.currentTarget as HTMLElement).classList.contains('active')) (e.currentTarget as HTMLElement).style.background = '#1a5c35' }}
                  onMouseLeave={e => { const isActive = pathname === item.to || (!item.exact && pathname.startsWith(item.to + '/')); if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User + Nexoo */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div
            className="flex items-center gap-2.5 px-4 py-3 cursor-pointer group"
            onClick={handleLogout}
            title="Cerrar sesión"
          >
            <div
              className="flex items-center justify-center rounded-full font-bold text-white flex-shrink-0"
              style={{ width: 30, height: 30, background: '#1e6b3e', fontSize: 11 }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate" style={{ fontSize: 12.5, color: '#a8d5b8', fontWeight: 500 }}>{user?.nombre ?? 'Admin'}</div>
              <div style={{ fontSize: 11, color: '#5a9470' }}>Administrador</div>
            </div>
            <svg width="13" height="13" fill="none" stroke="#5a9470" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0 group-hover:stroke-white transition-colors">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </div>
          <div className="px-3 pb-3">
            <PoweredByNexoo variant="dark" />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header
          className="flex items-center gap-3 px-6 flex-shrink-0 bg-white"
          style={{ height: 56, borderBottom: '1px solid #ddeadd' }}
        >
          <nav className="flex items-center gap-1.5 text-sm" style={{ color: '#8fa890' }}>
            <span>CRM</span>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
            <span className="font-semibold" style={{ color: '#162016' }}>{pageTitle}</span>
          </nav>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => navigate('/home')}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors"
              style={{ color: '#5a7060', borderColor: '#ddeadd', background: 'transparent', fontSize: 12 }}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 18.5l-7-7 7-7M5 11.5h14" /></svg>
              PWA
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex-1">
            <Outlet />
          </div>
          <footer className="flex-shrink-0 py-3 px-6" style={{ borderTop: '1px solid #e8f0e8' }}>
            <PoweredByNexoo variant="light" />
          </footer>
        </main>
      </div>
    </div>
  )
}
