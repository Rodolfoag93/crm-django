import { useNavigate } from 'react-router-dom'
import MaterialCatalogoPanel from '../../components/MaterialCatalogoPanel'
import { useAuthStore } from '../../stores/authStore'

export default function CatalogoMateriales() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const puedeEditar = !!user?.es_admin || !!user?.es_encargado_material

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-green-900 text-white px-4 py-5 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-green-300 text-xl">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Catálogo de Material</h1>
          <p className="text-green-300 text-xs">
            {puedeEditar ? 'Toca la miniatura para ampliar · ✎ o + para foto' : 'Solo consulta'}
          </p>
        </div>
      </div>
      <div className="p-4 max-w-lg mx-auto">
        <MaterialCatalogoPanel puedeEditar={puedeEditar} variant="pwa" />
      </div>
    </div>
  )
}
