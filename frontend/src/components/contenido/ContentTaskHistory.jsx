import { fmtMins, activeMinutes, completedMinutes } from '../../utils/format'
import { formatDateTime } from './dateHelpers'

// Una pieza real pasa por varios responsables/tareas a lo largo de su vida (ej.
// CM arma el copy → diseñador arma el reel → CM revisa → CM publica) — esta
// lista muestra cada tramo por separado, con quién lo trabajó y cuánto tiempo
// le llevó, en vez de una única "tarea de la pieza" (ver ContentPiece.tasks).
const STATUS_META = {
  PENDING:     { label: 'Pendiente',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  IN_PROGRESS: { label: 'En curso',   cls: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' },
  PAUSED:      { label: 'Pausada',    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  BLOCKED:     { label: 'Bloqueada',  cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  COMPLETED:   { label: 'Completada', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
}

function minutesOf(task) {
  if (task.status === 'COMPLETED') return completedMinutes(task) ?? activeMinutes(task)
  return activeMinutes(task)
}

export default function ContentTaskHistory({ tasks }) {
  if (!tasks?.length) return null

  return (
    <div className="sm:col-span-2">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
        🧵 Tramos de trabajo ({tasks.length})
      </p>
      <div className="space-y-1">
        {tasks.map(t => {
          const meta = STATUS_META[t.status] || STATUS_META.PENDING
          return (
            <div key={t.id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-900/40 text-sm">
              <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${meta.cls}`}>
                {meta.label}
              </span>
              <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-200">
                {t.user?.name ?? 'Sin responsable'}
              </span>
              <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                {fmtMins(minutesOf(t))}
              </span>
              <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">
                {formatDateTime(t.createdAt)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
