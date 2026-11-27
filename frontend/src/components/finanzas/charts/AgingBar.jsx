import { useState } from 'react'
import { fmtMoney } from '../../../utils/format'
import { ORDINAL_FILL } from './chartKit'

/**
 * Antigüedad de lo que deben los clientes: una barra segmentada (un todo
 * partido en tramos de vencimiento, de "Al día" a "Más de 90 días"), con la
 * rampa ordinal azul — más oscuro = más viejo. Cada tramo y su fila de la
 * leyenda filtran la lista de clientes (`onSelect(key)`; otro click lo saca).
 * Hover/foco en un tramo: monto, % y cuántos clientes. La leyenda repite
 * todos los montos, así que nada depende del hover.
 *
 * `data`: { currency, total, buckets: [{ key, label, amount, customers }] }
 */
export default function AgingBar({ data, selected, onSelect }) {
  const [hover, setHover] = useState(null)
  const total = Number(data.total)
  const pct = amount => (total > 0 ? (Number(amount) / total) * 100 : 0)
  const fmtPct = amount => `${pct(amount).toLocaleString('es-AR', { maximumFractionDigits: 0 })}%`
  const toggle = key => onSelect(selected === key ? null : key)
  const hovered = data.buckets.find(b => b.key === hover)

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 mb-5">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Antigüedad de lo que te deben</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">Total {fmtMoney(data.total, data.currency)}</span>
      </div>

      <div className="relative">
        <div className="flex gap-[2px] h-7" role="group" aria-label="Saldo por antigüedad de vencimiento">
          {data.buckets.map((b, i) => Number(b.amount) > 0 && (
            <button key={b.key} type="button" onClick={() => toggle(b.key)}
              onMouseEnter={() => setHover(b.key)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(b.key)} onBlur={() => setHover(null)}
              aria-label={`${b.label}: ${fmtMoney(b.amount, data.currency)}, ${fmtPct(b.amount)}`}
              aria-pressed={selected === b.key}
              className={`h-full rounded ${ORDINAL_FILL[i]} transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 ${selected && selected !== b.key ? 'opacity-30' : ''}`}
              style={{ width: `${pct(b.amount)}%`, minWidth: 4 }} />
          ))}
        </div>
        {hovered && (
          <div role="tooltip" className="absolute z-10 top-full mt-1 left-0 whitespace-nowrap rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-lg px-3 py-2 text-xs pointer-events-none">
            <p className="font-semibold text-gray-900 dark:text-white tabular-nums">{fmtMoney(hovered.amount, data.currency)} <span className="font-normal text-gray-500 dark:text-gray-400">· {fmtPct(hovered.amount)}</span></p>
            <p className="text-gray-500 dark:text-gray-400">{hovered.label} · {hovered.customers.length} cliente{hovered.customers.length === 1 ? '' : 's'}</p>
          </div>
        )}
      </div>

      <ul className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
        {data.buckets.map((b, i) => {
          const empty = Number(b.amount) === 0
          return (
            <li key={b.key}>
              <button type="button" disabled={empty} onClick={() => toggle(b.key)} aria-pressed={selected === b.key}
                className={`w-full text-left rounded-lg px-2 py-1.5 border ${selected === b.key ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-900/30'} disabled:opacity-40 disabled:hover:bg-transparent`}>
                <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <span className={`w-2.5 h-2.5 rounded-sm inline-block shrink-0 ${ORDINAL_FILL[i]}`} />{b.label}
                </span>
                <span className="block text-sm font-semibold text-gray-900 dark:text-white">{fmtMoney(b.amount, data.currency)}</span>
                {!empty && <span className="block text-[11px] text-gray-400">{fmtPct(b.amount)} · {b.customers.length} cliente{b.customers.length === 1 ? '' : 's'}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
