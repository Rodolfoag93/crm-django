import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Login from './pages/Login'
import Home from './pages/Home'
import Asistencia from './pages/Asistencia'
import Nomina from './pages/Nomina'
import NominaDetalle from './pages/NominaDetalle'
import Registro from './pages/Registro'
import HorasExtra from './pages/HorasExtra'
import Entregas from './pages/Entregas'
import Mantenimiento from './pages/Mantenimiento'
import RentasHoy from './pages/admin/RentasHoy'
import AsistenciaHoy from './pages/admin/AsistenciaHoy'
import RutasAdmin from './pages/admin/RutasAdmin'
import RutaDetalle from './pages/admin/RutaDetalle'
import NuevaRenta from './pages/admin/NuevaRenta'
import CrearGasto from './pages/admin/CrearGasto'
import AdminNominas from './pages/admin/AdminNominas'
import NuevaNomina from './pages/admin/NuevaNomina'
import Cotizador from './pages/admin/Cotizador'
import HomeCoordinador from './pages/coordinador/HomeCoordinador'
import EventoDetalle from './pages/coordinador/EventoDetalle'
import ListaMaterial from './pages/coordinador/ListaMaterial'
import CatalogoMateriales from './pages/coordinador/CatalogoMateriales'
import HomeEncargado from './pages/encargado/HomeEncargado'
import DetalleListaMaterial from './pages/encargado/DetalleListaMaterial'
import HomeAnimador from './pages/animador/HomeAnimador'
import EventoAnimador from './pages/animador/EventoAnimador'
import CalificarCoordinador from './pages/animador/CalificarCoordinador'
import RankingCoordinadores from './pages/RankingCoordinadores'
import ListaEventosAnimador from './pages/animador/ListaEventosAnimador'
import CalificarAnimador from './pages/coordinador/CalificarAnimador'
import CalificarEncargado from './pages/coordinador/CalificarEncargado'
import CalificarCoordinadorEncargado from './pages/encargado/CalificarCoordinador'
import OfflineBanner from './components/OfflineBanner'
import CRMLayout from './layouts/CRMLayout'
import Dashboard from './pages/crm/Dashboard'
import Rentas from './pages/crm/Rentas'
import Clientes from './pages/crm/Clientes'
import Rankings from './pages/crm/Rankings'
import Placeholder from './pages/crm/Placeholder'
import Gastos from './pages/crm/Gastos'
import Animacion from './pages/crm/Animacion'
import Productos from './pages/crm/Productos'
import Rutas from './pages/crm/Rutas'
import Empleados from './pages/crm/Empleados'
import NominaCRM from './pages/crm/Nomina'
import NuevaRentaCRM from './pages/crm/NuevaRenta'
import EditarRentaCRM from './pages/crm/EditarRenta'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />
}

function PrivateAdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" />
  if (!user?.es_admin) return <Navigate to="/home" />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <OfflineBanner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/registro" element={<Registro />} />
        <Route path="/home" element={
          <PrivateRoute><Home /></PrivateRoute>
        } />
        <Route path="/asistencia" element={
          <PrivateRoute><Asistencia /></PrivateRoute>
        } />
        <Route path="/nomina" element={
          <PrivateRoute><Nomina /></PrivateRoute>
        } />
        <Route path="/nomina/:id" element={
          <PrivateRoute><NominaDetalle /></PrivateRoute>
        } />
        <Route path="/horas-extra" element={
          <PrivateRoute><HorasExtra /></PrivateRoute>
        } />
        <Route path="/entregas" element={
          <PrivateRoute><Entregas /></PrivateRoute>
        } />
        <Route path="/mantenimiento" element={
          <PrivateRoute><Mantenimiento /></PrivateRoute>
        } />
        <Route path="/admin/rentas" element={
          <PrivateRoute><RentasHoy /></PrivateRoute>
        } />
        <Route path="/admin/asistencia" element={
          <PrivateRoute><AsistenciaHoy /></PrivateRoute>
        } />
        <Route path="/admin/rutas" element={
          <PrivateRoute><RutasAdmin /></PrivateRoute>
        } />
        <Route path="/admin/rutas/:id" element={
          <PrivateRoute><RutaDetalle /></PrivateRoute>
        } />
        <Route path="/admin/nueva-renta" element={
          <PrivateRoute><NuevaRenta /></PrivateRoute>
        } />
        <Route path="/admin/gastos/crear" element={
          <PrivateRoute><CrearGasto /></PrivateRoute>
        } />
        <Route path="/admin/nominas" element={
          <PrivateRoute><AdminNominas /></PrivateRoute>
        } />
        <Route path="/coordinador/animadores/:animadorEventoId/calificar" element={
          <PrivateRoute><CalificarAnimador /></PrivateRoute>
        } />
        <Route path="/coordinador/listas/:listaId/calificar-encargado" element={
          <PrivateRoute><CalificarEncargado /></PrivateRoute>
        } />
        <Route path="/encargado/listas/:id/calificar-coordinador" element={
          <PrivateRoute><CalificarCoordinadorEncargado /></PrivateRoute>
        } />
        <Route path="/admin/nominas/nueva" element={
          <PrivateRoute><NuevaNomina /></PrivateRoute>
        } />
        <Route path="/admin/nominas/:id" element={
          <PrivateRoute><NominaDetalle /></PrivateRoute>
        } />
        <Route path="/admin/cotizador" element={
          <PrivateRoute><Cotizador /></PrivateRoute>
        } />
        <Route path="/coordinador" element={
          <PrivateRoute><HomeCoordinador /></PrivateRoute>
        } />
        <Route path="/coordinador/eventos/:id" element={
          <PrivateRoute><EventoDetalle /></PrivateRoute>
        } />
        <Route path="/coordinador/eventos/:id/material" element={
          <PrivateRoute><ListaMaterial /></PrivateRoute>
        } />
        <Route path="/coordinador/catalogo" element={
          <PrivateRoute><CatalogoMateriales /></PrivateRoute>
        } />
        <Route path="/encargado" element={
          <PrivateRoute><HomeEncargado /></PrivateRoute>
        } />
        <Route path="/encargado/listas/:id" element={
          <PrivateRoute><DetalleListaMaterial /></PrivateRoute>
        } />
        <Route path="/animador" element={
          <PrivateRoute><HomeAnimador /></PrivateRoute>
        } />
        <Route path='/animador/eventos/:id' element={
          <PrivateRoute><EventoAnimador /></PrivateRoute>
        } />
        <Route path='/animador/eventos/:id/calificar' element={
          <PrivateRoute><CalificarCoordinador /></PrivateRoute>
        } />
        <Route path='/animador/ranking' element={
          <PrivateRoute><RankingCoordinadores /></PrivateRoute>
        } />
        <Route path='/coordinador/ranking' element={
          <PrivateRoute><RankingCoordinadores /></PrivateRoute>
        } />
        <Route path='/animador/eventos' element={
          <PrivateRoute><ListaEventosAnimador /></PrivateRoute>
        } />
        {/* CRM — admin only */}
        <Route path="/crm" element={<PrivateAdminRoute><CRMLayout /></PrivateAdminRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="rentas" element={<Rentas />} />
          <Route path="rentas/nueva" element={<NuevaRentaCRM />} />
          <Route path="rentas/:id/editar" element={<EditarRentaCRM />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="rankings" element={<Rankings />} />
          <Route path="productos" element={<Productos />} />
          <Route path="rutas" element={<Rutas />} />
          <Route path="empleados" element={<Empleados />} />
          <Route path="nomina" element={<NominaCRM />} />
          <Route path="animacion" element={<Animacion />} />
          <Route path="contabilidad" element={<Placeholder />} />
          <Route path="gastos" element={<Gastos />} />
          <Route path="cuentas" element={<Placeholder />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  )
}