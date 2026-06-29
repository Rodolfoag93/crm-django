import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/v1'

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Cola de peticiones que llegaron mientras se estaba refrescando el token
let isRefreshing = false
let queue: Array<(token: string) => void> = []

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    // Solo intentar refresh en 401 y solo una vez por petición
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    // Si ya hay un refresh en curso, encolar esta petición
    if (isRefreshing) {
      return new Promise((resolve) => {
        queue.push((newToken) => {
          original.headers.Authorization = `Bearer ${newToken}`
          resolve(api(original))
        })
      })
    }

    original._retry = true
    isRefreshing = true

    try {
      const refresh = localStorage.getItem('refresh_token')
      if (!refresh) throw new Error('sin refresh token')

      const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, { refresh })

      localStorage.setItem('access_token', data.access)
      if (data.refresh) localStorage.setItem('refresh_token', data.refresh)
      if ('caches' in window) {
        caches.open('sw-auth').then(c => c.put('/sw-token', new Response(data.access)))
      }

      // Resolver peticiones en cola con el token nuevo
      queue.forEach((cb) => cb(data.access))
      queue = []

      original.headers.Authorization = `Bearer ${data.access}`
      return api(original)
    } catch {
      // Refresh expirado o inválido — cerrar sesión
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      queue = []
      window.location.href = '/login'
      return Promise.reject(error)
    } finally {
      isRefreshing = false
    }
  }
)

export default api