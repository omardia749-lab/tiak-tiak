export function LogoIcon({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 400 400">
      <rect width="400" height="400" rx="88" fill="#FFFFFF" />
      <rect x="70" y="84" width="136" height="66" rx="20" fill="#0F5138" />
      <rect x="194" y="84" width="136" height="66" rx="20" fill="#1DB954" />
      <polygon points="172,140 228,140 200,330" fill="#0F5138" />
    </svg>
  )
}

export function LogoWordmark({ size = 40, onDark = true }: { size?: number; onDark?: boolean }) {
  const base = onDark ? '#FFFFFF' : '#0F5138'
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      fontFamily: '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
      fontWeight: 800,
      fontSize: size,
      letterSpacing: '-1px',
      lineHeight: 1,
    }}>
      <span style={{ color: base }}>tiak</span>
      <span style={{
        display: 'inline-block',
        width: size * 0.14,
        height: size * 0.14,
        borderRadius: '50%',
        background: '#1DB954',
        margin: `0 ${size * 0.06}px`,
        transform: `translateY(-${size * 0.05}px)`,
      }} />
      <span style={{ color: base }}>tiak</span>
    </div>
  )
}