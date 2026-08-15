import LoadingSpinner from '../LoadingSpinner'
import { statusMeta, statusDotClass } from './contentCatalog'

const ACTION_LABEL = {
  created:           'creó la pieza',
  status_change:     'cambió el estado',
  submitted:         'la envió a aprobación',
  approved:          'aprobó la pieza',
  changes_requested: 'pidió cambios',
  published:         'la marcó como publicada',
  task_completed:    'completó la tarea vinculada',
}

function formatWhen(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function EventRow({ event, isLast }) {
  const isClient = !!event.actorContactId
  const actorLabel = event.actorName || (isClient ? 'El cliente' : 'Alguien del equipo')
  const label = ACTION_LABEL[event.action] || event.action

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center pt-1">
        <span className={`w-2 h-2 rounded-full ${event.toStatus ? statusDotClass(event.toStatus) : 'bg-gray-300'}`} />
        {!isLast && <span className="flex-1 w-px bg-gray-200 dark:bg-gray-700 mt-1" />}
      </div>
      <div className="pb-4 min-w-0">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <span className="font-medium text-gray-900 dark:text-gray-100">{actorLabel}</span>
          {isClient && <span className="text-xs text-amber-600 dark:text-amber-400 font-medium"> (cliente)</span>}
          {' '}{label}
          {event.fromStatus && event.toStatus && (
            <span className="text-gray-400 dark:text-gray-500">
              {' '}({statusMeta(event.fromStatus).label} → {statusMeta(event.toStatus).label})
            </span>
          )}
        </p>
        {event.comment && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5 whitespace-pre-line">
            {event.comment}
          </p>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{formatWhen(event.createdAt)}</p>
      </div>
    </li>
  )
}

export default function ContentHistoryList({ events, loading, error }) {
  if (loading) return <div className="py-8"><LoadingSpinner /></div>
  if (error) return <p className="text-sm text-red-600 dark:text-red-400 py-4">{error}</p>
  if (!events.length) return <p className="text-sm text-gray-400 dark:text-gray-500 py-4">Sin actividad todavía.</p>

  return (
    <ul className="pt-1">
      {events.map((e, i) => <EventRow key={e.id} event={e} isLast={i === events.length - 1} />)}
    </ul>
  )
}
