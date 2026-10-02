import { useState } from 'react'
import { linkify } from '../../utils/linkify'
import { completedDuration } from '../../utils/format'
import DateRangeFilter from '../../components/DateRangeFilter'
import RoleBadge from '../../components/RoleBadge'
import UserLink from '../../components/UserLink'
import { Card, Avatar, StatusBadge, STATUS_META } from './ui'

// Pestaña "Tareas" — el tablero completo del proyecto. Filtro por estado arriba
// (con conteo, así "Bloqueadas" se ve de un vistazo), tareas activas agrupadas
// por persona en filas compactas, y el historial de completadas debajo en un
// bloque plegable con sus filtros de fecha/persona.

function fmtDate(iso, tz = 'America/Argentina/Buenos_Aires') {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz })
}

const FILTERS = [
  { key: '',            label: 'Todas' },
  { key: 'BLOCKED',     label: 'Bloqueadas' },
  { key: 'IN_PROGRESS', label: 'En curso' },
  { key: 'PAUSED',      label: 'Pausadas' },
  { key: 'PENDING',     label: 'Pendientes' },
]

function TaskRow({ task, onOpenComments }) {
  const comments = task._count?.comments ?? 0
  const blocked = task.status === 'BLOCKED'
  return (
    <li className={`px-4 py-3 ${blocked ? 'bg-red-50/60 dark:bg-red-900/10' : ''}`}>
      <div className="min-w-0">
          <p onClick={() => onOpenComments(task)}
            className="text-sm text-gray-800 dark:text-gray-200 leading-snug whitespace-pre-wrap break-words cursor-pointer hover:text-primary-600 dark:hover:text-primary-400">
            {linkify(task.description)}
          </p>
          <div className="mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-gray-500 dark:text-gray-400">
            <StatusBadge status={task.status} />
            {task.recurrenceId && <span>🔁 Recurrente</span>}
            {task.createdBy && <span>De {task.createdBy.name.split(' ')[0]}</span>}
            <button type="button" onClick={() => onOpenComments(task)} className="hover:text-primary-600 dark:hover:text-primary-400">
              💬 {comments > 0 ? comments : 'Comentar'}
            </button>
          </div>
          {blocked && task.blockedReason && (
            <p className="mt-1.5 text-xs text-red-700 dark:text-red-400 border-l-2 border-red-300 dark:border-red-700 pl-2">{task.blockedReason}</p>
          )}
      </div>
    </li>
  )
}

