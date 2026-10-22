// "Comparar con meses anteriores": serie de los últimos meses por sección del informe.
// Los datos vienen en `data.history` (backend: services/monthlyReport/history.js) y llegan
// por contexto desde ReportViewer, así cada SectionCard solo pone <SectionHistory sectionKey=…/>.
// SVG propio, sin hover obligatorio: valores y flechas siempre visibles (se ven igual en el PDF).
import { createContext, useContext, useState } from 'react'
import { fmt } from './ReportViewerParts'

export const ReportHistoryContext = createContext({ history: null, brandPrimary: '#f97316', printMode: false })

// ── Helpers (puros, testeados) ────────────────────────────────────────────────

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function historyMonthLabel(month, withYear = false) {
  const [y, m] = month.split('-').map(Number)
  return withYear ? `${MONTHS_ES[m - 1]} ${String(y).slice(2)}` : MONTHS_ES[m - 1]
}

// Valor compacto para la etiqueta de la barra (el ancho por mes es chico)
export function formatHistoryValue(v, format) {
  if (v == null) return '—'
  if (format === 'percent') return `${fmt(v, 2)}%`
  if (format === 'decimal') return fmt(v, 1)
  const abs = Math.abs(v)
  const compact = abs >= 1e6 ? `${fmt(v / 1e6, 1)}M` : abs >= 1e4 ? `${fmt(v / 1e3, 1)}k` : fmt(v)
  return format === 'money' ? `$${compact}` : compact
}

// Cambio contra el mes anterior. Tasas y posiciones → diferencia absoluta (en puntos);
// volúmenes → % (salvo que el mes anterior sea ≤ 0, ej. "seguidores nuevos" negativo: ahí absoluta).
export function historyDelta(curr, prev, metric) {
  if (curr == null || prev == null) return null
  const diff = curr - prev
  if (diff === 0) return { dir: 0, good: null, text: '=' }
  const dir  = diff > 0 ? 1 : -1
  const good = metric.invert ? dir < 0 : dir > 0
  const arrow = dir > 0 ? '↑' : '↓'
  if (metric.format === 'percent') return { dir, good, text: `${arrow}${fmt(Math.abs(diff), 1)} pts` }
  if (metric.format === 'decimal') return { dir, good, text: `${arrow}${fmt(Math.abs(diff), 1)}` }
  if (prev <= 0) return { dir, good, text: `${arrow}${formatHistoryValue(Math.abs(diff), metric.format)}` }
  const pct = Math.abs(diff / prev * 100)
  return { dir, good, text: `${arrow}${pct >= 100 ? fmt(pct) : fmt(pct, 1)}%` }
}

// ¿El mes resaltado es el mejor de la serie? (solo si hay ≥3 meses con dato, si no es trivial)
export function isBestMonth(values, index, invert = false) {
  const known = values.filter(v => v != null)
  if (known.length < 3 || values[index] == null) return false
  const best = invert ? Math.min(...known) : Math.max(...known)
  return values[index] === best && known.filter(v => v === best).length === 1
}

// ── Gráfico ──────────────────────────────────────────────────────────────────

const W = 320
const H = 150
const PAD_X = 6
const TOP = 16      // espacio para la etiqueta de valor sobre la barra más alta
const PLOT_BOTTOM = 112
const LABEL_Y = 126
const DELTA_Y = 141

