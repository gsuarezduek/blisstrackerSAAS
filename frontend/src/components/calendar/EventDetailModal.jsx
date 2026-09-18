import { useState } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { avatarUrl } from '../../utils/avatarUrl'

const STATUS_LABEL = { accepted: 'Confirmado', declined: 'Rechazó', pending: 'Sin responder' }
const STATUS_DOT = { accepted: 'bg-green-500', declined: 'bg-red-500', pending: 'bg-gray-300' }

/**
 * Detalle de un CalendarEvent: aceptar/rechazar (invitado), cancelar (organizador,
 * solo antes de iniciar), e "Iniciar reunión" (conecta con la ProjectMeeting real —
 * ver calendar.controller.js#startMeetingFromEvent).
 */
export default function EventDetailModal({ event, onClose, onChanged, onDeleted, onStarted }) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!event) return null

  const isOrganizer = event.organizerId === user.id
  const myParticipation = event.participants.find(p => p.userId === user.id)
  const canRespond = !!myParticipation && !isOrganizer && !event.realMeetingId

  async function respond(status) {
    setBusy(true); setError('')
    try {
      const res = await api.post(`/calendar/events/${event.id}/respond`, { status })
      onChanged(res.data)
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo responder')
    } finally {
      setBusy(false)
    }
  }

  async function cancelEvent() {
    if (!window.confirm('¿Cancelar esta reunión? Se avisa a todos los invitados.')) return
    setBusy(true); setError('')
    try {
      await api.delete(`/calendar/events/${event.id}`)
      onDeleted(event.id)
      onClose()
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo cancelar')
      setBusy(false)
    }
  }

  async function startMeeting() {
    setBusy(true); setError('')
    try {
      const res = await api.post(`/calendar/events/${event.id}/start-meeting`, {})
      onStarted(res.data)
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo iniciar la reunión')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white">{event.title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {event.date} · {event.startTime} · {event.durationMins} min
          </p>
          {event.project && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Proyecto: {event.project.name}</p>}
        </div>

        {event.meetLink && (
          <a href={event.meetLink} target="_blank" rel="noreferrer" className="text-sm text-primary-600 hover:underline break-all">
            🔗 {event.meetLink}
          </a>
        )}

        {event.notes && <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{event.notes}</p>}

        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Participantes</p>
          <div className="flex flex-col gap-1">
            {event.participants.map(p => (
              <div key={p.userId} className="flex items-center gap-2 text-sm">
                <img src={avatarUrl(p.user?.avatar)} alt="" className="w-5 h-5 rounded-full object-cover" />
                <span className="text-gray-700 dark:text-gray-300">{p.user?.name}</span>
                {p.userId === event.organizerId && <span className="text-[10px] text-gray-400 dark:text-gray-500">(organizador)</span>}
                <span className={`ml-auto w-2 h-2 rounded-full ${STATUS_DOT[p.status]}`} title={STATUS_LABEL[p.status]} />
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex flex-col gap-2 pt-2">
          {canRespond && (
            <div className="flex gap-3">
              <button
                onClick={() => respond('declined')} disabled={busy}
                className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
              >
                Rechazar
              </button>
              <button
                onClick={() => respond('accepted')} disabled={busy}
                className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
              >
                Aceptar
              </button>
            </div>
          )}

          {isOrganizer && !event.realMeetingId && (
            <button
              onClick={cancelEvent} disabled={busy}
              className="w-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl py-2 text-sm font-medium transition-colors disabled:opacity-60"
            >
              Cancelar reunión
            </button>
          )}

          {event.projectId && !event.realMeetingId && (
            <button
              onClick={startMeeting} disabled={busy}
              className="w-full bg-green-600 hover:bg-green-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
            >
              ▶ Iniciar reunión
            </button>
          )}

          {event.realMeetingId && (
            <p className="text-xs text-center text-gray-400 dark:text-gray-500">Esta reunión ya se inició — el tiempo de los participantes que aceptaron ya está corriendo.</p>
          )}
        </div>
      </div>
    </div>
  )
}