export default function TareasTab({
  data, onOpenComments, statusFilter, setStatusFilter,
  archive, archiveSkip, hasMore, archiveLoading, archiveFrom, archiveTo, archiveUserId,
  workspaceMembers, onArchiveUserChange, onArchiveDateSearch, setArchiveFrom, setArchiveTo,
  onLoadMore,
}) {
  const [showCompleted, setShowCompleted] = useState(true)

  const all = data.byUser.flatMap(u => u.tasks)
  const counts = all.reduce((acc, t) => ({ ...acc, [t.status]: (acc[t.status] || 0) + 1 }), {})

  const groups = data.byUser
    .map(({ user, tasks }) => ({
      user,
      tasks: tasks
        .filter(t => !statusFilter || t.status === statusFilter)
        .sort((a, b) => STATUS_META[a.status].order - STATUS_META[b.status].order),
    }))
    .filter(g => g.tasks.length > 0)
    .sort((a, b) => STATUS_META[a.tasks[0].status].order - STATUS_META[b.tasks[0].status].order || a.user.name.localeCompare(b.user.name))

  return (
    <div className="space-y-6">
      {/* Filtro por estado */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1">
        {FILTERS.map(f => {
          const n = f.key ? (counts[f.key] || 0) : all.length
          const active = statusFilter === f.key
          const danger = f.key === 'BLOCKED' && n > 0
          if (f.key && n === 0 && !active) return null
          return (
            <button key={f.key || 'all'} type="button" onClick={() => setStatusFilter(f.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                active
                  ? danger ? 'bg-red-600 border-red-600 text-white' : 'bg-gray-900 dark:bg-white border-gray-900 dark:border-white text-white dark:text-gray-900'
                  : danger ? 'bg-white dark:bg-gray-800 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'}`}>
              {f.label}
              <span className={`text-xs tabular-nums ${active ? 'opacity-80' : 'text-gray-400 dark:text-gray-500'}`}>{n}</span>
            </button>
          )
        })}
      </div>

      {data?.activeCount > data?.activeLimit && (
        <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-xs text-amber-700 dark:text-amber-400">
          Mostrando las primeras {data.activeLimit} tareas activas de {data.activeCount} totales. Completá o mové tareas al backlog para ver el resto.
        </div>
      )}

      {/* Tareas activas por persona */}
      {all.length === 0 ? (
        <Card className="px-6 py-10 text-center">
          <p className="text-base font-semibold text-gray-900 dark:text-white">Todo al día</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">No hay tareas activas en este proyecto. Creá una con «+ Nueva tarea» o la tecla N.</p>
        </Card>
      ) : groups.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No hay tareas con ese estado.</p>
      ) : (
        <div className="space-y-3">
          {groups.map(({ user, tasks }) => (
            <Card key={user.id} className="overflow-hidden">
              <UserLink userId={user.id} as="div"
                className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer">
                <Avatar user={user} size="sm" />
                <p className="font-semibold text-gray-900 dark:text-white text-sm">{user.name}</p>
                <RoleBadge userId={user.id} />
                <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">{tasks.length} tarea{tasks.length !== 1 ? 's' : ''}</span>
              </UserLink>
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {tasks.map(task => <TaskRow key={task.id} task={task} onOpenComments={onOpenComments} />)}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {/* Historial de completadas */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <button type="button" onClick={() => setShowCompleted(v => !v)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            aria-expanded={showCompleted}>
            <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 transition-transform ${showCompleted ? 'rotate-90' : ''}`}>
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
            </svg>
            Completadas
          </button>
          {showCompleted && (
            <select value={archiveUserId} onChange={onArchiveUserChange}
              className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Todas las personas</option>
              {workspaceMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
        </div>

        {showCompleted && (
          <>
            <DateRangeFilter
              from={archiveFrom} to={archiveTo}
              onFromChange={setArchiveFrom} onToChange={setArchiveTo}
              onSearch={onArchiveDateSearch} loading={archiveLoading}
              searchLabel="Filtrar"
            />

            {archive.length === 0 && !archiveLoading && (
              <p className="text-sm text-gray-400 text-center py-8">No hay tareas completadas en este período</p>
            )}
            {archive.length > 0 && (
              <Card className="divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
                {archive.map(task => {
                  const dur = completedDuration(task)
                  return (
                    <div key={task.id} className="flex items-start gap-3 px-4 py-3">
                      <Avatar user={task.user} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p onClick={() => onOpenComments(task)}
                          className="text-sm text-gray-700 dark:text-gray-300 leading-snug whitespace-pre-wrap break-words cursor-pointer hover:text-primary-600 dark:hover:text-primary-400">
                          {linkify(task.description)}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {task.user.name} · {fmtDate(task.completedAt, data?.project?.timezone)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                        <button type="button" onClick={() => onOpenComments(task)} title="Ver comentarios"
                          className="text-xs text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400">
                          💬{(task._count?.comments ?? 0) > 0 ? ` ${task._count.comments}` : ''}
                        </button>
                        {dur && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium tabular-nums">
                            {task.minutesOverride != null && <span className="text-amber-500 mr-0.5" title="Duración editada manualmente">✎</span>}
                            {dur}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </Card>
            )}
            {archiveLoading && archive.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Cargando...</p>}
            {!archiveLoading && hasMore && (
              <button type="button" onClick={() => onLoadMore(archiveSkip)}
                className="w-full mt-3 py-2.5 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium">
                Cargar más
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
