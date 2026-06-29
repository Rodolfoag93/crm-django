import { useEffect, useRef, useState } from 'react'
import api from '../lib/api'

interface Props {
  rentaId: number
  folio: string
  onClose: () => void
}

export default function TicketModal({ rentaId, folio, onClose }: Props) {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeH, setIframeH] = useState(600)

  useEffect(() => {
    api.get(`/rentas/${rentaId}/ticket/`, { responseType: 'text' })
      .then(r => setHtml(r.data))
      .catch(() => setError('No se pudo cargar el ticket.'))
  }, [rentaId])

  const handleLoad = () => {
    const h = iframeRef.current?.contentDocument?.body?.scrollHeight
    if (h && h > 100) setIframeH(Math.min(h + 32, window.innerHeight * 0.75))
  }

  // Abre el HTML como blob en ventana nueva → el usuario imprime con Ctrl+P
  // desde ahí el @media print y @page 80mm aplican sin interferencia del iframe
  const handlePrint = () => {
    if (!html) return
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) {
      win.onload = () => {
        win.focus()
        win.print()
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 'min(520px, 95vw)', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #ddeadd', flexShrink: 0 }}>
          <div>
            <div className="font-bold" style={{ fontSize: 16, color: '#162016' }}>Ticket de renta</div>
            <div className="text-xs mt-0.5" style={{ color: '#8fa890', fontFamily: 'monospace' }}>{folio}</div>
          </div>
          <div className="flex items-center gap-2">
            {html && (
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-lg"
                style={{ background: '#1a1a1a', color: 'white' }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <polyline points="6 9 6 2 18 2 18 9"/>
                  <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
                Imprimir
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg border text-sm"
              style={{ borderColor: '#ddeadd', color: '#5a7060' }}
            >×</button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ background: '#f0f4f0' }}>
          {!html && !error && (
            <div className="flex items-center justify-center py-20 gap-3">
              <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: '#ddeadd', borderTopColor: '#16a34a' }} />
              <span className="text-sm" style={{ color: '#8fa890' }}>Cargando ticket…</span>
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center py-20">
              <span className="text-sm" style={{ color: '#b91c1c' }}>{error}</span>
            </div>
          )}
          {html && (
            <iframe
              ref={iframeRef}
              srcDoc={html}
              onLoad={handleLoad}
              style={{ width: '100%', height: iframeH, border: 'none', display: 'block' }}
              title={`Ticket ${folio}`}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid #ddeadd', flexShrink: 0 }}>
          <button
            onClick={onClose}
            className="text-sm font-medium px-4 py-2 rounded-lg border"
            style={{ borderColor: '#ddeadd', color: '#5a7060' }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
