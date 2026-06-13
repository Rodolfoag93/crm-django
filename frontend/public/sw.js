const CACHE_NAME = 'trotamundos-v1'
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

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        return response
      })
      .catch(() => caches.match(event.request))
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