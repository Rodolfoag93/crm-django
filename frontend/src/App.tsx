import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Login from './pages/Login'
import Home from './pages/Home'
import Asistencia from './pages/Asistencia'
import Nomina from './pages/Nomina'
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

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />
}

export default function App() {
  return (
    <BrowserRouter>
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
        <Route path="/horas-extra" element={
          <PrivateRoute><HorasExtra /></PrivateRoute>
        } />
        <Route path="/entregas" element={<Entregas />
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
        <Route path="/admin/nominas/nueva" element={
          <PrivateRoute><NuevaNomina /></PrivateRoute>
        } />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  )
}