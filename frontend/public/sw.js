const CACHE_NAME = 'trotamundos-v4'
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
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Estrategia: Network first, fallback a cache
self.addEventListener('fetch', (event) => {
  // No cachear llamadas a la API
  if (event.request.url.includes('/v1/')) {
    return
  }

  // Solo manejar GET
  if (event.request.method !== 'GET') {
    return
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Solo cachear respuestas válidas
        if (response && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          // Si no hay cache, devolver index.html para que React Router maneje la ruta
          return cached || caches.match('/index.html')
        })
      })
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