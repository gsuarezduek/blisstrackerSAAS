// Evolución del score GEO en el informe: un punto por mes (la última auditoría de cada mes),
// curva suave sobre franjas de las 4 bandas (Crítico/Base/Bueno/Excelente) y tooltip al pasar
// el mouse o tocar un punto. Se dibuja al ancho real del contenedor (sin estirar el SVG) para
// que texto y puntos mantengan sus proporciones; los valores quedan escritos sobre cada punto,
// así el PDF (sin hover) también se lee.
import { useEffect, useRef, useState } from 'react'

const BANDS = [
  { name: 'Crítico',   from: 0,  to: 36,  color: '#ef4444' },
  { name: 'Base',      from: 36, to: 68,  color: '#eab308' },
  { name: 'Bueno',     from: 68, to: 86,  color: '#22c55e' },
  { name: 'Excelente', from: 86, to: 100, color: '#3b82f6' },
]

export const geoBandOf = (score) => BANDS.find(b => score < b.to) || BANDS[BANDS.length - 1]

const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * Agrupa las auditorías por mes (se queda con la última de cada mes) y devuelve los últimos
 * `max` meses, de más antiguo a más reciente. Si todas caen en menos de 2 meses distintos
 * (ej. varias auditorías corridas en el mismo mes) devuelve una por auditoría, rotuladas por día.
 */
export function geoMonthlyPoints(history, max = 6) {
  const audits = (history || [])
    .filter(h => h?.score != null && h?.date)
    .map(h => ({ score: Math.round(h.score), date: new Date(h.date) }))
    .sort((a, b) => a.date - b.date)

  const byMonth = new Map()
  for (const a of audits) byMonth.set(`${a.date.getFullYear()}-${a.date.getMonth()}`, a) // la última pisa

  const toPoint = (a, perDay) => ({
    score: a.score,
    date:  a.date,
    short: perDay ? `${a.date.getDate()} ${MONTHS_SHORT[a.date.getMonth()]}` : MONTHS_SHORT[a.date.getMonth()],
    long:  perDay
      ? `${a.date.getDate()} de ${MONTHS_LONG[a.date.getMonth()]} ${a.date.getFullYear()}`
      : `${MONTHS_LONG[a.date.getMonth()][0].toUpperCase()}${MONTHS_LONG[a.date.getMonth()].slice(1)} ${a.date.getFullYear()}`,
    perDay,
  })

  if (byMonth.size >= 2) return [...byMonth.values()].slice(-max).map(a => toPoint(a, false))
  return audits.slice(-max).map(a => toPoint(a, true))
}

