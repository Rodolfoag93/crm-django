import { useEffect } from 'react'
import api from './api'

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const outputArray = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

async function getVapidPublicKey(): Promise<string> {
  const { data } = await api.get('/push/vapid-key/')
  return data.vapid_public_key
}

async function registrarEnServidor(subJson: PushSubscriptionJSON) {
  await api.post('/push/suscribir/', {
    endpoint: subJson.endpoint,
    keys: {
      p256dh: subJson.keys?.p256dh,
      auth: subJson.keys?.auth,
    },
  })
}

async function suscribir() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  if (Notification.permission === 'denied') return

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return

  try {
    let registration = await navigator.serviceWorker.getRegistration('/sw.js')
    if (!registration) {
      registration = await navigator.serviceWorker.register('/sw.js')
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    const vapidKey = await getVapidPublicKey()
    const existing = await registration.pushManager.getSubscription()

    if (existing) {
      // Siempre re-registrar con el servidor: si el servidor borró la suscripción
      // (por un 410 anterior), esto la restaura sin crear una nueva en el navegador.
      await registrarEnServidor(existing.toJSON())
      return
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })
    await registrarEnServidor(subscription.toJSON())
  } catch (err: any) {
    console.error('Error push:', err?.response?.data || err?.message)
  }
}

export function usePushNotifications(isAuthenticated: boolean) {
  useEffect(() => {
    if (!isAuthenticated) return

    suscribir().catch(console.error)

    // El SW avisa cuando la suscripción cambia o expira
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_RESUBSCRIBED') {
        registrarEnServidor(event.data.subscription).catch(console.error)
      } else if (event.data?.type === 'PUSH_NEEDS_RESUBSCRIBE') {
        suscribir().catch(console.error)
      }
    }

    navigator.serviceWorker?.addEventListener('message', handleSwMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', handleSwMessage)
  }, [isAuthenticated])
}