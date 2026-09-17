import { useMemo } from 'react'
import MonthGrid from './MonthGrid'
import { monthLabel } from './dateHelpers'

const STATUS_DOT = { confirmed: 'bg-green-500', pending: 'bg-amber-400', partial: 'bg-red-400' }
const MAX_CHIPS_PER_DAY = 4

/**
 * Vista mensual de mis reuniones agendadas (CalendarEvent) — mismo patrón que
 * ContentCalendarView.jsx, sobre el layout compartido MonthGrid.jsx. Sin
 * drag&drop (a diferencia de Contenido, no se pidió). Click en un chip abre el
 * detalle; click en un día vacío navega a la vista semanal centrada ahí.
 */
export default function CalendarMonthView({ events, month, onMonthChange, onOpenEvent, onOpenDay }) {
  const byDay = useMemo(() => {
    const map = {}
    for (const e of events) (map[e.date] ??= []).push(e)
    for (const key of Object.keys(map)) map[key].sort((a, b) => a.startTime.localeCompare(b.startTime))
    return map
  }, [events])

  return (
    <MonthGrid
      month={month}
      onMonthChange={onMonthChange}
      monthLabel={monthLabel(month)}
      renderCell={(dateStr, isToday) => {
        const items = dateStr ? (byDay[dateStr] ?? []) : []
        const dayNum = dateStr ? Number(dateStr.split('-')[2]) : null

        return (
          <div
            onClick={() => dateStr && onOpenDay(dateStr)}
            className={`min-h-[92px] border-b border-r border-gray-100 dark:border-gray-700 p-1.5 transition-colors ${
              !dateStr ? 'bg-gray-50/50 dark:bg-gray-900/20' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/30'}`}
          >
            {dateStr && (
              <>
                <div className={`text-xs mb-1 w-5 h-5 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-primary-600 text-white font-semibold' : 'text-gray-400 dark:text-gray-500'}`}>
                  {dayNum}
                </div>
                <div className="space-y-1">
                  {items.slice(0, MAX_CHIPS_PER_DAY).map(e => (
                    <div
                      key={e.id}
                      onClick={ev => { ev.stopPropagation(); onOpenEvent(e) }}
                      title={e.title}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[e.confirmationStatus] || 'bg-gray-300'}`} />
                      <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate">{e.startTime} {e.title}</span>
                    </div>
                  ))}
                  {items.length > MAX_CHIPS_PER_DAY && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 px-1.5">+{items.length - MAX_CHIPS_PER_DAY} más</p>
                  )}
                </div>
              </>
            )}
          </div>
        )
      }}
    />
  )
}
