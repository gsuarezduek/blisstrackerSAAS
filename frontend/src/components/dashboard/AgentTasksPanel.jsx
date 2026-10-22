import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Repeat } from 'lucide-react'
import api from '../../api/client'
import { Icon } from '../ui/Icon'
import { OverflowMenu } from '../TaskCard'
import { agentName } from '../../hooks/useMyAgents'
import { fmtMins, activeMinutes, completedMinutes, fmtCreatedAt, createdAtTitle } from '../../utils/format'

// Pestaña "Agentes" del Dashboard: las tareas que ejecutan mis agentes de IA
// (Task.isAgentTask), separadas de mi foco. Siguen a mi nombre — soy quien las
// supervisa —, pero no ocupan mi tarea en curso ni se mezclan con mis listas.
// Lo que necesita intervención (bloqueadas = el agente pidiendo ayuda) va primero.

const GROUPS = [
  { key: 'blocked',   title: 'Necesitan tu ayuda', tone: 'danger' },
  { key: 'running',   title: 'Trabajando ahora' },
  { key: 'pending',   title: 'En su lista' },
  { key: 'scheduled', title: 'Programadas' },
  { key: 'done',      title: 'Completadas hoy' },
]

export function groupAgentTasks(tasks, today) {
  const g = { blocked: [], running: [], pending: [], scheduled: [], done: [] }
  for (const t of tasks) {
    if (t.status === 'COMPLETED') g.done.push(t)
    else if (t.status === 'BLOCKED') g.blocked.push(t)
    else if (t.status === 'IN_PROGRESS') g.running.push(t)
    else if (t.scheduledFor && t.scheduledFor > today) g.scheduled.push(t)
    else g.pending.push(t)
  }
  g.scheduled.sort((a, b) => (a.scheduledFor > b.scheduledFor ? 1 : -1))
  g.done.sort((a, b) => new Date(b.completedAt ?? 0) - new Date(a.completedAt ?? 0))
  return g
}

function AgentTaskRow({ task, today, onChanged, onReturned, onOpenComments }) {
  const [loading, setLoading] = useState(false)

  async function run(fn) {
    setLoading(true)
    try { await fn() } catch (err) {
      if (err.response?.data?.error) alert(err.response.data.error)
    } finally { setLoading(false) }
  }

  const returnToMe = scope => run(async () => {
    const { data } = await api.patch(`/tasks/${task.id}/agent${scope === 'series' ? '?scope=series' : ''}`, { executor: 'user' })
    onReturned(data, scope)
  })

  const menu = []
  if (onOpenComments) menu.push({ label: 'Abrir detalle', onClick: () => onOpenComments(task) })
  if (['PENDING', 'PAUSED', 'BLOCKED'].includes(task.status)) {
    menu.push({ label: 'Devolverme la tarea', onClick: () => returnToMe('one') })
    if (task.recurrenceId) menu.push({ label: 'Devolverme la serie', onClick: () => returnToMe('series') })
  }

  // Desbloquear = "ya resolví lo que lo frenaba": vuelve a en curso y el agente la
  // retoma cuando revise su lista.
  const primary = task.status === 'BLOCKED'
    ? { label: 'Desbloquear', onClick: () => run(async () => { const { data } = await api.patch(`/tasks/${task.id}/unblock`); onChanged(data) }) }
    : null

  const scheduledLabel = task.scheduledFor && task.scheduledFor > today && task.status !== 'COMPLETED'
    ? new Date(`${task.scheduledFor}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
    : null
  const mins = task.status === 'COMPLETED' ? completedMinutes(task) : activeMinutes(task)

  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 ${loading ? 'opacity-60' : ''}`}>
      <span className={`mt-0.5 w-5 h-5 flex items-center justify-center flex-shrink-0 ${task.status === 'IN_PROGRESS' ? 'text-primary-500' : 'text-gray-400'}`}>
        <Icon as={Bot} size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <p
          onClick={() => onOpenComments?.(task)}
          className={`text-[15px] leading-snug break-words ${task.status === 'COMPLETED' ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'} ${onOpenComments ? 'cursor-pointer hover:text-primary-700 dark:hover:text-primary-400' : ''}`}
        >
          {task.description}
        </p>
        <div className="flex items-center gap-x-2.5 gap-y-1 mt-1.5 flex-wrap text-xs text-gray-500 dark:text-gray-400">
          <Link to={`/my-projects/${task.project.id}`} className="font-medium text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">
            {task.project.name}
          </Link>
          <span>{task.agent ? agentName(task.agent, task.agentName) : 'Cualquiera de mis agentes'}</span>
          {scheduledLabel && <span className="text-indigo-600 dark:text-indigo-300 capitalize">Aparece el {scheduledLabel}</span>}
          {task.recurrenceId && <span className="inline-flex items-center gap-1" title="Tarea recurrente"><Icon as={Repeat} size={13} />Recurrente</span>}
          {task.createdAt && <span title={createdAtTitle(task.createdAt)}>Creada {fmtCreatedAt(task.createdAt)}</span>}
          {mins > 0 && <span>{fmtMins(mins)}</span>}
        </div>
        {task.status === 'BLOCKED' && task.blockedReason && (
          <p className="mt-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            <span className="font-medium">Bloqueada:</span> {task.blockedReason}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {primary && (
          <button type="button" onClick={primary.onClick} disabled={loading}
            className="text-sm font-medium rounded-lg px-3 py-1.5 whitespace-nowrap transition-colors disabled:opacity-50 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-primary-400 hover:text-primary-700 hover:bg-primary-50 dark:hover:bg-gray-700">
            {loading ? '…' : primary.label}
          </button>
        )}
        <OverflowMenu items={menu} />
      </div>
    </div>
  )
}

export default function AgentTasksPanel({ tasks, today, hasAgents, onChanged, onReturned, onOpenComments }) {
  if (tasks.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 px-1 py-6 text-center">
        {hasAgents
          ? 'Tus agentes no tienen tareas. Delegales una desde el menú ⋯ de cualquier tarea, o elegí "La hace mi agente" al crearla.'
          : 'Conectá un agente de IA desde Preferencias → Agentes IA para delegarle tareas.'}
      </p>
    )
  }
  const groups = groupAgentTasks(tasks, today)
  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 px-1">
        Lo que hacen tus agentes de IA. No ocupa tu tarea en curso; si un agente se traba, la tarea aparece primero acá.
      </p>
      {GROUPS.filter(gr => groups[gr.key].length > 0).map(gr => (
        <section key={gr.key}>
          <div className="flex items-baseline gap-2 mb-2 px-1">
            <h3 className={`text-sm font-semibold ${gr.tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{gr.title}</h3>
            <span className="text-xs text-gray-400">{groups[gr.key].length}</span>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/70">
            {groups[gr.key].map(t => (
              <AgentTaskRow key={t.id} task={t} today={today} onChanged={onChanged} onReturned={onReturned} onOpenComments={onOpenComments} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
