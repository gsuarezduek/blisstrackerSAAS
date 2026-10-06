// ─── Timeline de scores ───────────────────────────────────────────────────────

export default function ScoreTimeline({ audits }) {
  const completed = audits.filter(a => a.status === 'completed' && a.score != null)
  if (completed.length < 2) return null

  const pts = [...completed].reverse() // cronológico
  const W = 320, H = 80, PAD = 16
  const scores = pts.map(a => a.score)
  const minS = Math.min(...scores), maxS = Math.max(...scores)
  const range = maxS - minS || 1

  const toX = i  => PAD + (i / (pts.length - 1)) * (W - PAD * 2)
  const toY = s  => PAD + ((maxS - s) / range) * (H - PAD * 2)

  const pathD = pts.map((a, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(a.score)}`).join(' ')

  function dotColor(score) {
    if (score >= 86) return '#10b981'
    if (score >= 68) return '#22c55e'
    if (score >= 36) return '#f59e0b'
    return '#ef4444'
  }

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Evolución del score
      </p>
      <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
        <rect width={W} height={H} rx="8" className="fill-gray-50 dark:fill-gray-700/50" />
        <path d={pathD} fill="none" stroke="#f97316" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((a, i) => (
          <g key={a.id}>
            <circle cx={toX(i)} cy={toY(a.score)} r="4" fill={dotColor(a.score)} />
            <text x={toX(i)} y={H - 2} textAnchor="middle" fontSize="8" fill="#94a3b8">
              {new Date(a.createdAt).toLocaleDateString('es-AR', { month: 'short', day: '2-digit' })}
            </text>
            <text x={toX(i)} y={toY(a.score) - 7} textAnchor="middle" fontSize="9" fill="#374151" className="dark:fill-gray-200 font-medium">
              {a.score}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
