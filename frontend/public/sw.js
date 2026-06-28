const CACHE_NAME = 'trotamundos-v5'
const API_CACHE = 'trotamundos-api-v1'
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

// Cuando el servicio push invalida la suscripción (expira o se revoca),
// re-suscribirse y avisar a las ventanas abiertas para que actualicen el servidor
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil((async () => {
        try {
            const subscription = await self.registration.pushManager.subscribe(
                event.oldSubscription.options
            )
            const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            clientList.forEach(client => client.postMessage({
                type: 'PUSH_RESUBSCRIBED',
                subscription: subscription.toJSON(),
            }))
        } catch {
            // No se pudo re-suscribir (permiso revocado, etc.)
            const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            clientList.forEach(client => client.postMessage({ type: 'PUSH_NEEDS_RESUBSCRIBE' }))
        }
    })())
})