// Curva monótona (Fritsch–Carlson): suave pero sin "pasarse" por encima/debajo de los puntos.
function smoothPath(pts) {
  if (pts.length < 2) return ''
  const n = pts.length
  const dx = [], m = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x)
    m.push((pts[i + 1].y - pts[i].y) / dx[i])
  }
  const t = [m[0]]
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2)
  t.push(m[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i] }
  }
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C ${pts[i].x + h} ${pts[i].y + t[i] * h}, ${pts[i + 1].x - h} ${pts[i + 1].y - t[i + 1] * h}, ${pts[i + 1].x} ${pts[i + 1].y}`
  }
  return d
}

const HEIGHT = 190
const PAD = { top: 22, right: 64, bottom: 28, left: 14 }

export default function GeoScoreChart({ history, color = '#3b82f6' }) {
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(560)
  const [active, setActive] = useState(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => { if (el.clientWidth) setWidth(el.clientWidth) }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const points = geoMonthlyPoints(history)
  if (points.length < 2) return null

  // Dominio Y "con zoom" (a decenas) para que se note la variación; las bandas se recortan a él.
  const scores = points.map(p => p.score)
  const lo = Math.max(0, Math.floor((Math.min(...scores) - 8) / 10) * 10)
  const hi = Math.min(100, Math.ceil((Math.max(...scores) + 8) / 10) * 10)
  const plotW = Math.max(width - PAD.left - PAD.right, 120)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const yFor = (v) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH
  const step = plotW / (points.length - 1)
  const coords = points.map((p, i) => ({ ...p, x: PAD.left + step * i, y: yFor(p.score) }))
  const line = smoothPath(coords)
  const area = `${line} L ${coords[coords.length - 1].x} ${PAD.top + plotH} L ${coords[0].x} ${PAD.top + plotH} Z`
  const last = coords.length - 1
  const gradId = `geo-area-${color.replace('#', '')}`

  const act = active != null ? coords[active] : null
  const prev = active > 0 ? coords[active - 1] : null
  const diff = act && prev ? act.score - prev.score : null
  const actBand = act ? geoBandOf(act.score) : null
  // Tooltip: centrado sobre el punto, sin salirse del contenedor
  const TIP_W = 176
  const tipLeft = act ? Math.min(Math.max(act.x - TIP_W / 2, 0), width - TIP_W) : 0
  const tipBelow = act && act.y < 92

  return (
    <div ref={wrapRef} className="relative select-none" onMouseLeave={() => setActive(null)}>
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="block max-w-full overflow-visible" role="img"
        aria-label={`Score GEO por mes: ${points.map(p => `${p.long} ${p.score}`).join(', ')}`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Franjas de bandas + rótulo a la derecha */}
        {BANDS.filter(b => b.to > lo && b.from < hi).map(b => {
          const y1 = yFor(Math.min(b.to, hi))
          const y2 = yFor(Math.max(b.from, lo))
          return (
            <g key={b.name}>
              <rect x={PAD.left} y={y1} width={plotW} height={y2 - y1} fill={b.color} fillOpacity="0.06" />
              {b.from > lo && (
                <line x1={PAD.left} x2={PAD.left + plotW} y1={y2} y2={y2} stroke={b.color} strokeOpacity="0.35" strokeDasharray="3 4" />
              )}
              {y2 - y1 >= 14 && (
                <text x={PAD.left + plotW + 10} y={(y1 + y2) / 2} dominantBaseline="middle" fontSize="10.5" fontWeight="600" fill={b.color} fillOpacity="0.85">
                  {b.name}
                </text>
              )}
            </g>
          )
        })}

        {/* Guía vertical del punto activo */}
        {act && (
          <line x1={act.x} x2={act.x} y1={PAD.top} y2={PAD.top + plotH} stroke="currentColor" strokeDasharray="2 3" className="text-gray-300 dark:text-gray-600" />
        )}

        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {coords.map((c, i) => {
          const isActive = i === active
          const isLast = i === last
          return (
            <g key={i}>
              <text x={c.x} y={c.y - 11} textAnchor="middle" fontSize={isLast ? 12 : 10.5} fontWeight={isLast || isActive ? 700 : 500}
                fill={isLast || isActive ? color : undefined} className={isLast || isActive ? undefined : 'fill-gray-500 dark:fill-gray-400'}>
                {c.score}
              </text>
              <circle cx={c.x} cy={c.y} r={isActive ? 6.5 : isLast ? 5.5 : 4} fill={isLast || isActive ? color : 'white'}
                stroke={isLast || isActive ? 'white' : color} strokeWidth={isLast || isActive ? 2.5 : 2}
                className={isLast || isActive ? undefined : 'dark:fill-gray-800'} />
              <text x={c.x} y={HEIGHT - 8} textAnchor="middle" fontSize="11" fontWeight={isLast || isActive ? 700 : 400}
                className={isLast || isActive ? 'fill-gray-800 dark:fill-gray-100' : 'fill-gray-400 dark:fill-gray-500'}>
                {c.short}
              </text>
            </g>
          )
        })}

        {/* Zonas de hover/tap: una columna completa por punto (más fácil de apuntar que el círculo) */}
        {coords.map((c, i) => (
          <rect
            key={`hit-${i}`}
            x={i === 0 ? 0 : c.x - step / 2} y={0}
            width={i === 0 || i === last ? step / 2 + PAD.left : step} height={HEIGHT}
            fill="transparent"
            className="cursor-pointer outline-none"
            tabIndex={0}
            aria-label={`${c.long}: ${c.score} de 100`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            onClick={() => setActive(i)}
          />
        ))}
      </svg>

      {act && (
        <div
          className="no-print pointer-events-none absolute z-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 shadow-lg px-3 py-2"
          style={{ left: tipLeft, width: TIP_W, top: tipBelow ? act.y + 14 : act.y - 14, transform: tipBelow ? undefined : 'translateY(-100%)' }}
          role="tooltip"
        >
          <p className="text-xs font-semibold text-gray-900 dark:text-white">{act.long}</p>
          <p className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-lg font-bold leading-none" style={{ color: actBand.color }}>{act.score}</span>
            <span className="text-xs text-gray-400">/ 100</span>
            <span className="ml-auto text-[11px] font-semibold" style={{ color: actBand.color }}>{actBand.name}</span>
          </p>
          {diff != null && (
            <p className={`text-[11px] mt-1 font-medium ${diff > 0 ? 'text-green-600 dark:text-green-400' : diff < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'}`}>
              {diff > 0 ? '↑' : diff < 0 ? '↓' : '='} {diff !== 0 ? `${Math.abs(diff)} pts ` : ''}vs. {prev.perDay ? prev.short : MONTHS_LONG[prev.date.getMonth()]}
            </p>
          )}
          {!act.perDay && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              Auditoría del {act.date.getDate()} de {MONTHS_LONG[act.date.getMonth()]}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
