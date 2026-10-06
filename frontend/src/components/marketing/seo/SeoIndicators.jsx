// ─── Sparkline SVG ────────────────────────────────────────────────────────────
export function Sparkline({ history }) {
  const points = history.filter(h => h.position !== null)
  if (points.length < 2) return <span className="text-xs text-gray-300 dark:text-gray-600">—</span>

  const positions = points.map(p => p.position)
  const min = Math.min(...positions)
  const max = Math.max(...positions)
  const range = max - min || 1
  const W = 60, H = 20

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W
    const y = ((p.position - min) / range) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const last  = points[points.length - 1].position
  const first = points[0].position
  const color = last < first ? '#22c55e' : last > first ? '#ef4444' : '#94a3b8'

  return (
    <svg width={W} height={H} className="overflow-visible inline-block align-middle">
      <polyline points={coords.join(' ')} fill="none" stroke={color}
        strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ─── Delta badge ──────────────────────────────────────────────────────────────
export function DeltaBadge({ delta }) {
  if (delta == null || Math.abs(delta) < 0.5) return null
  const improved = delta < 0
  return (
    <span className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
      improved ? 'text-green-600 bg-green-50 dark:bg-green-900/30'
               : 'text-red-500 bg-red-50 dark:bg-red-900/30'
    }`}>
      {improved ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}
    </span>
  )
}
