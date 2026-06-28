import { useEffect, useState } from 'react'

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [justReconnected, setJustReconnected] = useState(false)

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true)
      setJustReconnected(true)
      setTimeout(() => setJustReconnected(false), 3000)
    }
    const goOffline = () => {
      setIsOnline(false)
      setJustReconnected(false)
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (isOnline && !justReconnected) return null

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 text-center text-xs py-2 font-medium ${
      isOnline ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'
    }`}>
      {isOnline
        ? '✓ Conexión restaurada'
        : '📶 Sin conexión — mostrando datos guardados'}
    </div>
  )
}
