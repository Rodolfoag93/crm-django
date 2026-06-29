import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../lib/api.ts'

function cachearTokenParaSW(token: string) {
  if ('caches' in window) {
    caches.open('sw-auth').then(c => c.put('/sw-token', new Response(token)))
  }
}

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
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      login: async (username, password) => {
        const { data } = await api.post('/auth/token/', { username, password })
        localStorage.setItem('access_token', data.access)
        localStorage.setItem('refresh_token', data.refresh)
        cachearTokenParaSW(data.access)
        set({ isAuthenticated: true })
        const me = await api.get('/auth/me/')
        set({ user: me.data })
      },

      logout: () => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        if ('caches' in window) caches.open('sw-auth').then(c => c.delete('/sw-token'))
        set({
          user: null,
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
