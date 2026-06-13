import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import api from '../lib/api'

interface DashboardData {
  pedidos: { total: number; por_enviar: number; enviados: number }
  rutas: { total: number; pendientes: number; en_camino: number }
  asistencia: { con_entrada: number; con_salida: number }
  solicitudes_pendientes: number
}

export default function HomeAdmin() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/dashboard/admin/')
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

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
            <p className="text-green-300 text-sm">Admin</p>
            <h1 className="text-xl font-bold">{user?.nombre}</h1>
          </div>
          <button
            onClick={handleLogout}
            className="bg-green-800 hover:bg-green-700 px-3 py-2 rounded-lg text-sm"
          >
            Salir
          </button>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4">

        {/* Resumen del día */}
        {!loading && data && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <h2 className="font-bold text-gray-700 mb-3">📊 Resumen de hoy</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center bg-blue-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-blue-700">{data.pedidos.total}</p>
                <p className="text-xs text-blue-600">Pedidos</p>
              </div>
              <div className="text-center bg-yellow-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-yellow-700">{data.pedidos.por_enviar}</p>
                <p className="text-xs text-yellow-600">Por enviar</p>
              </div>
              <div className="text-center bg-green-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-green-700">{data.pedidos.enviados}</p>
                <p className="text-xs text-green-600">Enviados</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="text-center bg-orange-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-orange-700">{data.rutas.total}</p>
                <p className="text-xs text-orange-600">Rutas hoy</p>
              </div>
              <div className="text-center bg-purple-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-purple-700">{data.asistencia.con_entrada}</p>
                <p className="text-xs text-purple-600">Asistencias</p>
              </div>
            </div>
          </div>
        )}

        {/* Solicitudes pendientes */}
        {data && data.solicitudes_pendientes > 0 && (
          <div
            onClick={() => navigate('/admin/solicitudes')}
            className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 cursor-pointer"
          >
            <span className="text-2xl">🔔</span>
            <div>
              <p className="font-semibold text-red-700">Solicitudes pendientes</p>
              <p className="text-sm text-red-500">{data.solicitudes_pendientes} empleado(s) esperando aprobación</p>
            </div>
            <div className="ml-auto text-red-400">›</div>
          </div>
        )}

        {/* Cards de navegación */}
        <div className="grid grid-cols-2 gap-3">

          <div onClick={() => navigate('/admin/rentas')}
            className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center gap-2 cursor-pointer border border-gray-100 hover:shadow-md transition-shadow">
            <span className="text-3xl">📦</span>
            <p className="font-semibold text-gray-900 text-sm">Rentas</p>
            <p className="text-xs text-gray-400 text-center">Ver pedidos del día</p>
          </div>

          <div onClick={() => navigate('/admin/rutas')}
            className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center gap-2 cursor-pointer border border-gray-100 hover:shadow-md transition-shadow">
            <span className="text-3xl">🚚</span>
            <p className="font-semibold text-gray-900 text-sm">Rutas</p>
            <p className="text-xs text-gray-400 text-center">Gestionar entregas</p>
          </div>

          <div onClick={() => navigate('/admin/asistencia')}
            className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center gap-2 cursor-pointer border border-gray-100 hover:shadow-md transition-shadow">
            <span className="text-3xl">👥</span>
            <p className="font-semibold text-gray-900 text-sm">Asistencia</p>
            <p className="text-xs text-gray-400 text-center">Control del día</p>
          </div>

          <div onClick={() => navigate('/admin/gasto')}
            className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center gap-2 cursor-pointer border border-gray-100 hover:shadow-md transition-shadow">
            <span className="text-3xl">💸</span>
            <p className="font-semibold text-gray-900 text-sm">Registrar gasto</p>
            <p className="text-xs text-gray-400 text-center">Nuevo gasto</p>
          </div>

          <div onClick={() => navigate('/admin/cotizador')}
            className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center gap-2 cursor-pointer border border-gray-100 hover:shadow-md transition-shadow">
            <span className="text-3xl">🧮</span>
            <p className="font-semibold text-gray-900 text-sm">Cotizador</p>
            <p className="text-xs text-gray-400 text-center">Calcular precio</p>
          </div>

          <div onClick={() => navigate('/admin/nueva-renta')}
            className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center gap-2 cursor-pointer border border-gray-100 hover:shadow-md transition-shadow">
            <span className="text-3xl">➕</span>
            <p className="font-semibold text-gray-900 text-sm">Nueva renta</p>
            <p className="text-xs text-gray-400 text-center">Crear pedido</p>
          </div>

        </div>
      </div>
    </div>
  )
}