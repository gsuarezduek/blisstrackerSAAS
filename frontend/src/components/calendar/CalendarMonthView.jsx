import { useMemo } from 'react'
import MonthGrid from './MonthGrid'
import { monthLabel, todayYMD, shiftDay } from './dateHelpers'
import { Briefcase, CircleDashed, Clapperboard, Repeat, Wallet } from 'lucide-react'
import { Icon } from '../ui/Icon'

const STATUS_DOT = { confirmed: 'bg-green-500', pending: 'bg-amber-400', partial: 'bg-red-400' }
const MAX_CHIPS_PER_DAY = 4

/**
 * Vista mensual de mis reuniones agendadas (CalendarEvent) — mismo patrón que
 * ContentCalendarView.jsx, sobre el layout compartido MonthGrid.jsx. Sin
 * drag&drop (a diferencia de Contenido, no se pidió). Click en un chip abre el
 * detalle; click en un día vacío navega a la vista semanal centrada ahí.
 * `tasks`: mis tareas futuras sin hora (Task.scheduledFor) — van primero en el día,
 * como los eventos "todo el día" de Google Calendar; click abre su detalle.
 * `externalEvents`: lo traído de mis calendarios de afuera (ver ExternalCalendar) —
 * `{ id, title, date, endDate, startTime, allDay, color, calendarName }`. Uno de
 * varios días se repite en cada día que abarca. `onOpenExternal(e)` abre su
 * detalle, que es de solo lectura (el evento se edita donde vive).
 */
