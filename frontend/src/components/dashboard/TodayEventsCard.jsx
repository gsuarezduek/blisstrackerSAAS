import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, Repeat, Video } from 'lucide-react'
import { Icon } from '../ui/Icon'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useFeatureFlag } from '../../hooks/useFeatureFlag'
import { useCalendarSocket } from '../calendar/useCalendarSocket'
import { todayYMD } from '../calendar/dateHelpers'
import { fmtMins } from '../../utils/format'

// "Hoy en tu calendario": las reuniones de HOY donde participo, debajo del insight
// diario. Responde "¿tengo algo con hora fija antes de ponerme con una tarea?", que
// el Dashboard no contestaba — las reuniones solo se veían en /calendario (y, al
// aceptarlas, como una tarea más entre las demás).
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

// La fila es un botón solo cuando hay algo que abrir: una reunión de BlissTracker
// lleva a su detalle en el Calendario, un evento traído de afuera no existe como
// reunión acá (se edita en Google, o donde viva ese calendario).
function Row({ isExternal, onOpen, children }) {
  if (isExternal) return <div className="flex items-center gap-3 flex-1 min-w-0">{children}</div>
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
    ]).then(([meetings, external]) => {
      const rows = [
        ...meetings.map(e => ({ ...e, isExternal: false })),
        // Los de día completo no tienen hora a la que ir: no entran en una agenda
        // ordenada por horario (se ven en el Calendario, en la franja "Sin hora").
        ...external.filter(e => !e.allDay && e.startTime).map(e => ({ ...e, isExternal: true })),
      ]
      rows.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
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
          const phase = phaseOf(ev, now)
          const myStatus = (ev.participants || []).find(p => p.userId === user?.id)?.status
          const mins = toMins(ev.startTime) - now
          return (
            <li key={`${ev.isExternal ? 'x' : 'm'}-${ev.id}`} className={phase === 'past' ? 'opacity-50' : ''}>
              <div className="flex items-center gap-3 px-4 py-2">
                <Row isExternal={ev.isExternal} onOpen={() => navigate(`/calendario?event=${ev.id}`)}>
                  <span className={`text-sm font-semibold tabular-nums flex-shrink-0 ${phase === 'now' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-200'}`}>
                    {ev.startTime}
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
                      {fmtMins(ev.durationMins)}
                      {ev.project && ` · ${ev.project.name}`}
                      {ev.isExternal && ev.calendarName && ` · ${ev.calendarName}`}
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
    </section>
  )
}
