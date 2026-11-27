import { useState } from 'react'
import { fmtMoney } from '../../../utils/format'
import { LINE_FILL, LINE_STROKE, fmtCompactMoney, niceScale, shortMonth, useElementWidth } from './chartKit'

const HEIGHT = 160
const PAD = { top: 12, right: 12, bottom: 22, left: 64 }

/**
 * Una línea: el disponible al cierre de cada mes, en una moneda. Línea de
 * 2px, lavado del área al 10%, punto final con anillo del color de la
 * superficie y el valor de hoy rotulado. Hover/foco: línea vertical que se
 * engancha al mes más cercano + tooltip. `points`: [{ month, balance }].
 */
function CurrencyLine({ currency, points }) {
  const [ref, width] = useElementWidth()
  const [active, setActive] = useState(null)
  const values = points.map(p => Number(p.balance))
  const scale = niceScale(Math.min(...values), Math.max(...values))
  const plotW = Math.max(120, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const x = i => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = v => PAD.top + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${path} L${x(values.length - 1).toFixed(1)},${y(Math.max(scale.min, 0)).toFixed(1)} L${x(0).toFixed(1)},${y(Math.max(scale.min, 0)).toFixed(1)} Z`
  const last = values.length - 1
  const slot = plotW / Math.max(1, points.length - 1)
  const labelEvery = width < 480 ? 3 : width < 720 ? 2 : 1
  const shown = active ?? last

  return (
    <div ref={ref} className="relative">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Disponible en {currency === 'ARS' ? 'pesos' : currency}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {shortMonth(points[shown].month)}{shown === last ? ' (hoy)' : ''}: <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{fmtMoney(points[shown].balance, currency)}</span>
        </p>
      </div>
      <svg width={width} height={HEIGHT} role="img" aria-label={`Evolución del disponible en ${currency}: de ${fmtMoney(points[0].balance, currency)} a ${fmtMoney(points[last].balance, currency)}`}
        className="block overflow-visible">
        {scale.ticks.map(t => (
          <g key={t}>
            <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} strokeWidth={1}
              className={t === 0 ? 'stroke-gray-300 dark:stroke-gray-600' : 'stroke-gray-100 dark:stroke-gray-700'} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-gray-400 text-[10px] tabular-nums">{fmtCompactMoney(t, currency)}</text>
          </g>
        ))}
        {points.map((p, i) => i % labelEvery === (last % labelEvery) && (
          <text key={p.month} x={x(i)} y={HEIGHT - 6} textAnchor="middle" className="fill-gray-400 text-[10px]">{shortMonth(p.month)}</text>
        ))}

        <path d={area} className={LINE_FILL} fillOpacity={0.1} />
        <path d={path} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className={LINE_STROKE} />

        {active != null && (
          <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} strokeWidth={1} className="stroke-gray-300 dark:stroke-gray-600" />
        )}
        <circle cx={x(shown)} cy={y(values[shown])} r={4.5} strokeWidth={2} className={`${LINE_FILL} stroke-white dark:stroke-gray-800`} />

        {/* Zonas de hover: una por mes, del ancho de su tramo (más grandes que la marca). */}
        {points.map((p, i) => (
          <rect key={p.month} x={x(i) - slot / 2} y={PAD.top} width={slot} height={plotH} fill="transparent"
            tabIndex={0} aria-label={`${shortMonth(p.month)}: ${fmtMoney(p.balance, currency)}`}
            onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)} onBlur={() => setActive(null)} className="outline-none" />
        ))}
      </svg>
    </div>
  )
}

/**
 * Evolución del disponible operativo por moneda (GET /balances/history): una
 * línea por moneda (escalas distintas → gráficos separados, nunca dos ejes).
 * Abajo, la misma data como tabla.
 */
export default function BalanceHistoryChart({ data }) {
  if (!data) return <p className="text-sm text-gray-400 text-center py-8">Cargando…</p>
  if (data.currencies.length === 0) return <p className="text-sm text-gray-400 text-center py-8">Sin cuentas operativas.</p>

  return (
    <div className="space-y-6">
      {data.currencies.map(c => <CurrencyLine key={c.currency} currency={c.currency} points={c.points} />)}
      <details>
        <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">Ver como tabla</summary>
        <table className="w-full text-xs mt-2">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="py-1 font-medium">Mes</th>
              {data.currencies.map(c => <th key={c.currency} className="py-1 font-medium text-right">{c.currency}</th>)}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.months.map((m, i) => (
              <tr key={m} className="border-b border-gray-50 dark:border-gray-700/50 text-gray-700 dark:text-gray-300">
                <td className="py-1">{shortMonth(m)}</td>
                {data.currencies.map(c => <td key={c.currency} className="py-1 text-right">{fmtMoney(c.points[i].balance, c.currency)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
