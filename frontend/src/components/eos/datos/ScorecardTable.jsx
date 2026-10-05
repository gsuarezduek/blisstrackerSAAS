import { useState, useEffect, useRef } from 'react'
import { avatarUrl } from '../../../utils/avatarUrl'
import { formatVal, goalStatus, goalDisplay, metricValueAt } from './scorecardHelpers'
import { AutoBadge } from './ScorecardNav'

// ═══════════════════════════════════════════════════════════════════════════════
// ScoreCell — celda editable de scorecard (tabla histórica)
// ═══════════════════════════════════════════════════════════════════════════════

function ScoreCell({ metricId, period, initialValue, goal, lowerIsBetter, unit, isCurrent, isWeekly, onSave }) {
  const [val, setVal]       = useState(initialValue != null ? formatVal(initialValue) : '')
  const lastSaved           = useRef(initialValue ?? null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setVal(initialValue != null ? formatVal(initialValue) : '')
    lastSaved.current = initialValue ?? null
  }, [initialValue])

  const numVal   = val === '' ? null : parseFloat(val)
  const status   = goalStatus(numVal, goal, lowerIsBetter)
  const onTrack  = status === 'on'
  const offTrack = status === 'off'
  const showDollar = unit === '$' && val !== ''

  async function save() {
    const newVal = val === '' ? null : parseFloat(val)
    if (isNaN(newVal) && val !== '') { setVal(formatVal(lastSaved.current)); return }
    if (newVal === lastSaved.current) return
    setSaving(true)
    await onSave(metricId, period, newVal)
    lastSaved.current = newVal
    setSaving(false)
  }

  const bg = onTrack  ? 'bg-green-50 dark:bg-green-900/25'
           : offTrack ? 'bg-red-50 dark:bg-red-900/20'
           : ''

  const textColor = onTrack  ? 'text-green-800 dark:text-green-300'
                  : offTrack ? 'text-red-700 dark:text-red-400'
                  : 'text-gray-700 dark:text-gray-300'

  const dollarColor = onTrack  ? 'text-green-600 dark:text-green-400'
                    : offTrack ? 'text-red-500 dark:text-red-400'
                    : 'text-gray-400 dark:text-gray-500'

  return (
    <td className={`p-0 ${isCurrent ? 'bg-primary-50/40 dark:bg-primary-900/15 border-x-2 border-primary-400 dark:border-primary-600' : ''}`}>
      <div className={`relative ${bg} transition-colors`}>
        {showDollar && (
          <span className={`absolute left-1 top-1/2 -translate-y-1/2 text-[11px] font-medium pointer-events-none ${dollarColor}`}>$</span>
        )}
        <input
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          placeholder={isCurrent ? '✎' : '—'}
          className={`w-full text-right bg-transparent focus:outline-none focus:bg-primary-50 dark:focus:bg-primary-900/20 transition-colors ${textColor} ${saving ? 'opacity-40' : ''} ${
            isWeekly
              ? `text-xs py-2 ${showDollar ? 'pl-4 pr-1' : 'px-1'}`
              : `text-sm py-3 ${showDollar ? 'pl-5 pr-2' : 'px-2'}`
          } ${isCurrent ? 'placeholder:text-primary-500 placeholder:font-bold' : ''}`}
          style={{ minWidth: isWeekly ? 34 : 88 }}
        />
      </div>
    </td>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// AutoScoreCell — celda de solo-lectura (métrica automática) en la tabla histórica
// ═══════════════════════════════════════════════════════════════════════════════

function AutoScoreCell({ value, goal, lowerIsBetter, isCurrent, isWeekly }) {
  const status   = goalStatus(value, goal, lowerIsBetter)
  const onTrack  = status === 'on'
  const offTrack = status === 'off'

  const bg = onTrack  ? 'bg-green-50 dark:bg-green-900/25'
           : offTrack ? 'bg-red-50 dark:bg-red-900/20'
           : ''
  const textColor = onTrack  ? 'text-green-800 dark:text-green-300'
                  : offTrack ? 'text-red-700 dark:text-red-400'
                  : 'text-gray-600 dark:text-gray-300'

  return (
    <td className={`p-0 ${isCurrent ? 'bg-primary-50/40 dark:bg-primary-900/15 border-x-2 border-primary-400 dark:border-primary-600' : ''}`}>
      <div className={`text-right tabular-nums ${bg} ${textColor} ${
        isWeekly ? 'text-xs py-2 px-1' : 'text-sm py-3 px-2'
      }`} style={{ minWidth: isWeekly ? 34 : 88 }}>
        {value != null ? formatVal(value) : <span className="text-gray-300 dark:text-gray-600">—</span>}
      </div>
    </td>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ScorecardTable — tabla con scroll horizontal y columna sticky
// ═══════════════════════════════════════════════════════════════════════════════

export default function ScorecardTable({
  metrics, entriesMap, autoData, members, periods, currentPeriod,
  labelFn, tooltipFn,
  onEntryChange, onEdit, onDelete,
  containerRef, currentPeriodRef,
  isWeekly,
  notesIndex, onNoteClick,
}) {
  function avg(metric) {
    const vals = periods.map(p => metricValueAt(metric, p, entriesMap, autoData)).filter(v => v != null)
    if (!vals.length) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  const colW = isWeekly ? 'min-w-[38px]' : 'min-w-[96px]'

  return (
    <div ref={containerRef} className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900/60">
            {/* Columna métrica sticky */}
            <th className={`sticky left-0 z-10 bg-gray-50 dark:bg-gray-900 text-left px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 ${
              isWeekly ? 'min-w-[180px]' : 'min-w-[220px]'
            }`}>
              Métrica
            </th>

            {/* Meta y responsable van apilados dentro de la columna métrica (semanal y mensual) */}

            {/* Columnas de período */}
            {periods.map(p => (
              <th
                key={p}
                ref={p === currentPeriod ? currentPeriodRef : null}
                title={tooltipFn ? tooltipFn(p) : undefined}
                className={`px-1 py-2.5 text-xs font-medium border-b border-gray-200 dark:border-gray-700 text-right ${colW} ${
                  p === currentPeriod
                    ? 'text-primary-700 dark:text-primary-300 font-bold bg-primary-100 dark:bg-primary-900/40 border-x-2 border-primary-400 dark:border-primary-600'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {notesIndex?.[p] && onNoteClick ? (
                  <button
                    type="button"
                    onClick={() => onNoteClick(p)}
                    title="Este mes tiene una nota — ver"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    {labelFn(p)}
                    <span className="w-1 h-1 rounded-full bg-primary-500" />
                  </button>
                ) : labelFn(p)}
              </th>
            ))}

            <th className={`px-3 py-2.5 text-xs font-medium text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700 text-right w-[64px] ${
              !isWeekly ? 'sticky right-10 z-10 bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700' : ''
            }`}>
              Prom.
            </th>
            <th className={`px-2 py-2.5 border-b border-gray-200 dark:border-gray-700 w-10 ${
              !isWeekly ? 'sticky right-0 z-10 bg-gray-50 dark:bg-gray-900' : ''
            }`} />
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {metrics.map(metric => {
            const owner    = metric.ownerId ? members.find(m => m.id === metric.ownerId) : null
            const isAuto   = !!metric.autoKey
            const avgVal   = avg(metric)
            const hasGoal  = metric.goal != null
            const avgStat  = goalStatus(avgVal, metric.goal, metric.lowerIsBetter)
            const avgOK    = avgStat === 'on'
            const avgBAD   = avgStat === 'off'

            return (
              <tr key={metric.id} className="group hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                {/* Métrica sticky — nombre + meta + responsable apilados (semanal y mensual) */}
                <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700 px-4 py-2 transition-colors align-top">
                  <div className="flex flex-col gap-1 py-1">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-tight">{metric.name}</span>
                      {isAuto && <AutoBadge />}
                    </span>
                    {hasGoal && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-medium">Meta</span>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          {goalDisplay(metric)}
                        </span>
                      </div>
                    )}
                    {isAuto ? (
                      <span className="text-[11px] text-indigo-500 dark:text-indigo-300 font-medium">Calculado por el sistema</span>
                    ) : owner ? (
                      <div className="flex items-center gap-1.5">
                        <img src={avatarUrl(owner.avatar)} alt={owner.name}
                          className="w-4 h-4 rounded-full object-cover border border-gray-200 dark:border-gray-600 shrink-0" />
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{owner.name}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-gray-300 dark:text-gray-600 italic">Sin responsable</span>
                    )}
                  </div>
                </td>

                {/* Celdas de período */}
                {periods.map(period => (
                  isAuto ? (
                    <AutoScoreCell
                      key={period}
                      value={metricValueAt(metric, period, entriesMap, autoData)}
                      goal={metric.goal}
                      lowerIsBetter={metric.lowerIsBetter}
                      isCurrent={period === currentPeriod}
                      isWeekly={isWeekly}
                    />
                  ) : (
                    <ScoreCell
                      key={period}
                      metricId={metric.id}
                      period={period}
                      initialValue={entriesMap[metric.id]?.[period] ?? null}
                      goal={metric.goal}
                      lowerIsBetter={metric.lowerIsBetter}
                      unit={metric.unit}
                      isCurrent={period === currentPeriod}
                      isWeekly={isWeekly}
                      onSave={onEntryChange}
                    />
                  )
                ))}

                {/* Promedio */}
                <td className={`px-3 py-2 text-right w-[64px] ${
                  !isWeekly ? 'sticky right-10 z-10 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700 border-l border-gray-100 dark:border-gray-700' : ''
                }`}>
                  {avgVal != null ? (
                    <span className={`text-xs font-medium whitespace-nowrap ${
                      avgOK  ? 'text-green-600 dark:text-green-400'
                    : avgBAD ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {metric.unit === '$' ? `$${formatVal(avgVal)}` : formatVal(avgVal)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                  )}
                </td>

                {/* Acciones */}
                <td className={`px-2 py-2 text-center w-10 ${
                  !isWeekly ? 'sticky right-0 z-10 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700' : ''
                }`}>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-center">
                    <button onClick={() => onEdit(metric)} title="Editar"
                      className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs transition-colors">✎</button>
                    <button onClick={() => onDelete(metric.id)} title="Eliminar"
                      className="p-1 text-gray-400 hover:text-red-500 text-xs transition-colors">✕</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
