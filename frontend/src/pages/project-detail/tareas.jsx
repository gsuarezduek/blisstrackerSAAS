import { useState } from 'react'
import { linkify } from '../../utils/linkify'
import { completedDuration, fmtCreatedAt, createdAtTitle } from '../../utils/format'
import DateRangeFilter from '../../components/DateRangeFilter'
import RoleBadge from '../../components/RoleBadge'
import UserLink from '../../components/UserLink'
import { Card, Avatar, StatusBadge, STATUS_META } from './ui'
import { Repeat, MessageSquare, Pencil } from 'lucide-react'
import { Icon } from '../../components/ui/Icon'
import AgentTag from '../../components/ui/AgentTag'
import AgentAvatar from '../../components/ui/AgentAvatar'
import AgentLink from '../../components/AgentLink'

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

function TaskRow({ task, onOpenComments, hideAgentTag = false }) {
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
            {!hideAgentTag && <AgentTag task={task} />}
            {task.recurrenceId && <span className="inline-flex items-center gap-1"><Icon as={Repeat} size={13} />Recurrente</span>}
            {task.createdBy && <span>De {task.createdBy.name.split(' ')[0]}</span>}
            {task.createdAt && <span title={createdAtTitle(task.createdAt)}>Creada {fmtCreatedAt(task.createdAt)}</span>}
            <button type="button" onClick={() => onOpenComments(task)} className="inline-flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400">
              <Icon as={MessageSquare} size={13} />{comments > 0 ? comments : 'Comentar'}
            </button>
          </div>
          {blocked && task.blockedReason && (
            <p className="mt-1.5 text-xs text-red-700 dark:text-red-400 border-l-2 border-red-300 dark:border-red-700 pl-2">{task.blockedReason}</p>
          )}
      </div>
    </li>
  )
}

// Cabecera de una tarjeta de agente: su color, su nombre, su rol y de quién es. Las
// tareas siguen siendo responsabilidad del dueño, así que el dueño se nombra siempre.
function AgentCardHeader({ group }) {
  const { agent, owner, tasks } = group
  return (
    <AgentLink agentId={agent?.id} as="div"
      className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer">
      <AgentAvatar agent={agent} size="sm" />
      <p className="font-semibold text-gray-900 dark:text-white text-sm">{agentLabelOf(group)}</p>
      {agent?.teamRole && <RoleBadge role={agent.teamRole} />}
      <span className="text-xs text-gray-400 dark:text-gray-500">de {owner.name.split(' ')[0]}</span>
      <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">{tasks.length} tarea{tasks.length !== 1 ? 's' : ''}</span>
    </AgentLink>
  )
}

// Nombre visible de un agente de un grupo de `byAgent` (sin agente = delegada a
// "cualquiera de los agentes" de esa persona y todavía sin tomar).
function agentLabelOf(g) {
  if (!g.agent) return `Agentes de ${g.owner.name.split(' ')[0]}`
  return g.agent.label || `Agente #${g.agent.id}`
}

// Nombre con el que se ordenan las tarjetas, sea de persona o de agente.
function labelOf(g) {
  return g.kind === 'agent' ? agentLabelOf(g) : g.user.name
}

