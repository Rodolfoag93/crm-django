import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../lib/api.ts'

interface User {
  id: number
  username: string
  nombre: string
  email: string
  es_admin: boolean
  grupos: string[]
  es_coordinador: boolean
  es_cargador: boolean
  es_encargado_material: boolean
  tipo_empleado: string | null
}

interface AuthState {
  user: User | null
  access_token: string | null
  refresh_token: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      access_token: null,
      refresh_token: null,
      isAuthenticated: false,

      login: async (username, password) => {
        const { data } = await api.post('/auth/token/', { username, password })
        localStorage.setItem('access_token', data.access)
        localStorage.setItem('refresh_token', data.refresh)
        set({
          access_token: data.access,
          refresh_token: data.refresh,
          isAuthenticated: true,
        })
        const me = await api.get('/auth/me/')
        set({ user: me.data })
      },

      logout: () => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        set({
          user: null,
          access_token: null,
          refresh_token: null,
          isAuthenticated: false,
        })
      },

      fetchMe: async () => {
        const { data } = await api.get('/auth/me/')
        set({ user: data })
      },
    }),
    {
      name: 'auth-storage',
    }
  )
)
