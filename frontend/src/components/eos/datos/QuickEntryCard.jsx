import { useState, useEffect, useRef } from 'react'
import { avatarUrl } from '../../../utils/avatarUrl'
import { formatVal, goalStatus, goalDisplay } from './scorecardHelpers'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Icon } from '../../ui/Icon'

// ═══════════════════════════════════════════════════════════════════════════════
// QuickEntryCard — tarjeta de carga del período actual
// ═══════════════════════════════════════════════════════════════════════════════

export default function QuickEntryCard({ metric, owner, initialValue, onSave }) {
  const [val, setVal]       = useState(initialValue != null ? formatVal(initialValue) : '')
  const lastSaved           = useRef(initialValue ?? null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setVal(initialValue != null ? formatVal(initialValue) : '')
    lastSaved.current = initialValue ?? null
  }, [initialValue])

  const numVal   = val === '' ? null : parseFloat(val)
  const hasGoal  = metric.goal != null
  const status   = goalStatus(numVal, metric.goal, metric.lowerIsBetter)
  const onTrack  = status === 'on'
  const offTrack = status === 'off'
  const showDollar = metric.unit === '$'

  async function save() {
    const newVal = val === '' ? null : parseFloat(val)
    if (isNaN(newVal) && val !== '') { setVal(formatVal(lastSaved.current)); return }
    if (newVal === lastSaved.current) return
    setSaving(true)
    await onSave(newVal)
    lastSaved.current = newVal
    setSaving(false)
  }

  const inputBorder = onTrack  ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                    : offTrack ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:border-primary-400'

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2 min-h-[36px]">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-tight line-clamp-2">{metric.name}</p>
          {owner && (
            <div className="flex items-center gap-1 mt-1">
              <img src={avatarUrl(owner.avatar)} alt={owner.name}
                className="w-4 h-4 rounded-full object-cover border border-gray-200 dark:border-gray-600" />
              <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{owner.name.split(' ')[0]}</span>
            </div>
          )}
        </div>
        {hasGoal && (
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-medium">Meta</div>
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
              {goalDisplay(metric)}
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        {showDollar && (
          <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-base font-semibold pointer-events-none ${
            onTrack ? 'text-green-600 dark:text-green-400'
            : offTrack ? 'text-red-500 dark:text-red-400'
            : 'text-gray-400 dark:text-gray-500'
          }`}>$</span>
        )}
        <input
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          placeholder="Cargar valor"
          className={`w-full text-right text-base font-semibold tabular-nums border-2 rounded-lg py-2 pr-3 transition-all ${
            showDollar ? 'pl-8' : 'pl-3'
          } ${inputBorder} focus:outline-none focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-900 ${saving ? 'opacity-50' : ''}`}
        />
        {hasGoal && numVal != null && (
          <span className="absolute -top-2 -right-1.5 text-base bg-white dark:bg-gray-800 rounded-full leading-none">
            {onTrack ? <Icon as={CircleCheck} size={16} className="text-green-500" /> : <Icon as={CircleAlert} size={16} className="text-red-500" />}
          </span>
        )}
      </div>

      {!hasGoal && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">Sin meta definida</p>
      )}
    </div>
  )
}
