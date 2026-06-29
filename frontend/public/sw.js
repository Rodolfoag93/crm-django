const CACHE_NAME = 'trotamundos-v7'
const API_CACHE = 'trotamundos-api-v2'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo2.png',
  '/favicon.ico',
]

// Instalar y cachear assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Limpiar caches viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  // Solo manejar GET
  if (event.request.method !== 'GET') return

  const url = event.request.url

  // Llamadas a la API: network first, guardar en cache, fallback a cache si offline
  // No cachear endpoints de autenticación
  if (url.includes('/v1/') && !url.includes('/v1/auth/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(API_CACHE).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => caches.match(event.request))
    )
    return
  }

  // Assets estáticos: network first, fallback a cache, último recurso index.html
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() =>
        caches.match(event.request).then((cached) =>
          cached || caches.match('/index.html')
        )
      )
  )
})

// ── Notificaciones Push ────────────────────────────────────────────────────────

self.addEventListener('push', function(event) {
    if (!event.data) return

    const data = event.data.json()

    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: data.url || '/' },
      })
    )
  })

  self.addEventListener('notificationclick', function(event) {
    event.notification.close()
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    )
  })

// Cuando la suscripción push rota (el navegador/OS la renueva automáticamente),
// re-suscribirse y guardar en el servidor directamente — sin depender de que la app esté abierta
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil((async () => {
        try {
            const subscription = await self.registration.pushManager.subscribe(
                event.oldSubscription.options
            )
            const subJson = subscription.toJSON()

            // Leer el token guardado en Cache Storage al hacer login
            const cache = await caches.open('sw-auth')
            const tokenResp = await cache.match('/sw-token')
            const token = tokenResp ? await tokenResp.text() : null
            if (!token) return // sin sesión activa, nada que hacer

            await fetch('/v1/push/suscribir/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    endpoint: subJson.endpoint,
                    keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
                }),
            })
        } catch {
            // Si falló (permiso revocado, token expirado, etc.), notificar a la app si está abierta
            const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            clientList.forEach(client => client.postMessage({ type: 'PUSH_NEEDS_RESUBSCRIBE' }))
        }
    })())
})
