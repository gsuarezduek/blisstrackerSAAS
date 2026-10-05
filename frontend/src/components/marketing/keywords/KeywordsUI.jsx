import { SERP_FEATURE_LABELS, COUNTRIES, countryLabel } from './keywordsHelpers'

// Piezas de UI chicas y reutilizadas en la pestaña Keywords: badge de feature
// SERP, mini gráfico de posición, badge GEO y el selector de país.

// ─── SerpFeatureBadge ─────────────────────────────────────────────────────────

export function SerpFeatureBadge({ feature }) {
  const meta = SERP_FEATURE_LABELS[feature]
  if (!meta) return null
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  )
}

// ─── Mini gráfico SVG de posición ─────────────────────────────────────────────

export function PositionChart({ rankings }) {
  if (!rankings?.length || rankings.every(r => r.position === 0)) return null

  const validRankings = rankings.filter(r => r.position > 0)
  if (validRankings.length < 2) return null

  const W = 280, H = 80, PAD = 12
  const positions = validRankings.map(r => r.position)
  const minPos = Math.min(...positions)
  const maxPos = Math.max(...positions)
  const range  = maxPos - minPos || 1

  // Eje Y invertido: posición baja (mejor) = arriba
  const toY = pos => PAD + ((pos - minPos) / range) * (H - PAD * 2)
  const toX = i   => PAD + (i / (validRankings.length - 1)) * (W - PAD * 2)

  const pts = validRankings.map((r, i) => `${toX(i)},${toY(r.position)}`).join(' ')

  return (
    <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
      <rect width={W} height={H} rx="6" className="fill-gray-50 dark:fill-gray-700/50" />
      <polyline
        points={pts}
        fill="none"
        className="stroke-primary-500"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {validRankings.map((r, i) => (
        <g key={r.month}>
          <circle cx={toX(i)} cy={toY(r.position)} r="3.5" className="fill-primary-500" />
          <text x={toX(i)} y={H - 2} textAnchor="middle" fontSize="8" className="fill-gray-400 dark:fill-gray-500">
            {r.month.slice(5)}
          </text>
          <text x={toX(i)} y={toY(r.position) - 6} textAnchor="middle" fontSize="9" className="fill-gray-600 dark:fill-gray-300 font-medium">
            {r.position.toFixed(1)}
          </text>
        </g>
      ))}
    </svg>
  )
}

// ─── Badge GEO ────────────────────────────────────────────────────────────────

export function GeoBadge({ level }) {
  if (!level) return null
  const map = {
    alto:  { dot: 'bg-green-500',  text: 'text-green-700 dark:text-green-400',   bg: 'bg-green-50 dark:bg-green-900/20',   label: 'Alto' },
    medio: { dot: 'bg-yellow-500', text: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20', label: 'Medio' },
    bajo:  { dot: 'bg-red-500',    text: 'text-red-700 dark:text-red-400',       bg: 'bg-red-50 dark:bg-red-900/20',       label: 'Bajo' },
  }
  const s = map[level] ?? map.bajo
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      GEO {s.label}
    </span>
  )
}

// ─── Selector de país ─────────────────────────────────────────────────────────

export function CountrySelector({ country, integrationCountry, onChange, onSaveDefault, savingDefault }) {
  const isLive = country !== integrationCountry

  return (
    <div className="flex items-center gap-2">
      <select
        value={country}
        onChange={e => onChange(e.target.value)}
        className="text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {COUNTRIES.map(c => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>

      {isLive && (
        <>
          <span className="text-[10px] font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-full">
            En vivo
          </span>
          <button
            onClick={onSaveDefault}
            disabled={savingDefault}
            className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors disabled:opacity-50 whitespace-nowrap"
            title={`Guardar ${countryLabel(country)} como país predeterminado`}
          >
            {savingDefault ? 'Guardando…' : 'Guardar como predeterminado'}
          </button>
        </>
      )}

      {!isLive && (
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          predeterminado
        </span>
      )}
    </div>
  )
}
