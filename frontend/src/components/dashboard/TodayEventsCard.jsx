import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, Repeat, Video } from 'lucide-react'
import { Icon } from '../ui/Icon'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useFeatureFlag } from '../../hooks/useFeatureFlag'
import { useCalendarSocket } from '../calendar/useCalendarSocket'
import ExternalEventModal from '../calendar/ExternalEventModal'
import { todayYMD } from '../calendar/dateHelpers'
import { fmtMins } from '../../utils/format'

// "Hoy en tu calendario": las reuniones de HOY donde participo, debajo del insight
// diario, más lo que no tiene hora (un evento de día completo, una próxima acción
// de Ventas). Responde "¿tengo algo antes de ponerme con una tarea?".
//
// Se monta siempre y se auto-gatea (mismo patrón que SetupChecklist): sin el módulo
// Calendario, sin acceso, o sin nada agendado para hoy, no renderiza nada. El flag
// ya lo pide el Navbar, así que acá sale de la caché de useFeatureFlag.

// Minutos desde medianoche de un "HH:MM".
export function toMins(hhmm) {
  const [h, m] = (hhmm || '').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function nowMins() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

// Estado de un evento respecto del reloj: lo que decide si la fila grita o se apaga.
export function phaseOf(ev, now) {
  const start = toMins(ev.startTime)
  const end = start + (ev.durationMins || 0)
  if (now >= end) return 'past'
  if (now >= start) return 'now'
  if (start - now <= 60) return 'soon'
  return 'later'
}

// Las dos filas se abren, cada una a lo suyo: una reunión de BlissTracker lleva a
// su detalle en el Calendario; un evento traído de afuera abre su ficha de solo
// lectura acá mismo (se edita donde vive, pero al menos se puede leer entero).
function isUntimed(ev) {
  return ev.allDay || ev.isSales || ev.isFinance || ev.isContent || !ev.startTime
}

function leadPath(user, leadId) {
  return `${user?.isAdmin ? '/admin/ventas' : '/ventas'}?lead=${leadId}`
}

function financePath(taskId) {
  return `/finanzas?tab=pendientes&task=${taskId}`
}

function contentPath(piece) {
  return `/contenido?projectId=${piece.projectId}&piece=${piece.id}`
}

function Row({ onOpen, children }) {
  return (
    <button type="button" onClick={onOpen} className="flex items-center gap-3 flex-1 min-w-0 text-left">
      {children}
    </button>
  )
}

export default function TodayEventsCard() {
  const { user } = useAuth()
  const { enabled } = useFeatureFlag('calendario')
  const allowed = enabled && !!user?.moduleAccess?.calendario
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [openExternal, setOpenExternal] = useState(null)
  const [, tick] = useState(0)

  const load = useCallback(() => {
    if (!allowed) return
    const today = todayYMD()
    // Dos fuentes, una sola agenda: las reuniones de BlissTracker y lo que haya en
    // los calendarios de afuera (Google, una URL iCal — ver ExternalCalendar). Si
    // una falla, se muestra la otra: media agenda es mejor que ninguna.
    Promise.all([
      api.get('/calendar/events', { params: { from: today, to: today } }).then(r => r.data || []).catch(() => []),
      api.get('/calendar/external-events', { params: { from: today, to: today } }).then(r => r.data || []).catch(() => []),
      api.get('/calendar/sales-actions', { params: { from: today, to: today } }).then(r => r.data || []).catch(() => []),
      api.get('/calendar/finance-tasks', { params: { from: today, to: today } }).then(r => r.data || []).catch(() => []),
      api.get('/calendar/content-pieces', { params: { from: today, to: today } }).then(r => r.data || []).catch(() => []),
    ]).then(([meetings, external, sales, finance, content]) => {
      const rows = [
        ...meetings.map(e => ({ ...e, isExternal: false })),
        ...external.map(e => ({ ...e, isExternal: true })),
        ...sales.map(a => ({
          ...a,
          isSales: true,
          allDay: true,
          title: a.companyName ? `${a.companyName}: ${a.title}` : a.title,
        })),
        ...finance.map(t => ({
          ...t,
          isFinance: true,
          allDay: true,
          title: t.itemName ? `${t.itemName}: ${t.title}` : t.title,
        })),
        ...content.map(p => ({
          ...p,
          isContent: true,
          allDay: true,
          title: p.projectName ? `${p.projectName}: ${p.title}` : p.title,
        })),
      ]
      // Lo que no tiene hora va primero: no compite con el reloj de las reuniones.
      rows.sort((a, b) => {
        const au = isUntimed(a) ? 0 : 1
        const bu = isUntimed(b) ? 0 : 1
        if (au !== bu) return au - bu
        return (a.startTime || '').localeCompare(b.startTime || '')
          || (a.title || '').localeCompare(b.title || '')
      })
      setEvents(rows)
    })
  }, [allowed])

  useEffect(() => { load() }, [load])
  useCalendarSocket(load)

  // Re-render por minuto: "falta X min" y el pasaje a "Ahora" / pasado dependen del reloj.
  useEffect(() => {
    if (!events.length) return
    const t = setInterval(() => tick(n => n + 1), 60_000)
    return () => clearInterval(t)
  }, [events.length])

  if (!allowed || events.length === 0) return null

  const now = nowMins()
  const pending = events.filter(e => !e.isExternal && (e.participants || []).some(p => p.userId === user?.id && p.status === 'pending')).length

  return (
    <section className="mb-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1.5">
        <h2 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <Icon as={CalendarDays} size={14} />
          Hoy en tu calendario · {events.length}
          {pending > 0 && (
            <span className="normal-case tracking-normal font-medium text-amber-600 dark:text-amber-400">
              · {pending} sin confirmar
            </span>
          )}
        </h2>
        <Link to="/calendario" className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
          Ver calendario →
        </Link>
      </div>
      <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
        {events.map(ev => {
          const untimed = isUntimed(ev)
          const phase = untimed ? 'later' : phaseOf(ev, now)
          const myStatus = (ev.participants || []).find(p => p.userId === user?.id)?.status
          const mins = untimed ? null : toMins(ev.startTime) - now
          const open = () => {
            if (ev.isSales) navigate(leadPath(user, ev.leadId))
            else if (ev.isFinance) navigate(financePath(ev.id))
            else if (ev.isContent) navigate(contentPath(ev))
            else if (ev.isExternal) setOpenExternal(ev)
            else navigate(`/calendario?event=${ev.id}`)
          }
          const rowKey = ev.isSales ? 's' : ev.isFinance ? 'f' : ev.isContent ? 'c' : ev.isExternal ? 'x' : 'm'
          return (
            <li key={`${rowKey}-${ev.id}`} className={phase === 'past' ? 'opacity-50' : ''}>
              <div className="flex items-center gap-3 px-4 py-2">
                <Row onOpen={open}>
                  <span className={`text-sm font-semibold tabular-nums flex-shrink-0 ${phase === 'now' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-200'}`}>
                    {untimed ? 'Día' : ev.startTime}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-gray-800 dark:text-gray-100 truncate" title={ev.title}>
                      {ev.isExternal && (
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-[1px]"
                          style={{ backgroundColor: ev.color || '#8E24AA' }}
                          title={ev.calendarName || 'Calendario externo'}
                        />
                      )}
                      {ev.recurrenceId && <Icon as={Repeat} size={12} className="inline mr-1 align-[-1px] text-gray-400" label="Recurrente" />}
                      {ev.title}
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                      {ev.isSales ? 'Ventas' : ev.isFinance ? 'Finanzas' : ev.isContent ? 'Contenido' : [
                            untimed ? null : fmtMins(ev.durationMins),
                            ev.project?.name,
                            ev.isExternal ? ev.calendarName : null,
                          ].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </Row>
                {phase === 'now' && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 flex-shrink-0">
                    {ev.realMeetingId ? 'En curso' : 'Ahora'}
                  </span>
                )}
                {phase === 'soon' && (
                  <span className="hidden sm:inline text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 tabular-nums">
                    en {mins} min
                  </span>
                )}
                {myStatus === 'pending' && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex-shrink-0">
                    Sin confirmar
                  </span>
                )}
                {ev.meetLink && phase !== 'past' && (
                  <a
                    href={ev.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Entrar a la reunión"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex-shrink-0"
                  >
                    <Icon as={Video} size={14} /><span className="hidden sm:inline">Entrar</span>
                  </a>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {openExternal && <ExternalEventModal event={openExternal} onClose={() => setOpenExternal(null)} />}
    </section>
  )
}
