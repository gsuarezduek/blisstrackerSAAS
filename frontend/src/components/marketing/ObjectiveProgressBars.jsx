import { fmtObjectiveValue } from './objectiveCatalog'

// Colores de barra/texto según el estado calculado por el motor de objetivos.
const STATUS_BAR = {
  ok:           'bg-green-500',
  partial:      'bg-yellow-500',
  fail:         'bg-red-500',
  info:         'bg-blue-500',
  no_data:      'bg-gray-300 dark:bg-gray-600',
  disconnected: 'bg-gray-300 dark:bg-gray-600',
  orphaned:     'bg-gray-300 dark:bg-gray-600',
}
const STATUS_TEXT = {
  ok:           'text-green-600 dark:text-green-400',
  partial:      'text-yellow-600 dark:text-yellow-400',
  fail:         'text-red-600 dark:text-red-400',
  info:         'text-blue-600 dark:text-blue-400',
  no_data:      'text-gray-400',
  disconnected: 'text-gray-400',
  orphaned:     'text-gray-400',
}

// Texto del lado derecho (badge) según el tipo de objetivo.
function rightLabel(o) {
  if (o.status === 'disconnected') return 'Sin conexión'
  if (o.status === 'orphaned')     return 'Sin referencia'
  if (o.pct != null)               return `${o.pct}%`
  if (o.direction === 'info' || o.status === 'info') return o.actual == null ? 'Sin datos' : 'Informativo'
  return 'Sin datos'
}

function Bar({ o }) {
  const hasPct  = o.pct != null
  const isInfo  = o.direction === 'info' || o.status === 'info'
  const width   = hasPct
    ? Math.max(0, Math.min(100, o.pct))
    : (isInfo && o.target ? Math.max(0, Math.min(100, Math.round((o.actual / o.target) * 100))) : 0)
  const barCls  = STATUS_BAR[o.status] || STATUS_BAR.no_data
  const txtCls  = STATUS_TEXT[o.status] || STATUS_TEXT.no_data
  // Para "competidores" el target es 0 (no es una meta numérica) → no mostrar el "/ target".
  const showTarget = o.target != null && o.target !== 0

  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{o.label}</span>
        <span className={`text-xs font-semibold flex-shrink-0 ${txtCls}`}>{rightLabel(o)}</span>
      </div>
      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
        <div className={`h-2 rounded-full transition-all ${barCls}`} style={{ width: `${width}%` }} />
      </div>
      <div className="flex items-center justify-between mt-1 text-[11px] text-gray-400">
        <span>{o.periodLabel}</span>
        <span>
          {o.actual == null ? '—' : fmtObjectiveValue(o.actual, o.unit)}
          {showTarget && <> / {fmtObjectiveValue(o.target, o.unit)}</>}
        </span>
      </div>
    </div>
  )
}

/**
 * Lista de objetivos con barra de progreso. `objectives` son los resultados
 * calculados por el motor (GET /objectives/progress), ya filtrados por área.
 */
export default function ObjectiveProgressBars({ objectives, title = '🎯 Objetivos del período' }) {
  if (!objectives?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</p>
      {objectives.map(o => <Bar key={o.id} o={o} />)}
    </div>
  )
}
