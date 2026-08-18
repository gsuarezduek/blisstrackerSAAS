import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import AvatarLightbox from '../components/AvatarLightbox'
import TaskCommentsModal from '../components/TaskCommentsModal'
import UserLink from '../components/UserLink'
import RoleBadge from '../components/RoleBadge'
import AdminUserPanel from '../components/profile/AdminUserPanel'
import api from '../api/client'
import { avatarUrl } from '../utils/avatarUrl'
import { renderRichText } from '../utils/richText'
import { fmtMins } from '../utils/format'
import { useAuth } from '../context/AuthContext'
import useMembers from '../hooks/useMembers'

const STATUS_LABEL = { IN_PROGRESS: 'En curso', PENDING: 'Pendiente', PAUSED: 'Pausada', BLOCKED: 'Bloqueada' }
const STATUS_CLASS = {
  IN_PROGRESS: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
  PENDING:     'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  PAUSED:      'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  BLOCKED:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}
const LEAVE_LABEL = {
  vacaciones: 'Vacaciones', estudio: 'Estudio', maternidad: 'Maternidad', paternidad: 'Paternidad',
  enfermedad: 'Enfermedad', duelo: 'Duelo', mudanza: 'Mudanza', otro: 'Licencia',
}

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function fmtLongDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function UserProfile() {
  const { id } = useParams()
  const { user: viewer } = useAuth()
  const { members } = useMembers()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lightbox, setLightbox] = useState(false)
  const [commentTask, setCommentTask] = useState(null)

  const [period, setPeriod] = useState('day')
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [completed, setCompleted] = useState(null)
  const [loadingCompleted, setLoadingCompleted] = useState(false)

  useEffect(() => {
    setLoading(true); setError(null)
    api.get(`/users/${id}/profile`)
      .then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar el perfil'))
      .finally(() => setLoading(false))
  }, [id])

  const loadCompleted = useCallback(() => {
    setLoadingCompleted(true)
    api.get(`/users/${id}/completed`, { params: { period, date } })
      .then(r => setCompleted(r.data))
      .finally(() => setLoadingCompleted(false))
  }, [id, period, date])

  useEffect(() => { loadCompleted() }, [loadCompleted])

  function openTask(task) { setCommentTask(task) }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <LoadingSpinner size="lg" className="py-20" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center text-gray-500 dark:text-gray-400">
          <p className="text-4xl mb-3">🚫</p>
          <p>{error || 'Perfil no disponible'}</p>
          <Link to="/realtime" className="text-primary-600 hover:underline text-sm mt-4 inline-block">← Volver a Actividad</Link>
        </div>
      </div>
    )
  }

  const { user, projects, onLeave, summary, active, future, delegatedByThem, delegatedToThem } = data
  const activeSections = [
    { key: 'IN_PROGRESS', label: 'En curso' },
    { key: 'PENDING', label: 'Pendientes' },
    { key: 'PAUSED', label: 'Pausadas' },
    { key: 'BLOCKED', label: 'Bloqueadas' },
  ]
  const totalActive = activeSections.reduce((n, s) => n + (active[s.key]?.length || 0), 0) + (future?.length || 0)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <button onClick={() => setLightbox(true)} className="flex-shrink-0 rounded-full focus:outline-none">
            <img
              src={avatarUrl(user.avatar)}
              alt={user.name}
              className="w-24 h-24 rounded-full object-cover border border-gray-200 dark:border-gray-600 hover:opacity-90 transition-opacity cursor-zoom-in"
            />
          </button>
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{user.name}</h1>
              <RoleBadge role={user.teamRole} />
              {!user.active && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">Inactivo</span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{user.email}</p>
            {user.workspaceJoinedAt && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">En Bliss desde {fmtLongDate(user.workspaceJoinedAt)}</p>
            )}
            {onLeave && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 mt-2">
                🌴 De licencia ({LEAVE_LABEL[onLeave.type] || onLeave.type}) hasta {fmtDate(onLeave.endDate)}
              </span>
            )}
          </div>
        </div>

        {/* Resumen de productividad propia */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: 'day', label: 'Hoy' },
            { key: 'week', label: 'Esta semana' },
            { key: 'month', label: 'Este mes' },
          ].map(({ key, label }) => (
            <div key={key} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{summary[key].count}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">completadas · {fmtMins(summary[key].minutes)}</p>
            </div>
          ))}
        </div>

        {/* Proyectos */}
        {projects.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Proyectos</p>
            <div className="flex flex-wrap gap-2">
              {projects.map(p => (
                <Link
                  key={p.id}
                  to={`/my-projects/${p.id}`}
                  className="text-sm px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-700 dark:hover:text-primary-400 transition-colors"
                >
                  {p.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Tareas activas */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Tareas ({totalActive})</p>
          {totalActive === 0 && <p className="text-sm text-gray-400 py-2">Sin tareas activas.</p>}
          <div className="space-y-4">
            {activeSections.map(s => (active[s.key]?.length > 0) && (
              <div key={s.key}>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">{s.label}</p>
                <div className="space-y-1">
                  {active[s.key].map(t => <TaskRow key={t.id} task={t} ownerId={user.id} onOpen={openTask} />)}
                </div>
              </div>
            ))}
            {future?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">Futuras</p>
                <div className="space-y-1">
                  {future.map(t => <TaskRow key={t.id} task={t} ownerId={user.id} onOpen={openTask} showScheduled />)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Delegadas */}
        {(delegatedToThem.length > 0 || delegatedByThem.length > 0) && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Le delegaron ({delegatedToThem.length})</p>
              {delegatedToThem.length === 0 && <p className="text-sm text-gray-400">Nada por ahora.</p>}
              <div className="space-y-1">
                {delegatedToThem.map(t => (
                  <TaskRow key={t.id} task={t} ownerId={user.id} onOpen={openTask}
                    person={t.createdBy && <>Asignada por <UserLink userId={t.createdBy.id} className="font-medium hover:text-primary-600 dark:hover:text-primary-400">{t.createdBy.name}</UserLink></>} />
                ))}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Delegó a otros ({delegatedByThem.length})</p>
              {delegatedByThem.length === 0 && <p className="text-sm text-gray-400">Nada por ahora.</p>}
              <div className="space-y-1">
                {delegatedByThem.map(t => (
                  <TaskRow key={t.id} task={t} ownerId={user.id} onOpen={openTask}
                    person={t.user && <>Encargado: <UserLink userId={t.user.id} className="font-medium hover:text-primary-600 dark:hover:text-primary-400">{t.user.name}</UserLink></>} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Completadas con filtro */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Completadas {completed && `(${completed.total.count} · ${fmtMins(completed.total.minutes)})`}
            </p>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 text-xs">
                {[
                  { k: 'day', l: 'Día' },
                  { k: 'week', l: 'Semana' },
                  { k: 'month', l: 'Mes' },
                ].map(({ k, l }) => (
                  <button
                    key={k}
                    onClick={() => setPeriod(k)}
                    className={`px-3 py-1.5 font-medium transition-colors ${period === k ? 'bg-primary-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
              />
            </div>
          </div>
          {loadingCompleted && <LoadingSpinner size="sm" className="py-6" />}
          {!loadingCompleted && completed && completed.items.length === 0 && (
            <p className="text-sm text-gray-400 py-2">Sin tareas completadas en este período.</p>
          )}
          {!loadingCompleted && completed && completed.items.length > 0 && (
            <div className="space-y-1">
              {completed.items.map(t => (
                <button
                  key={t.id}
                  onClick={() => openTask(t)}
                  className="w-full flex items-start gap-2.5 py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors rounded px-1 -mx-1"
                >
                  <span className="text-green-500 flex-shrink-0 mt-0.5 text-sm">✓</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-snug whitespace-pre-wrap break-words">{renderRichText(t.description, { members })}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {t.project?.name}
                      {' · '}creada {fmtDate(t.createdAt)}
                      {' · '}finalizada {fmtDate(t.completedAt)}
                      {' · '}<span className="text-gray-500 dark:text-gray-400 font-medium">{fmtMins(t.minutes)}</span>
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {viewer?.isAdmin && <AdminUserPanel userId={user.id} userName={user.name} />}
      </div>

      {lightbox && (
        <AvatarLightbox src={avatarUrl(user.avatar)} alt={user.name} onClose={() => setLightbox(false)} />
      )}
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

// Fila de tarea (activa / delegada / futura).
function TaskRow({ task, ownerId, onOpen, person, showScheduled }) {
  const { members } = useMembers()
  const delegatedBy = task.createdBy && task.createdBy.id !== ownerId
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
          {showScheduled && task.scheduledFor && <> · programada {fmtDate(task.scheduledFor)}</>}
          {(task._count?.comments ?? 0) > 0 && <> · 💬 {task._count.comments}</>}
        </p>
        {person
          ? <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{person}</p>
          : delegatedBy && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Asignada por <UserLink userId={task.createdBy.id} className="font-medium hover:text-primary-600 dark:hover:text-primary-400">{task.createdBy.name}</UserLink>
              </p>
            )}
      </div>
    </button>
  )
}
