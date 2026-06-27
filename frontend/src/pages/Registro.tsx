import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import api from '../lib/api.ts'

const schema = z.object({
  nombre: z.string().min(3, 'El nombre es requerido'),
  telefono: z.string().min(10, 'Teléfono debe tener 10 dígitos'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  confirmar_password: z.string(),
  tipo_empleado: z.enum(['REPARTIDOR', 'COORDINADOR', 'ENCARGADO', 'ANIMADOR']),
}).refine((data) => data.password === data.confirmar_password, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmar_password'],
})

type FormData = z.infer<typeof schema>

export default function Registro() {
  const navigate = useNavigate()
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tipo_empleado: 'REPARTIDOR' }
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setError('')
    try {
      await api.post('/registro/', {
        nombre: data.nombre,
        telefono: data.telefono,
        email: data.email || '',
        password: data.password,
        tipo_empleado: data.tipo_empleado,
      })
      setEnviado(true)
    } catch (e: any) {
      setError(e.response?.data?.telefono?.[0] || 'Error al enviar solicitud')
    } finally {
      setLoading(false)
    }
  }

  if (enviado) {
    return (
      <div className="min-h-screen bg-green-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-green-900 mb-2">¡Solicitud enviada!</h1>
          <p className="text-gray-500 mb-6">
            Tu solicitud fue enviada correctamente. El administrador revisará tu información y te dará acceso pronto.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Volver al login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-green-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">

        {/* Header */}
        <div className="text-center mb-6">
          <img src="/logo2.png" alt="Trotamundos" className="w-20 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-green-900">Solicitar Acceso</h1>
          <p className="text-gray-500 text-sm mt-1">Llena el formulario y espera aprobación</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
            <input
              {...register('nombre')}
              type="text"
              placeholder="Tu nombre completo"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
            <input
              {...register('telefono')}
              type="tel"
              placeholder="3121234567"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {errors.telefono && <p className="text-red-500 text-xs mt-1">{errors.telefono.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email (opcional)</label>
            <input
              {...register('email')}
              type="email"
              placeholder="tu@email.com"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
            <select
              {...register('tipo_empleado')}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="REPARTIDOR">Repartidor</option>
              <option value="COORDINADOR">Coordinador</option>
              <option value="ENCARGADO">Encargado de Material</option>
              <option value="ANIMADOR">Animador</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input
              {...register('password')}
              type="password"
              placeholder="Mínimo 6 caracteres"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña</label>
            <input
              {...register('confirmar_password')}
              type="password"
              placeholder="Repite tu contraseña"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {errors.confirmar_password && <p className="text-red-500 text-xs mt-1">{errors.confirmar_password.message}</p>}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? 'Enviando...' : 'Solicitar acceso'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button onClick={() => navigate('/login')} className="text-green-700 text-sm hover:underline">
            ← Volver al login
          </button>
        </div>

      </div>
    </div>
  )
}