export default function CalendarMonthView({ events, tasks = [], salesActions = [], financeTasks = [], contentPieces = [], externalEvents = [], month, onMonthChange, onOpenEvent, onOpenTask, onOpenSales, onOpenFinance, onOpenContent, onOpenExternal, onOpenDay }) {
  const byDay = useMemo(() => {
    const map = {}
    for (const e of events) (map[e.date] ??= []).push({ kind: 'event', item: e })
    for (const key of Object.keys(map)) map[key].sort((a, b) => a.item.startTime.localeCompare(b.item.startTime))
    for (const x of externalEvents) {
      let day = x.date
      const last = x.endDate || x.date
      // Tope de seguridad: un evento mal declarado podría abarcar un rango absurdo.
      for (let i = 0; i < 62 && day <= last; i++) {
        (map[day] ??= []).push({ kind: 'external', item: x, day })
        day = shiftDay(day, 1)
      }
    }
    for (const t of tasks) (map[t.scheduledFor] ??= []).unshift({ kind: 'task', item: t })
    for (const a of salesActions) (map[a.date] ??= []).unshift({ kind: 'sales', item: a })
    for (const t of financeTasks) (map[t.date] ??= []).unshift({ kind: 'finance', item: t })
    for (const p of contentPieces) (map[p.date] ??= []).unshift({ kind: 'content', item: p })
    return map
  }, [events, tasks, salesActions, financeTasks, contentPieces, externalEvents])

  const today = todayYMD()

  return (
    <MonthGrid
      month={month}
      onMonthChange={onMonthChange}
      monthLabel={monthLabel(month)}
      renderCell={(dateStr, isToday) => {
        const items = dateStr ? (byDay[dateStr] ?? []) : []
        const dayNum = dateStr ? Number(dateStr.split('-')[2]) : null
        const past = !!dateStr && dateStr < today

        return (
          <div
            onClick={() => dateStr && onOpenDay(dateStr)}
            className={`min-h-[92px] border-b border-r border-gray-100 dark:border-gray-700 p-1.5 transition-colors ${
              !dateStr ? 'bg-gray-50/50 dark:bg-gray-900/20'
                : past ? 'bg-gray-100/80 dark:bg-gray-900/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900/70'
                : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/30'}`}
          >
            {dateStr && (
              <>
                <div className={`text-xs mb-1 w-5 h-5 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-primary-600 text-white font-semibold'
                    : past ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 dark:text-gray-500'}`}>
                  {dayNum}
                </div>
                <div className="space-y-1">
                  {items.slice(0, MAX_CHIPS_PER_DAY).map(({ kind, item: e, day }) => kind === 'content' ? (
                    <div
                      key={`content-${e.id}`}
                      onClick={ev => { ev.stopPropagation(); onOpenContent?.(e) }}
                      title={`Contenido · ${e.projectName ? `${e.projectName}: ` : ''}${e.title}`}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 cursor-pointer transition-colors ${
                        past ? 'opacity-60 grayscale' : ''}`}
                    >
                      <Icon as={Clapperboard} size={11} className="shrink-0 text-rose-600 dark:text-rose-400" />
                      <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate">
                        {e.projectName ? `${e.projectName}: ` : ''}{e.title}
                      </span>
                    </div>
                  ) : kind === 'finance' ? (
                    <div
                      key={`finance-${e.id}`}
                      onClick={ev => { ev.stopPropagation(); onOpenFinance?.(e) }}
                      title={`Finanzas · ${e.itemName ? `${e.itemName}: ` : ''}${e.title}`}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 cursor-pointer transition-colors ${
                        past ? 'opacity-60 grayscale' : ''}`}
                    >
                      <Icon as={Wallet} size={11} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate">
                        {e.itemName ? `${e.itemName}: ` : ''}{e.title}
                      </span>
                    </div>
                  ) : kind === 'sales' ? (
                    <div
                      key={`sales-${e.id}`}
                      onClick={ev => { ev.stopPropagation(); onOpenSales?.(e) }}
                      title={`Ventas · ${e.companyName ? `${e.companyName}: ` : ''}${e.title}`}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/40 cursor-pointer transition-colors ${
                        past ? 'opacity-60 grayscale' : ''}`}
                    >
                      <Icon as={Briefcase} size={11} className="shrink-0 text-primary-600 dark:text-primary-400" />
                      <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate">
                        {e.companyName ? `${e.companyName}: ` : ''}{e.title}
                      </span>
                    </div>
                  ) : kind === 'external' ? (
                    <div
                      key={`ext-${e.id}-${day}`}
                      onClick={ev => { ev.stopPropagation(); onOpenExternal?.(e) }}
                      title={e.calendarName ? `${e.title} · ${e.calendarName}` : e.title}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-900/20 transition-colors ${
                        onOpenExternal ? 'cursor-pointer hover:bg-violet-100 dark:hover:bg-violet-900/40' : ''} ${past ? 'opacity-60 grayscale' : ''}`}
                      style={e.color ? { borderLeft: `3px solid ${e.color}` } : undefined}
                    >
                      <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate">
                        {e.startTime ? `${e.startTime} ` : ''}{e.title}
                      </span>
                    </div>
                  ) : kind === 'task' ? (
                    <div
                      key={`task-${e.id}`}
                      onClick={ev => { ev.stopPropagation(); onOpenTask?.(e) }}
                      title={e.description}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors ${
                        past ? 'opacity-60 grayscale' : ''}`}
                    >
                      <Icon as={CircleDashed} size={11} className="shrink-0 text-gray-400" />
                      <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate">
                        {e.recurrenceId && <span title="Tarea recurrente" className="inline-flex align-[-1px] mr-0.5"><Icon as={Repeat} size={11} /></span>}
                        {e.description}
                      </span>
                    </div>
                  ) : (
                    <div
                      key={e.id}
                      onClick={ev => { ev.stopPropagation(); onOpenEvent(e) }}
                      title={e.title}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors ${
                        past ? 'opacity-60 grayscale' : ''}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[e.confirmationStatus] || 'bg-gray-300'}`} />
                      <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate">
                        {e.recurrenceId && <span title="Reunión recurrente" className="inline-flex align-[-1px] mr-0.5"><Icon as={Repeat} size={11} /></span>}
                        {e.startTime} {e.title}
                      </span>
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