export function HistoryChart({ months, metric, highlight = [], partialMonth = null, color = '#f97316' }) {
  const values = metric.values
  const n = months.length
  const slot = (W - PAD_X * 2) / n
  const cx = (i) => PAD_X + slot * i + slot / 2
  const spansYears = new Set(months.map(m => m.slice(0, 4))).size > 1
  const isHi = (i) => highlight.includes(months[i])

  const known = values.filter(v => v != null)
  const isLine = metric.chart === 'line'

  // Escala: barras desde 0 (admite negativos: "seguidores nuevos" puede bajar);
  // línea con rango min–max para que se note la variación de una tasa.
  let yFor
  let baseline = PLOT_BOTTOM
  if (isLine) {
    const min = Math.min(...known)
    const max = Math.max(...known)
    const range = max - min || Math.abs(max) || 1
    const lo = min - range * 0.15
    const hi = max + range * 0.15
    yFor = (v) => PLOT_BOTTOM - ((v - lo) / (hi - lo)) * (PLOT_BOTTOM - TOP)
  } else {
    const max = Math.max(0, ...known)
    const min = Math.min(0, ...known)
    const span = (max - min) || 1
    yFor = (v) => PLOT_BOTTOM - ((v - min) / span) * (PLOT_BOTTOM - TOP)
    baseline = yFor(0)
  }

  const barW = Math.min(slot * 0.56, 30)

  // Tramos de la línea: se corta donde falta el dato (no se interpola un mes sin snapshot)
  const segments = []
  if (isLine) {
    let cur = []
    values.forEach((v, i) => {
      if (v == null) { if (cur.length) segments.push(cur); cur = [] }
      else cur.push([cx(i), yFor(v)])
    })
    if (cur.length) segments.push(cur)
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${metric.label}, últimos ${n} meses`}>
      <defs>
        <pattern id="hist-partial" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill={color} fillOpacity="0.35" />
          <line x1="0" y1="0" x2="0" y2="5" stroke={color} strokeWidth="2.5" />
        </pattern>
      </defs>

      <line x1={PAD_X} y1={baseline} x2={W - PAD_X} y2={baseline} stroke="currentColor" strokeWidth="1" className="text-gray-200 dark:text-gray-700" />

      {isLine && segments.map((seg, si) => (
        <polyline key={si} points={seg.map(p => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeOpacity="0.85" />
      ))}

      {values.map((v, i) => {
        const x = cx(i)
        const hi = isHi(i)
        const partial = months[i] === partialMonth
        const label = `${formatHistoryValue(v, metric.format)}${partial ? '*' : ''}`
        if (v == null) {
          return (
            <text key={i} x={x} y={baseline - 4} textAnchor="middle" fontSize="8.5" className="fill-gray-300 dark:fill-gray-600">
              s/d
            </text>
          )
        }
        const y = yFor(v)
        // Barra negativa: la etiqueta va sobre la línea base (debajo chocaría con el mes)
        const labelY = isLine || v >= 0 ? y - 5 : baseline - 5
        return (
          <g key={i}>
            <title>{`${historyMonthLabel(months[i], true)}: ${formatHistoryValue(v, metric.format)}`}</title>
            {isLine ? (
              <circle cx={x} cy={y} r={hi ? 4.5 : 3} fill={hi ? color : 'white'} stroke={color} strokeWidth="2" />
            ) : (
              <rect
                x={x - barW / 2} y={Math.min(y, baseline)} width={barW} height={Math.max(Math.abs(baseline - y), 1.5)} rx="3"
                fill={partial ? 'url(#hist-partial)' : hi ? color : undefined}
                className={hi || partial ? undefined : v < 0 ? 'fill-red-200 dark:fill-red-900/60' : 'fill-gray-200 dark:fill-gray-600'}
              />
            )}
            <text
              x={x} y={labelY} textAnchor="middle" fontSize="9" fontWeight={hi ? 700 : 500}
              fill={hi ? color : undefined} className={hi ? undefined : 'fill-gray-500 dark:fill-gray-400'}
            >
              {label}
            </text>
          </g>
        )
      })}

      {months.map((m, i) => {
        const d = i > 0 ? historyDelta(values[i], values[i - 1], metric) : null
        return (
          <g key={m}>
            <text
              x={cx(i)} y={LABEL_Y} textAnchor="middle" fontSize="9.5" fontWeight={isHi(i) ? 700 : 400}
              className={isHi(i) ? 'fill-gray-800 dark:fill-gray-100' : 'fill-gray-400 dark:fill-gray-500'}
            >
              {historyMonthLabel(m, spansYears && (i === 0 || m.endsWith('-01')))}
            </text>
            {d && (
              <text
                x={cx(i)} y={DELTA_Y} textAnchor="middle" fontSize="8.5" fontWeight="600"
                className={d.good == null ? 'fill-gray-400' : d.good ? 'fill-green-600 dark:fill-green-400' : 'fill-red-500 dark:fill-red-400'}
              >
                {d.text}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Bloque dentro de cada tarjeta ────────────────────────────────────────────

export function SectionHistory({ sectionKey }) {
  const { history, brandPrimary, printMode } = useContext(ReportHistoryContext)
  const data = history?.sections?.[sectionKey]
  const [open, setOpen] = useState(true)
  const [metricKey, setMetricKey] = useState(null)
  if (!data?.metrics?.length) return null

  const metric = data.metrics.find(m => m.key === metricKey) || data.metrics[0]
  const months = history.months
  const highlight = history.highlight?.length ? history.highlight : [months[months.length - 1]]
  const hiIndex = months.indexOf(highlight[highlight.length - 1])
  const best = highlight.length === 1 && isBestMonth(metric.values, hiIndex, metric.invert)
  const expanded = open || printMode

  return (
    <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 print-break-avoid">
      <div className="flex items-center justify-between gap-2 mb-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          disabled={printMode}
          className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5"
          aria-expanded={expanded}
        >
          {!printMode && <span className={`no-print inline-block transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>}
          Últimos {months.length} meses{printMode ? ` · ${metric.label}` : ''}
        </button>
        {expanded && best && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: brandPrimary, backgroundColor: `${brandPrimary}1a` }}>
            Mejor mes del período
          </span>
        )}
      </div>

      {expanded && (
        <>
          {!printMode && data.metrics.length > 1 && (
            <div className="no-print flex flex-wrap gap-1.5 mb-2">
              {data.metrics.map(m => {
                const active = m.key === metric.key
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMetricKey(m.key)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${active ? 'text-white border-transparent' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    style={active ? { backgroundColor: brandPrimary } : undefined}
                    aria-pressed={active}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
          )}
          <HistoryChart
            months={months}
            metric={metric}
            highlight={highlight}
            partialMonth={history.partialMonth}
            color={brandPrimary}
          />
          {history.partialMonth && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">* Mes en curso: datos parciales.</p>
          )}
        </>
      )}
    </div>
  )
}
