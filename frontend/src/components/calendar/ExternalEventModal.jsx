import { useEffect, useState } from 'react'
import { X, Clock, MapPin, User, Video, ExternalLink, CalendarDays } from 'lucide-react'
import { Icon } from '../ui/Icon'
import api from '../../api/client'
import { fmtMins } from '../../utils/format'
import { linkify } from '../../utils/linkify'

// Detalle de un evento traído de un calendario de afuera (ver ExternalCalendar).
// Existe porque en la grilla el bloque es chico y el título va truncado: hacer
// click es la única forma de leer qué era. Es de SOLO LECTURA — el evento se
// edita donde vive, y para eso está el link al calendario de origen.
//
// Recibe `event` ya completo (la tarjeta del Dashboard lo tiene) o un `eventId`
// (la grilla, donde el bloque solo lleva el id) y lo pide.

function fmtDay(date) {
  const [y, m, d] = date.split('-').map(Number)
  const s = new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function endTime(startTime, durationMins) {
  const [h, m] = startTime.split(':').map(Number)
  const total = h * 60 + m + (durationMins || 0)
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function Line({ icon, children }) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-300">
      <Icon as={icon} size={15} className="mt-0.5 text-gray-400" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export default function ExternalEventModal({ event: initial, eventId, onClose }) {
  const [event, setEvent] = useState(initial || null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (initial || !eventId) return
    let alive = true
    api.get(`/calendar/external-events/${eventId}`)
      .then(r => { if (alive) setEvent(r.data) })
      .catch(() => { if (alive) setError('No se pudo cargar el evento.') })
    return () => { alive = false }
  }, [eventId, initial])

  const when = event && (event.allDay
    ? (event.endDate && event.endDate !== event.date
        ? `${fmtDay(event.date)} → ${fmtDay(event.endDate)} · todo el día`
        : `${fmtDay(event.date)} · todo el día`)
    : `${fmtDay(event.date)} · ${event.startTime}–${endTime(event.startTime, event.durationMins)} (${fmtMins(event.durationMins)})`)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Cerrar"
          className="absolute top-3 right-3 z-10 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
          <Icon as={X} size={20} />
        </button>

        <div className="flex-1 overflow-y-auto p-6 pr-10 space-y-4">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {!event && !error && <p className="text-sm text-gray-400">Cargando…</p>}

          {event && (
            <>
              <div className="flex items-start gap-2.5">
                <span className="mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: event.color || '#8E24AA' }} />
                <h3 className="text-base font-bold text-gray-900 dark:text-white break-words">{event.title}</h3>
              </div>

              <div className="space-y-2.5">
                <Line icon={Clock}>{when}</Line>
                {event.calendarName && (
                  <Line icon={CalendarDays}>
                    {event.calendarName}
                    <span className="text-gray-400 dark:text-gray-500"> · calendario externo</span>
                  </Line>
                )}
                {event.organizer && <Line icon={User}>{event.organizer}</Line>}
                {event.location && <Line icon={MapPin}><span className="break-words">{linkify(event.location)}</span></Line>}
              </div>

              {event.meetLink && (
                <a href={event.meetLink} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white">
                  <Icon as={Video} size={15} /> Entrar a la reunión
                </a>
              )}

              {event.description && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Detalles</p>
                  {/* Texto plano a propósito: el cuerpo de una invitación lo escribe
                      cualquiera y a veces viene con HTML — se muestra como lo que es. */}
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                    {linkify(event.description)}
                  </p>
                </div>
              )}

              {!event.canSeeDetail && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Esta persona no comparte de qué se trata: solo que tiene ese horario ocupado.
                </p>
              )}

              <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Se edita en su calendario de origen.
                </p>
                {event.url && (
                  <a href={event.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex-shrink-0">
                    Abrir ahí <Icon as={ExternalLink} size={13} />
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
