import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import TaskCommentsModal from '../components/TaskCommentsModal'
import UserLink from '../components/UserLink'
import RoleBadge from '../components/RoleBadge'
import AgentAvatar from '../components/ui/AgentAvatar'
import api from '../api/client'
import { renderRichText } from '../utils/richText'
import { fmtMins } from '../utils/format'
import useMembers from '../hooks/useMembers'
import { Webhook, AlarmClock } from 'lucide-react'
import { Icon } from '../components/ui/Icon'

// Ficha de un agente de IA — el espejo de /users/:id para la otra mitad del equipo.
//
// Es la pantalla que convierte a un agente de "una credencial en Preferencias" en algo
// a lo que se puede apuntar: quién es, de quién es, en qué cuentas trabaja, qué hizo y
// qué tiene trabado. Deliberadamente NO muestra nada de la credencial (ni la URL del
// webhook ni el token): eso vive en Preferencias → Agentes IA, que es del dueño. Acá los
// canales son dos booleanos, porque explican por qué el agente reacciona o no reacciona.

const STATUS_LABEL = { IN_PROGRESS: 'En curso', PENDING: 'Pendiente', PAUSED: 'Pausada', BLOCKED: 'Bloqueada' }
const STATUS_CLASS = {
  IN_PROGRESS: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
  PENDING:     'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  PAUSED:      'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  BLOCKED:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

// Lo que necesita atención va primero, mismo criterio que el panel "Agentes" del
// Dashboard: un agente bloqueado es una pregunta esperando respuesta.
const ACTIVE_SECTIONS = [
  { key: 'BLOCKED', label: 'Necesitan tu ayuda', tone: 'danger' },
  { key: 'IN_PROGRESS', label: 'Trabajando ahora' },
  { key: 'PAUSED', label: 'Pausadas' },
  { key: 'PENDING', label: 'En su lista' },
]

const PERIODS = [
  { key: 'day', label: 'Hoy' },
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Este mes' },
]

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function fmtDateTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function AgentProfile() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [commentTask, setCommentTask] = useState(null)

  const [period, setPeriod] = useState('day')
  const [completed, setCompleted] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.get(`/agents/${id}`)
      .then(r => { if (alive) { setData(r.data); setError('') } })
      .catch(e => { if (alive) setError(e.response?.data?.error || 'No se pudo cargar el agente') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id])

  const loadCompleted = useCallback(() => {
    api.get(`/agents/${id}/completed`, { params: { period } })
      .then(r => setCompleted(r.data))
      .catch(() => setCompleted(null))
  }, [id, period])

  useEffect(() => { loadCompleted() }, [loadCompleted])

  if (loading) return <div className="min-h-screen bg-gray-50 dark:bg-gray-900"><Navbar /><LoadingSpinner /></div>
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-10 text-center text-gray-500 dark:text-gray-400">{error || 'Agente no encontrado'}</div>
      </div>
    )
  }

  const { agent, summary, active, channels } = data
  const totalActive = ACTIVE_SECTIONS.reduce((n, s) => n + (active[s.key]?.length || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <AgentAvatar agent={agent} size="lg" className="flex-shrink-0" />
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{agent.label || `Agente #${agent.id}`}</h1>
              {agent.teamRole && <RoleBadge role={agent.teamRole} />}
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">Agente de IA</span>
            </div>
            {agent.description && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1.5">{agent.description}</p>
            )}
            {agent.owner && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Agente de{' '}
                <UserLink userId={agent.owner.id} className="font-medium hover:text-primary-600 dark:hover:text-primary-400">
                  {agent.owner.name}
                </UserLink>
                {' '}— sus tareas las supervisa esa persona
              </p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {agent.lastUsedAt
                ? `Última conexión: ${fmtDateTime(agent.lastUsedAt)}`
                : 'Todavía no se conectó ninguna vez'}
            </p>
          </div>
        </div>

        {/* Lo que hizo */}
        <div className="grid grid-cols-3 gap-3">
          {PERIODS.map(({ key, label }) => (
            <div key={key} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{summary[key].count}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">completadas · {fmtMins(summary[key].minutes)}</p>
            </div>
          ))}
        </div>

        {/* Proyectos */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Proyectos</p>
          {agent.projects.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Sin proyectos asignados. Se los sumás desde el equipo de cada proyecto; igual puede trabajar en cualquiera.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {agent.projects.map(p => (
                <Link
                  key={p.id}
                  to={`/proyectos/${p.id}`}
                  className="text-sm px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-700 dark:hover:text-primary-400 transition-colors"
                >
                  {p.name}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Tareas abiertas */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Tareas abiertas {totalActive > 0 && <span className="text-gray-400 dark:text-gray-500">· {totalActive}</span>}
          </p>
          {totalActive === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No tiene tareas abiertas.</p>
          ) : (
            <div className="space-y-4">
              {ACTIVE_SECTIONS.filter(s => active[s.key]?.length > 0).map(s => (
                <div key={s.key}>
                  <p className={`text-xs font-semibold mb-1 ${s.tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {s.label} · {active[s.key].length}
                  </p>
                  {active[s.key].map(t => <TaskRow key={t.id} task={t} onOpen={setCommentTask} />)}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Completadas */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Completadas</p>
            <div className="flex gap-1">
              {PERIODS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                    period === p.key
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 font-medium'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {!completed || completed.items.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No completó tareas en este período.</p>
          ) : (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                {completed.total.count} tareas · {fmtMins(completed.total.minutes)}
              </p>
              {completed.items.map(t => (
                <button
                  key={t.id}
                  onClick={() => setCommentTask(t)}
                  className="w-full flex items-start gap-2.5 py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors rounded px-1 -mx-1"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug break-words">{t.description}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {t.project?.name} · completada {fmtDate(t.completedAt)} · {fmtMins(t.minutes)}
                    </p>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Canales — solo el dueño o un admin. Booleanos, nunca la URL ni el secret. */}
        {channels && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Cómo se le avisa</p>
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-300">
              <span className="inline-flex items-center gap-1.5">
                <Icon as={Webhook} size={15} />
                Webhook: {channels.hasWebhook ? 'configurado' : 'sin configurar'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon as={AlarmClock} size={15} />
                Despertador: {channels.wakeEnabled ? 'activado' : 'apagado'}
              </span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Se configuran en <Link to="/preferences?tab=agents" className="underline hover:text-primary-600 dark:hover:text-primary-400">Preferencias → Agentes IA</Link>.
            </p>
          </div>
        )}
      </div>

      {commentTask && (
        <TaskCommentsModal
          task={commentTask}
          onClose={() => setCommentTask(null)}
          onCommentAdded={count => setCommentTask(prev => ({ ...prev, _count: { ...prev._count, comments: count } }))}
        />
      )}
    </div>
  )
}

function TaskRow({ task, onOpen }) {
  const { members } = useMembers()
  return (
    <button
      onClick={() => onOpen(task)}
      className="w-full flex items-start gap-2.5 py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors rounded px-1 -mx-1"
    >
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${STATUS_CLASS[task.status] || STATUS_CLASS.PENDING}`}>
        {STATUS_LABEL[task.status] || task.status}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug whitespace-pre-wrap break-words">{renderRichText(task.description, { members })}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          {task.project?.name}
          {' · '}creada {fmtDate(task.createdAt)}
          {(task._count?.comments ?? 0) > 0 && <> · {task._count.comments}</>}
        </p>
        {task.status === 'BLOCKED' && task.blockedReason && (
          <p className="mt-1 text-xs text-red-700 dark:text-red-400 border-l-2 border-red-300 dark:border-red-700 pl-2">{task.blockedReason}</p>
        )}
      </div>
    </button>
  )
}
