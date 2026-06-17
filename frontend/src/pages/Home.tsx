import { useAuthStore } from '../stores/authStore'
import { useNavigate } from 'react-router-dom'
import { usePushNotifications } from '../lib/usePushNotifications'
import HomeAdmin from './HomeAdmin'
import HomeCoordinador from './coordinador/HomeCoordinador'
import HomeAnimador from './animador/HomeAnimador'

export default function Home() {
  const { user, logout, access_token } = useAuthStore()
  usePushNotifications(access_token)    
  const navigate = useNavigate()

  if (user?.es_admin) {
    return <HomeAdmin />
  }

  if (user?.es_coordinador && !user?.es_encargado_material) {
    return <HomeCoordinador />
  }

  if (user?.tipo_empleado == 'ANIMADOR') {
    return <HomeAnimador/>
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-5">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-green-300 text-sm">Bienvenido</p>
            <h1 className="text-xl font-bold">{user?.nombre}</h1>
          </div>
          <button
            onClick={handleLogout}
            className="bg-green-800 hover:bg-green-700 px-3 py-2 rounded-lg text-sm transition-colors"
          >
            Salir
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div className="p-4 space-y-4 max-w-lg mx-auto">

        {/* Checkin/Checkout */}
        <div
          onClick={() => navigate('/asistencia')}
          className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow border border-gray-100"
        >
          <div className="bg-green-100 p-3 rounded-xl text-2xl">⏰</div>
          <div>
            <h2 className="font-semibold text-gray-900">Asistencia</h2>
            <p className="text-gray-500 text-sm">Registra tu entrada y salida</p>
          </div>
          <div className="ml-auto text-gray-400">›</div>
        </div>

        {/* Entregas (cargadores) */}
        {user?.es_cargador && (
          <div
            onClick={() => navigate('/entregas')}
            className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow border border-gray-100"
          >
            <div className="bg-blue-100 p-3 rounded-xl text-2xl">🚚</div>
            <div>
              <h2 className="font-semibold text-gray-900">Mis Entregas</h2>
              <p className="text-gray-500 text-sm">Rentas asignadas hoy</p>
            </div>
            <div className="ml-auto text-gray-400">›</div>
          </div>
        )}

        {/* Eventos coordinador (encargado con doble rol) */}
        {user?.es_encargado_material && user?.es_coordinador && (
          <div
            onClick={() => navigate('/coordinador')}
            className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow border border-gray-100"
          >
            <div className="bg-purple-100 p-3 rounded-xl text-2xl">🎉</div>
            <div>
              <h2 className="font-semibold text-gray-900">Mis Eventos</h2>
              <p className="text-gray-500 text-sm">Eventos asignados</p>
            </div>
            <div className="ml-auto text-gray-400">›</div>
          </div>
        )}

        {user?.es_cargador && (
          <div
            onClick={() => navigate('/mantenimiento')}
            className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow border border-gray-100"
          >
            <div className="bg-green-100 p-3 rounded-xl text-2xl">🔧</div>
            <div>
              <h2 className="font-semibold text-gray-900">Mantenimiento</h2>
              <p className="text-gray-500 text-sm">Limpieza de brincolines</p>
            </div>
            <div className="ml-auto text-gray-400">›</div>
          </div>
        )}

        {/* Mi Nómina */}
        <div
          onClick={() => navigate('/nomina')}
          className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow border border-gray-100"
        >
          <div className="bg-yellow-100 p-3 rounded-xl text-2xl">💰</div>
          <div>
            <h2 className="font-semibold text-gray-900">Mi Nómina</h2>
            <p className="text-gray-500 text-sm">Consulta tus pagos</p>
          </div>
          <div className="ml-auto text-gray-400">›</div>
        </div>

        {/* Material (encargado) */}
        {user?.es_encargado_material && (
          <div
            onClick={() => navigate('/encargado')}
            className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow border border-gray-100"
          >
            <div className="bg-green-100 p-3 rounded-xl text-2xl">📦</div>
            <div>
              <h2 className="font-semibold text-gray-900">Material</h2>
              <p className="text-gray-500 text-sm">Listas de eventos</p>
            </div>
            <div className="ml-auto text-gray-400">›</div>
          </div>
        )}

        {/* Horas Extra */}
        <div
          onClick={() => navigate('/horas-extra')}
          className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow border border-gray-100"
        >
          <div className="bg-orange-100 p-3 rounded-xl text-2xl">⏱️</div>
          <div>
            <h2 className="font-semibold text-gray-900">Horas Extra</h2>
            <p className="text-gray-500 text-sm">Consulta tus horas y pagos</p>
          </div>
          <div className="ml-auto text-gray-400">›</div>
        </div>

      </div>
    </div>
  )
}