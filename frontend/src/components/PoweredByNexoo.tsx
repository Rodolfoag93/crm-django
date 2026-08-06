type Props = {
  variant?: 'light' | 'dark'
  className?: string
}

/** Marca Nexoo al pie de pantallas CRM / impresos. */
export default function PoweredByNexoo({ variant = 'light', className = '' }: Props) {
  const muted = variant === 'dark' ? '#5a9470' : '#8fa890'
  const brand = variant === 'dark' ? '#c8e6d0' : '#0b1f3a'

  return (
    <div
      className={`flex items-center justify-center gap-1.5 select-none ${className}`}
      style={{ fontSize: 11, fontWeight: 600, color: muted, letterSpacing: '0.2px' }}
    >
      <img
        src="/nexoo.png"
        alt="Nexoo"
        width={14}
        height={14}
        style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: 3 }}
      />
      <span>
        powered by <span style={{ color: brand, fontWeight: 700 }}>nexoo</span>
      </span>
    </div>
  )
}