export default function TareasTab({
  data, onOpenComments, statusFilter, setStatusFilter,
  archive, archiveSkip, hasMore, archiveLoading, archiveFrom, archiveTo, archiveUserId, archiveAgentId,
  workspaceMembers, onArchiveUserChange, onArchiveAgentChange, onArchiveDateSearch, setArchiveFrom, setArchiveTo,
  onLoadMore,
}) {
  // Los agentes del EQUIPO del proyecto, para el filtro del historial: un agente que
  // trabajó acá una vez sin estar en el equipo igual aparece rotulado por fila.
  const projectAgents = (data.project.agents ?? []).map(pa => pa.agent)
  const [showCompleted, setShowCompleted] = useState(true)
  // Filtro por ejecutor. El valor es `u:<id>` o `a:<key del grupo>` para que una persona
  // y un agente no puedan colisionar por id.
  const [ownerFilter, setOwnerFilter] = useState('')

  const agentGroups = data.byAgent ?? []
  const all = [...data.byUser.flatMap(u => u.tasks), ...agentGroups.flatMap(g => g.tasks)]
  const counts = all.reduce((acc, t) => ({ ...acc, [t.status]: (acc[t.status] || 0) + 1 }), {})

  // Las tareas de agente ya no se ordenan dentro de la tarjeta de la persona: tienen
  // tarjeta propia. Por eso desapareció el `agentSortKey` que las mantenía juntas acá
  // dentro — era el parche de que estuvieran mezcladas.
  const byStatusThenNew = (a, b) =>
    STATUS_META[a.status].order - STATUS_META[b.status].order
    || new Date(b.createdAt) - new Date(a.createdAt)

  const visible = tasks => tasks.filter(t => !statusFilter || t.status === statusFilter).sort(byStatusThenNew)

  const userGroups = data.byUser
    .map(({ user, tasks }) => ({ kind: 'user', id: `u:${user.id}`, user, tasks: visible(tasks) }))
    .filter(g => g.tasks.length > 0)

  const agentCards = agentGroups
    .map(g => ({ kind: 'agent', id: `a:${g.key}`, agent: g.agent, owner: g.owner, tasks: visible(g.tasks) }))
    .filter(g => g.tasks.length > 0)

  // Un solo orden para las dos clases de tarjeta: lo más urgente arriba, sin que las de
  // agente queden siempre relegadas al final.
  const groups = [...userGroups, ...agentCards]
    .filter(g => !ownerFilter || g.id === ownerFilter)
    .sort((a, b) =>
      STATUS_META[a.tasks[0].status].order - STATUS_META[b.tasks[0].status].order
      || labelOf(a).localeCompare(labelOf(b))
    )

  // Opciones del filtro: se arman de los grupos SIN filtrar por estado, así elegir un
  // responsable no hace desaparecer su propia opción de la lista.
  const ownerOptions = [
    ...data.byUser.map(({ user }) => ({ value: `u:${user.id}`, label: user.name })),
    ...agentGroups.map(g => ({ value: `a:${g.key}`, label: agentLabelOf(g) })),
  ]

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

      {/* Filtro por responsable: personas y agentes como opciones propias. Solo aparece
          si hay más de un ejecutor; con uno solo no filtra nada. */}
      {ownerOptions.length > 1 && (
        <div className="flex items-center gap-2 -mt-3">
          <label htmlFor="tareas-owner-filter" className="text-xs text-gray-500 dark:text-gray-400">Responsable</label>
          <select
            id="tareas-owner-filter"
            value={ownerFilter}
            onChange={e => setOwnerFilter(e.target.value)}
            className="text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Todos</option>
            {ownerOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}

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
          {groups.map(g => (
            <Card key={g.id} className="overflow-hidden">
              {g.kind === 'agent' ? (
                <AgentCardHeader group={g} />
              ) : (
                <UserLink userId={g.user.id} as="div"
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer">
                  <Avatar user={g.user} size="sm" />
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{g.user.name}</p>
                  <RoleBadge userId={g.user.id} />
                  <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">{g.tasks.length} tarea{g.tasks.length !== 1 ? 's' : ''}</span>
                </UserLink>
              )}
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {g.tasks.map(task => (
                  // Dentro de la tarjeta de un agente el rótulo sería redundante: ya
                  // dice de quién es la tarjeta.
                  <TaskRow key={task.id} task={task} onOpenComments={onOpenComments} hideAgentTag={g.kind === 'agent'} />
                ))}
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
            <div className="flex items-center gap-2">
              <select value={archiveUserId} onChange={onArchiveUserChange}
                className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">Todas las personas</option>
                {workspaceMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {/* Filtro por agente, aparte del de persona: filtra por EJECUTOR. Solo
                  aparece si el proyecto tiene agentes en el equipo. */}
              {(projectAgents.length > 0) && (
                <select value={archiveAgentId ?? ''} onChange={onArchiveAgentChange}
                  className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="">Todos los agentes</option>
                  {projectAgents.map(a => <option key={a.id} value={a.id}>{a.label || `Agente #${a.id}`}</option>)}
                </select>
              )}
            </div>
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
                      {/* La cara de quien la hizo: el agente si fue un agente. Antes
                          toda fila llevaba el avatar del dueño y el agente quedaba como
                          texto entre paréntesis. */}
                      {task.isAgentTask
                        ? <AgentAvatar agent={task.agent} size="sm" />
                        : <Avatar user={task.user} size="sm" />}
                      <div className="min-w-0 flex-1">
                        <p onClick={() => onOpenComments(task)}
                          className="text-sm text-gray-700 dark:text-gray-300 leading-snug whitespace-pre-wrap break-words cursor-pointer hover:text-primary-600 dark:hover:text-primary-400">
                          {linkify(task.description)}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {task.isAgentTask ? (
                            <>
                              <AgentTag task={task} size={12} fallback={`Agente de ${task.user.name.split(' ')[0]}`} />
                              {task.agent && <span> · de {task.user.name.split(' ')[0]}</span>}
                            </>
                          ) : task.user.name}
                          {' · '}Completada {fmtDate(task.completedAt, data?.project?.timezone)}
                          {task.createdAt && <span title={createdAtTitle(task.createdAt)}> · Creada {fmtCreatedAt(task.createdAt)}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                        <button type="button" onClick={() => onOpenComments(task)} title="Ver comentarios"
                          className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400">
                          <Icon as={MessageSquare} size={13} />{(task._count?.comments ?? 0) > 0 ? task._count.comments : ''}
                        </button>
                        {dur && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium tabular-nums">
                            {task.minutesOverride != null && <span className="inline-flex align-[-2px] text-amber-500 mr-1" title="Duración editada manualmente"><Icon as={Pencil} size={11} /></span>}
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
