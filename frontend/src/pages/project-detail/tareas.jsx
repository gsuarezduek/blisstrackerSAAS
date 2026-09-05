import { linkify } from '../../utils/linkify'
import { completedDuration } from '../../utils/format'
import UserLink from '../../components/UserLink'
import ProjectSituation from '../../components/ProjectSituation'
import DateRangeFilter from '../../components/DateRangeFilter'
import { avatarUrl } from '../../utils/avatarUrl'
import RoleBadge from '../../components/RoleBadge'

const STATUS_LABEL = {
  BLOCKED:     'Bloqueada',
  IN_PROGRESS: 'En curso',
  PAUSED:      'Pausada',
  PENDING:     'Pendiente',
}

const STATUS_CLASS = {
  BLOCKED:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  IN_PROGRESS: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
  PAUSED:      'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  PENDING:     'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
}

const STATUS_ORDER = { BLOCKED: 0, IN_PROGRESS: 1, PAUSED: 2, PENDING: 3 }

function Avatar({ user, size = 'md' }) {
  const cls = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9'
  return (
    <img
      src={avatarUrl(user.avatar)}
      alt={user.name}
      className={`${cls} rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0`}
    />
  )
}

function fmtDate(iso, tz = 'America/Argentina/Buenos_Aires') {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz })
}

export default function TareasTab({
  data, encodedId, totalPending, navigate, onOpenComments,
  archive, archiveSkip, hasMore, archiveLoading, archiveFrom, archiveTo, archiveUserId,
  workspaceMembers, onArchiveUserChange, onArchiveDateSearch, setArchiveFrom, setArchiveTo,
  onLoadMore,
}) {
  return (
    <div className="space-y-4">
      {data.project.situationEnabled !== false && (
        <ProjectSituation
          encodedProjectId={encodedId}
          initialContent={data.project.situation || ''}
        />
      )}
      {/* Empty state for pending */}
      {totalPending === 0 && (
        <div className="text-center py-10 text-gray-400">
          <p className="text-4xl mb-3">🐝</p>
          <p className="font-medium">Todo al día</p>
          <p className="text-sm mt-1">No hay tareas pendientes en este proyecto</p>
        </div>
      )}

      {/* Tareas activas por usuario */}
      {data?.activeCount > data?.activeLimit && (
        <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-xs text-amber-700 dark:text-amber-400">
          Mostrando las primeras {data.activeLimit} tareas activas de {data.activeCount} totales. Completá o mové tareas al backlog para ver el resto.
        </div>
      )}

      {totalPending > 0 && (
        <div className="space-y-4">
          {data.byUser
            .slice()
            .sort((a, b) => {
              const aMin = Math.min(...a.tasks.map(t => STATUS_ORDER[t.status]))
              const bMin = Math.min(...b.tasks.map(t => STATUS_ORDER[t.status]))
              return aMin - bMin || a.user.name.localeCompare(b.user.name)
            })
            .map(({ user, tasks }) => (
              <div key={user.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  className="w-full text-left flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
                  onClick={() => navigate(`/users/${user.id}`)}
                  title="Ver perfil de esta persona"
                >
                  <Avatar user={user} />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{user.name}</p>
                    <RoleBadge role={user.role} userId={user.id} className="inline-block mt-0.5" />
                  </div>
                  <span className="ml-auto text-xs font-medium text-gray-500 dark:text-gray-400 flex-shrink-0">
                    {tasks.length} tarea{tasks.length !== 1 ? 's' : ''}
                  </span>
                </button>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {tasks
                    .slice()
                    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
                    .map(task => (
                      <div key={task.id} className={`flex flex-col gap-1.5 px-4 py-3 ${task.status === 'BLOCKED' ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                        <div className="flex items-start gap-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${STATUS_CLASS[task.status]}`}>
                            {STATUS_LABEL[task.status]}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p
                              onClick={() => onOpenComments(task)}
                              className="text-sm text-gray-700 dark:text-gray-300 leading-snug whitespace-pre-wrap break-words cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                            >{linkify(task.description)}</p>
                            {task.createdBy && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                Creada por {task.createdBy.name.split(' ')[0]}
                              </p>
                            )}
                            <div className="mt-1">
                              {(task._count?.comments ?? 0) > 0 ? (
                                <button
                                  onClick={() => onOpenComments(task)}
                                  className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                >
                                  💬 {task._count.comments} comentario{task._count.comments !== 1 ? 's' : ''}
                                </button>
                              ) : (
                                <button
                                  onClick={() => onOpenComments(task)}
                                  title="Agregar comentario"
                                  className="text-xs text-gray-300 dark:text-gray-600 hover:text-primary-500 dark:hover:text-primary-400 transition-colors"
                                >
                                  💬 Comentar
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        {task.status === 'BLOCKED' && task.blockedReason && (
                          <div className="ml-0 flex items-start gap-1.5 pl-2 border-l-2 border-red-300 dark:border-red-700">
                            <p className="text-xs text-red-600 dark:text-red-400">{task.blockedReason}</p>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ))}

        </div>
      )}

      {/* Tareas completadas — persona + tarea + fecha + duración, con filtro de fecha y persona */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tareas completadas</span>
          <select
            value={archiveUserId}
            onChange={onArchiveUserChange}
            className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Todas las personas</option>
            {workspaceMembers.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

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
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
            {archive.map(task => {
              const dur = completedDuration(task)
              return (
                <div key={task.id} className="flex items-start gap-3 px-4 py-3">
                  <Avatar user={task.user} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug whitespace-pre-wrap break-words">{linkify(task.description)}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{task.user.name}</span>
                      <RoleBadge userId={task.user.id} />
                      <span>· {fmtDate(task.completedAt, data?.project?.timezone)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                    <button
                      onClick={() => onOpenComments(task)}
                      title="Ver comentarios"
                      className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    >
                      💬{(task._count?.comments ?? 0) > 0 ? ` ${task._count.comments}` : ''}
                    </button>
                    {dur && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-medium flex items-center gap-1">
                        {task.minutesOverride != null && <span className="text-amber-500" title="Duración editada manualmente">✎</span>}
                        {dur}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {archiveLoading && archive.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Cargando...</p>
        )}
        {!archiveLoading && hasMore && (
          <button
            onClick={() => onLoadMore(archiveSkip)}
            className="w-full mt-3 py-2.5 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors"
          >
            Cargar más
          </button>
        )}
      </div>
    </div>
  )
}
