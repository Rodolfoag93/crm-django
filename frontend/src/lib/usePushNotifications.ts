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
  const res = await fetch('https://trotacrm.com/v1/push/vapid-key/')
  const data = await res.json()
  return data.vapid_public_key
}

async function suscribir(token: string) {
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
    if (existing) return

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })

    const subJson = subscription.toJSON()
    await api.post('/push/suscribir/', {
      endpoint: subJson.endpoint,
      keys: {
        p256dh: subJson.keys?.p256dh,
        auth: subJson.keys?.auth,
      },
    }, {
      headers: { Authorization: `Bearer ${token}` }
    })
  } catch (err: any) {
    console.error('Error push:', err?.response?.data || err?.message)
  }
}

export function usePushNotifications(token: string | null) {
  useEffect(() => {
    if (!token) return
    suscribir(token).catch(console.error)
  }, [token])
}