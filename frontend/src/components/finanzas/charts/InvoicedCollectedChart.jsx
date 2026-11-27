import { useState } from 'react'
import { fmtMoney } from '../../../utils/format'
import { SERIES_FILL, fmtCompactMoney, niceScale, shortMonth } from './chartKit'

const HEIGHT = 180
const SERIES = [
  { key: 'invoiced',  label: 'Facturado', fill: SERIES_FILL.blue },
  { key: 'collected', label: 'Cobrado',   fill: SERIES_FILL.orange },
]

/**
 * Facturado vs. cobrado por mes: columnas agrupadas (≤ 16px cada una, 2px de
 * aire entre las dos, borde redondeado solo en la punta), eje Y con marcas
 * redondas y grilla de un pixel. Hover/foco por mes: tooltip con los dos
 * valores y la diferencia. Abajo, la misma data como tabla (no depende del
 * hover). `series`: [{ month, invoiced, collected, diff }].
 */
export default function InvoicedCollectedChart({ series, currency }) {
  const [active, setActive] = useState(null)
  const values = series.flatMap(s => [Number(s.invoiced), Number(s.collected)])
  const allZero = values.every(v => v === 0)
  const scale = niceScale(Math.min(...values), Math.max(...values))
  const y = v => HEIGHT - ((v - scale.min) / (scale.max - scale.min)) * HEIGHT
  const zeroY = y(0)

  if (allZero) return <p className="text-sm text-gray-400 text-center py-10">Sin facturas ni cobros en estos meses.</p>

  return (
    <div>
      <div className="flex items-center gap-4 mb-3 text-xs text-gray-500 dark:text-gray-400" aria-hidden="true">
        {SERIES.map(s => (
          <span key={s.key} className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm inline-block ${s.fill}`} />{s.label}</span>
        ))}
      </div>

      <div className="flex">
        {/* Eje Y */}
        <div className="relative shrink-0 w-16 mr-2" style={{ height: HEIGHT }} aria-hidden="true">
          {scale.ticks.map(t => (
            <span key={t} className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-gray-400" style={{ top: y(t) }}>{fmtCompactMoney(t, currency)}</span>
          ))}
        </div>

        <div className="flex-1 min-w-0 overflow-x-auto">
          <div className="relative" style={{ height: HEIGHT, minWidth: series.length * 44 }}>
            {scale.ticks.map(t => (
              <div key={t} className={`absolute left-0 right-0 h-px ${t === 0 ? 'bg-gray-300 dark:bg-gray-600' : 'bg-gray-100 dark:bg-gray-700/60'}`} style={{ top: y(t) }} />
            ))}

            <div className="absolute inset-0 flex">
              {series.map((s, i) => {
                const isActive = active === i
                return (
                  <div key={s.month} tabIndex={0}
                    aria-label={`${shortMonth(s.month)}: facturado ${fmtMoney(s.invoiced, currency)}, cobrado ${fmtMoney(s.collected, currency)}`}
                    onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                    className={`relative flex-1 flex justify-center gap-[2px] outline-none rounded focus-visible:ring-2 focus-visible:ring-primary-500 ${isActive ? 'bg-gray-50 dark:bg-gray-900/30' : ''}`}>
                    {SERIES.map(ser => {
                      const v = Number(s[ser.key])
                      const top = Math.min(y(v), zeroY)
                      const h = Math.max(v === 0 ? 0 : 2, Math.abs(zeroY - y(v)))
                      return (
                        <div key={ser.key} className={`absolute w-4 ${ser.fill} ${v >= 0 ? 'rounded-t' : 'rounded-b'} ${isActive ? 'opacity-90' : ''}`}
                          style={{ top, height: h, left: `calc(50% ${ser.key === 'invoiced' ? '- 17px' : '+ 1px'})` }} />
                      )
                    })}
                    {isActive && (
                      // Adentro del área (el scroll horizontal recortaría uno que salga por
                      // arriba) y pegado al borde en las columnas de las puntas.
                      <div role="tooltip" className={`absolute z-10 top-1 ${i < 2 ? 'left-0' : i > series.length - 3 ? 'right-0' : 'left-1/2 -translate-x-1/2'} whitespace-nowrap rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-lg px-3 py-2 text-xs pointer-events-none`}>
                        <p className="text-gray-500 dark:text-gray-400 mb-1">{shortMonth(s.month)}</p>
                        {SERIES.map(ser => (
                          <p key={ser.key} className="flex items-center gap-2">
                            <span className={`w-3 h-0.5 inline-block ${ser.fill}`} />
                            <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{fmtMoney(s[ser.key], currency)}</span>
                            <span className="text-gray-500 dark:text-gray-400">{ser.label}</span>
                          </p>
                        ))}
                        <p className="mt-1 pt-1 border-t border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                          {Number(s.diff) > 0 ? 'Quedó por cobrar ' : Number(s.diff) < 0 ? 'Se cobró de más ' : 'Sin diferencia'}
                          {Number(s.diff) !== 0 && <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{fmtMoney(Math.abs(s.diff), currency)}</span>}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex mt-1" style={{ minWidth: series.length * 44 }} aria-hidden="true">
            {series.map(s => <span key={s.month} className="flex-1 text-center text-[10px] text-gray-500 dark:text-gray-400">{shortMonth(s.month)}</span>)}
          </div>
        </div>
      </div>

      <details className="mt-3">
        <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">Ver como tabla</summary>
        <table className="w-full text-xs mt-2">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="py-1 font-medium">Mes</th>
              <th className="py-1 font-medium text-right">Facturado</th>
              <th className="py-1 font-medium text-right">Cobrado</th>
              <th className="py-1 font-medium text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {series.map(s => (
              <tr key={s.month} className="border-b border-gray-50 dark:border-gray-700/50 text-gray-700 dark:text-gray-300">
                <td className="py-1">{shortMonth(s.month)}</td>
                <td className="py-1 text-right">{fmtMoney(s.invoiced, currency)}</td>
                <td className="py-1 text-right">{fmtMoney(s.collected, currency)}</td>
                <td className="py-1 text-right">{fmtMoney(s.diff, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
