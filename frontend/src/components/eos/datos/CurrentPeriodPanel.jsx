import CollaborativeRichTextEditor from '../../CollaborativeRichTextEditor'
import { metricValueAt, metricDetailAt } from './scorecardHelpers'
import { PeriodNavHeader } from './ScorecardNav'
import QuickEntryCard from './QuickEntryCard'
import AutoMetricCard from './AutoMetricCard'

// ═══════════════════════════════════════════════════════════════════════════════
// CurrentPeriodPanel — panel destacado del período actual
// ═══════════════════════════════════════════════════════════════════════════════

export function CurrentPeriodPanel({
  metrics, entriesMap, autoData, currentStatus, members, period, title, subtitle, onEntryChange,
  isCurrent, canGoForward, onPrev, onNext, onToday,
}) {
  if (metrics.length === 0 || !period) return null

  return (
    <div className="bg-gradient-to-br from-primary-50/80 via-white to-white dark:from-primary-900/20 dark:via-gray-800 dark:to-gray-800 border-2 border-primary-200 dark:border-primary-800/60 rounded-2xl p-5 mb-4">
      <PeriodNavHeader
        title={title} subtitle={subtitle} isCurrent={isCurrent} canGoForward={canGoForward}
        onPrev={onPrev} onNext={onNext} onToday={onToday}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {metrics.map(metric => {
          if (metric.autoKey) {
            return (
              <AutoMetricCard
                key={`${metric.id}-${period}`}
                metric={metric}
                value={metricValueAt(metric, period, entriesMap, autoData)}
                detail={metricDetailAt(metric, period, autoData)}
                period={period}
                monthStatus={currentStatus?.[metric.autoKey]}
              />
            )
          }
          const owner = metric.ownerId ? members.find(m => m.id === metric.ownerId) : null
          const currentVal = entriesMap[metric.id]?.[period] ?? null
          return (
            <QuickEntryCard
              key={`${metric.id}-${period}`}
              metric={metric}
              owner={owner}
              initialValue={currentVal}
              onSave={(value) => onEntryChange(metric.id, period, value)}
            />
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MonthNotesPanel — nota colaborativa del mes (tab "Notas"). Mismo período y
// misma navegación ‹ Hoy › que CurrentPeriodPanel — un único texto por mes
// calendario, editado en tiempo real (varias personas a la vez, con sus
// cursores) vía el motor Yjs/Hocuspocus ya usado por reuniones/leads.
// ═══════════════════════════════════════════════════════════════════════════════

export function MonthNotesPanel({ period, title, subtitle, isCurrent, canGoForward, onPrev, onNext, onToday, fallbackContent }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <PeriodNavHeader
        title={title} subtitle={subtitle} isCurrent={isCurrent} canGoForward={canGoForward}
        onPrev={onPrev} onNext={onNext} onToday={onToday}
      />
      <CollaborativeRichTextEditor
        key={`scorecardNote:${period}`}
        docKey={`scorecardNote:${period}`}
        fallbackContent={fallbackContent ?? ''}
        emptyText="Sin notas para este mes todavía."
        minHeight={240}
      />
    </div>
  )
}
