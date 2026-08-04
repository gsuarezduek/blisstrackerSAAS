import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import TaskCard from '../components/TaskCard'
import AddTaskModal from '../components/AddTaskModal'
import InactivityModal from '../components/InactivityModal'
import TaskCommentsModal from '../components/TaskCommentsModal'
import OnboardingWizard from '../components/OnboardingWizard'
import SetupChecklist from '../components/SetupChecklist'
import { useInactivity } from '../hooks/useInactivity'
import api from '../api/client'
import { avatarUrl } from '../utils/avatarUrl'
import UserLink from '../components/UserLink'
import RoleBadge from '../components/RoleBadge'
import { useAuth } from '../context/AuthContext'
import { completedMinutes, fmtMins, completedDuration } from '../utils/format'

function todayLabel() {
  return new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function fmtShortDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', timeZone: 'America/Argentina/Buenos_Aires',
  })
}

const SEGUIMIENTO_STATUS_LABEL = {
  PENDING: 'Pendiente', IN_PROGRESS: 'En curso', PAUSED: 'Pausada', BLOCKED: 'Bloqueada', COMPLETED: 'Completada',
}
const SEGUIMIENTO_STATUS_COLOR = {
  PENDING: 'text-gray-400 dark:text-gray-500',
  IN_PROGRESS: 'text-primary-600 dark:text-primary-400',
  PAUSED: 'text-gray-500 dark:text-gray-400',
  BLOCKED: 'text-red-600 dark:text-red-400',
  COMPLETED: 'text-green-600 dark:text-green-400',
}
// Orden de urgencia dentro de la sección Seguimiento: lo bloqueado necesita atención primero.
const SEGUIMIENTO_STATUS_PRIORITY = { BLOCKED: 0, IN_PROGRESS: 1, PAUSED: 2, PENDING: 3, COMPLETED: 4 }

// "Visto" por tarea (firma status+comentarios) persistido en localStorage por usuario,
// para marcar con un punto las filas que cambiaron desde la última vez que se abrieron.
function seguimientoSeenKey(userId) { return `bliss_seguimiento_seen_${userId}` }
function loadSeguimientoSeen(userId) {
  if (!userId) return {}
  try { return JSON.parse(localStorage.getItem(seguimientoSeenKey(userId)) || '{}') } catch { return {} }
}
function seguimientoSignature(t) { return `${t.status}:${t._count?.comments ?? 0}` }

// Fila de la sección Seguimiento (Seguidas / Delegadas). Muestra responsable, comentarios,
// estado, y los metadatos: fecha de creación, fecha de finalización y duración.
function TrackedTaskRow({ task: t, onClick, onRemove, removeTitle, isNew }) {
  const dur = completedDuration(t)
  return (
    <div
      className="group flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      onClick={onClick}
    >
      {isNew && (
        <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" title="Cambió desde tu última visita" />
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug truncate ${t.status === 'COMPLETED' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
          {t.description}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <UserLink userId={t.user.id} className="flex items-center gap-2 min-w-0">
            <img src={avatarUrl(t.user.avatar)} alt={t.user.name} className="w-4 h-4 rounded-full object-cover flex-shrink-0 hover:opacity-90 transition-opacity" />
            <span className="text-xs text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">{t.user.name}</span>
          </UserLink>
          {(t._count?.comments ?? 0) > 0 && (
            <>
              <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">💬 {t._count.comments}</span>
            </>
          )}
        </div>
        {/* Metadatos: creación, finalización, duración */}
        <div className="flex items-center gap-x-2 gap-y-0.5 mt-1 flex-wrap text-[11px] text-gray-400 dark:text-gray-500">
          {t.createdAt && <span>📅 {fmtShortDate(t.createdAt)}</span>}
          {t.completedAt && (
            <>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span>✓ {fmtShortDate(t.completedAt)}</span>
            </>
          )}
          {dur && (
            <>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span>⏱ {dur}</span>
            </>
          )}
        </div>
      </div>
      <span className={`text-xs font-medium flex-shrink-0 ${SEGUIMIENTO_STATUS_COLOR[t.status]}`}>
        {SEGUIMIENTO_STATUS_LABEL[t.status]}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onRemove(t) }}
        title={removeTitle}
        className="flex-shrink-0 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 -m-1"
      >
        ✕
      </button>
    </div>
  )
}

// Fila de una tarea completada (sección "Completadas": hoy + historial). Edición de
// duración con estado local propio — así tipear en el input no re-renderiza todo el Dashboard.
const CompletedTaskRow = memo(function CompletedTaskRow({ task: t, variant, onOpenComments, onSaveDuration }) {
  const [editingDur, setEditingDur] = useState(false)
  const [durInput, setDurInput] = useState('')
  const cancelRef = useRef(false)
  const inputRef = useRef(null)

  const mins = completedMinutes(t)
  const isHistory = variant === 'history'
  const dateStr = isHistory && t.completedAt
    ? new Date(t.completedAt).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
    : null

  function startEdit() {
    cancelRef.current = false
    setDurInput(String(mins ?? 0))
    setEditingDur(true)
    setTimeout(() => { inputRef.current?.select() }, 0)
  }

  async function saveEdit() {
    if (cancelRef.current) return
    const parsed = parseInt(durInput, 10)
    setEditingDur(false)
    if (isNaN(parsed) || parsed < 0) return
    await onSaveDuration(t.id, parsed)
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 group">
      <span className={`flex-shrink-0 text-sm ${isHistory ? 'text-gray-300 dark:text-gray-600' : 'text-green-500'}`}>✓</span>
      <div className="flex-1 min-w-0">
        <p
          onClick={() => onOpenComments(t)}
          title="Abrir tarea"
          className={`text-sm leading-snug truncate cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition-colors ${isHistory ? 'text-gray-500 dark:text-gray-400' : 'text-gray-600 dark:text-gray-300'}`}
        >
          {t.description}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-400 dark:text-gray-500">{t.project.name}</span>
          <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
          {dateStr && (
            <>
              <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">{dateStr}</span>
              <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
            </>
          )}
          <button
            onClick={() => onOpenComments(t)}
            title="Ver comentarios"
            className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            💬{(t._count?.comments ?? 0) > 0 ? ` ${t._count.comments}` : ''}
          </button>
          {editingDur ? (
            <>
              <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
              <span className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  type="number"
                  min="0"
                  value={durInput}
                  onChange={e => setDurInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  { e.preventDefault(); saveEdit() }
                    if (e.key === 'Escape') { cancelRef.current = true; setEditingDur(false) }
                  }}
                  onBlur={saveEdit}
                  className="w-14 text-xs border border-green-400 dark:border-green-600 rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-green-400 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                />
                <span className="text-xs text-gray-400">min</span>
                <button
                  onMouseDown={() => { cancelRef.current = true; setEditingDur(false) }}
                  className="text-xs text-gray-400 hover:text-gray-600 leading-none"
                >✕</button>
              </span>
            </>
          ) : (
            <button
              onClick={startEdit}
              title="Editar duración"
              className="group/dur flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-green-600 dark:hover:text-green-400 transition-colors"
            >
              {mins != null && mins > 0 && (
                <>
                  <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                  <span>{fmtMins(mins)}</span>
                </>
              )}
              {!isHistory && (mins == null || mins === 0) && <span className="opacity-0 group-hover:opacity-60">+ tiempo</span>}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor"
                className="w-2.5 h-2.5 opacity-0 group-hover/dur:opacity-50 transition-opacity">
                <path d="M8.54.47a1.6 1.6 0 0 1 2.26 2.26L9.5 4.03 7.97 2.5 8.54.47ZM7.03 3.44 1.5 9a.5.5 0 0 0-.13.24L1 11.17a.25.25 0 0 0 .3.3l1.93-.37A.5.5 0 0 0 3.47 11l5.56-5.53L7.03 3.44Z"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [workDay, setWorkDay] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [elapsed, setElapsed] = useState('')

  const [carryOver, setCarryOver] = useState([])
  const [future, setFuture] = useState([])
  const [futureOpen, setFutureOpen] = useState(false)
  const [delegated, setDelegated] = useState([])
  const [followedTasks, setFollowedTasks] = useState([])
  const [delegatedOpen, setDelegatedOpen] = useState(false)
  const [seguimientoTab, setSeguimientoTab] = useState('SEGUIDAS')  // 'SEGUIDAS' | 'DELEGADAS'
  const [delegatedFilter, setDelegatedFilter] = useState('ALL')
  const [dismissConfirm, setDismissConfirm] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [seguimientoSeen, setSeguimientoSeen] = useState(() => loadSeguimientoSeen(user?.id))
  const [backlogOpen,       setBacklogOpen]       = useState(false)
  const [completedOpen,     setCompletedOpen]     = useState(false)
  const [completedHistory,  setCompletedHistory]  = useState([])
  const [completedSkip,     setCompletedSkip]     = useState(0)
  const [completedHasMore,  setCompletedHasMore]  = useState(false)
  const [completedLoading,  setCompletedLoading]  = useState(false)
  const [autoPausedTask, setAutoPausedTask] = useState(null)
  const [commentTask, setCommentTask] = useState(null)

  // AI Insight
  const [insight, setInsight] = useState(null)
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightRefreshing, setInsightRefreshing] = useState(false)
  const [insightCooldown, setInsightCooldown] = useState(null)
  const [insightExpanded, setInsightExpanded] = useState(false)
  const [insightDismissed, setInsightDismissed] = useState(false)
  const [workdayError, setWorkdayError] = useState(null)

  const loadToday = useCallback(async () => {
    setWorkdayError(null)
    try {
      const { data } = await api.get('/workdays/today')
      const { carryOverTasks, futureTasks, ...wd } = data
      setWorkDay(wd)
      setCarryOver(carryOverTasks ?? [])
      setFuture(futureTasks ?? [])

      const storedId = localStorage.getItem('autoPaused')
      if (storedId) {
        const taskId = Number(storedId)
        const allTasks = [...(wd.tasks ?? []), ...(carryOverTasks ?? [])]
        const task = allTasks.find(t => t.id === taskId && t.status === 'PAUSED')
        if (task) setAutoPausedTask(task)
        else localStorage.removeItem('autoPaused')
      }
    } catch (err) {
      setWorkdayError(err.response?.data?.error || 'Error al cargar la jornada')
    }
  }, [])

  useEffect(() => { loadToday() }, [loadToday])

  // Refrescar cuando se crea una tarea desde el atajo global (tecla N en otra página)
  useEffect(() => {
    function onTaskCreated() { loadToday() }
    window.addEventListener('bliss:task-created', onTaskCreated)
    return () => window.removeEventListener('bliss:task-created', onTaskCreated)
  }, [loadToday])

  const seguimientoTabInit = useRef(false)
  useEffect(() => {
    Promise.all([
      api.get('/tasks/delegated').then(r => r.data).catch(() => []),
      api.get('/tasks/followed').then(r => r.data).catch(() => []),
    ]).then(([del, fol]) => {
      setDelegated(del)
      setFollowedTasks(fol)
      // Pestaña por defecto: Seguidas si hay alguna, si no Delegadas.
      if (!seguimientoTabInit.current) {
        seguimientoTabInit.current = true
        if (fol.length === 0 && del.length > 0) setSeguimientoTab('DELEGADAS')
      }
    })
  }, [])

  // Load AI insight once workday is available
  useEffect(() => {
    if (!workDay || workDay.endedAt || user?.dailyInsightEnabled === false) return
    setInsightLoading(true)
    api.get('/insights')
      .then(r => {
        setInsight(r.data)
        const dismissedId = localStorage.getItem('insightDismissed')
        setInsightDismissed(dismissedId === String(r.data.id))
      })
      .catch(() => {})
      .finally(() => setInsightLoading(false))
  }, [workDay?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRefreshInsight() {
    setInsightRefreshing(true)
    setInsightCooldown(null)
    try {
      const { data } = await api.post('/insights/refresh')
      setInsight(data)
    } catch (err) {
      if (err.response?.status === 429) {
        setInsightCooldown(err.response.data.waitMins)
      }
    } finally {
      setInsightRefreshing(false)
    }
  }

  async function handleInsightFeedback(value) {
    if (!insight) return
    try {
      const { data } = await api.post('/insights/feedback', { feedback: value })
      setInsight(data)
    } catch (_) {}
  }

  // Live clock
  useEffect(() => {
    if (!workDay?.startedAt || workDay?.endedAt) return
    const update = () => {
      const mins = Math.round((Date.now() - new Date(workDay.startedAt)) / 60000)
      setElapsed(`${Math.floor(mins / 60)}h ${mins % 60}m`)
    }
    update()
    const t = setInterval(update, 60000)
    return () => clearInterval(t)
  }, [workDay])

  async function handleFinish() {
    if (!confirm('¿Finalizar jornada laboral? Se cerrará tu sesión automáticamente.')) return
    setFinishing(true)
    try {
      await api.post('/workdays/finish')
      logout()
      navigate('/login')
    } finally {
      setFinishing(false)
    }
  }

  function handleAddTask(task) {
    // Tarea programada a futuro: no va al foco de hoy, va a la sección "Futuras".
    if (task.scheduledFor && workDay && task.scheduledFor > workDay.date) {
      setFuture(prev => [...prev, task].sort((a, b) => (a.scheduledFor > b.scheduledFor ? 1 : -1)))
      setFutureOpen(true)
      return
    }
    setWorkDay(prev => ({ ...prev, tasks: [...prev.tasks, task] }))
  }

  // Adelantar una tarea futura a hoy: sale de "Futuras" y entra al foco del día.
  function handleBringToToday(updated) {
    setFuture(prev => prev.filter(t => t.id !== updated.id))
    setWorkDay(prev => ({ ...prev, tasks: [...prev.tasks, updated] }))
  }

  function handleUpdateTask(updated) {
    if (carryOver.find(t => t.id === updated.id)) {
      // Si la tarea pasó a la jornada de hoy (se completó, o se re-alojó al quitarle la estrella),
      // sale del carry-over y entra a las tareas del día para que cuente y quede como pendiente de hoy.
      if (updated.status === 'COMPLETED' || updated.workDayId === workDay?.id) {
        setCarryOver(prev => prev.filter(t => t.id !== updated.id))
        setWorkDay(prev => ({ ...prev, tasks: [...prev.tasks, updated] }))
      } else {
        setCarryOver(prev => prev.map(t => t.id === updated.id ? updated : t))
      }
      return
    }
    setWorkDay(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === updated.id ? updated : t),
    }))
  }

  function handleDeleteTask(id, recurrenceId) {
    // Borrado de serie: quitar todas las instancias de esa recurrencia de todas las listas.
    if (recurrenceId) {
      const keep = t => t.recurrenceId !== recurrenceId
      setCarryOver(prev => prev.filter(keep))
      setFuture(prev => prev.filter(keep))
      setWorkDay(prev => ({ ...prev, tasks: prev.tasks.filter(keep) }))
      return
    }
    if (carryOver.find(t => t.id === id)) {
      setCarryOver(prev => prev.filter(t => t.id !== id))
      return
    }
    if (future.find(t => t.id === id)) {
      setFuture(prev => prev.filter(t => t.id !== id))
      return
    }
    setWorkDay(prev => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== id) }))
  }

  // "Agregar a hoy" desde Backlog: mueve carry-over a workDay.tasks, o actualiza task existente
  function handleAddToToday(updated) {
    if (carryOver.find(t => t.id === updated.id)) {
      setCarryOver(prev => prev.filter(t => t.id !== updated.id))
      setWorkDay(prev => ({ ...prev, tasks: [...prev.tasks, updated] }))
    } else {
      setWorkDay(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === updated.id ? updated : t) }))
    }
  }

  function handleCommentAdded(taskId, newCount) {
    const update = list => list.map(t =>
      t.id === taskId ? { ...t, _count: { ...t._count, comments: newCount } } : t
    )
    setWorkDay(prev => ({ ...prev, tasks: update(prev.tasks) }))
    setCarryOver(prev => update(prev))
    setCompletedHistory(prev => update(prev))
  }

  // Derived state
  const tasks = workDay?.tasks ?? []

  // Carry-over activos: IN_PROGRESS/PAUSED/BLOCKED (sin isBacklog) o DESTACADAS (con estrella) se
  // muestran en el foco normal. Una pendiente destacada NO cae al backlog: se mantiene en el foco
  // (sección Destacadas) hasta que se complete o se le quite la estrella.
  // Carry-over con isBacklog=true siempre van al backlog, sin importar el status.
  const isStarred = t => (t.starred ?? 0) > 0
  const carryOverActive  = useMemo(() => carryOver.filter(t => !t.isBacklog && (t.status !== 'PENDING' || isStarred(t))), [carryOver])
  const carryOverPending = useMemo(() => carryOver.filter(t => t.isBacklog || (t.status === 'PENDING' && !isStarred(t))),  [carryOver])

  // Today focus = tasks in today's workday that are NOT backlog + carry-over activos, newest first
  const focusTasks = useMemo(() =>
    [...tasks.filter(t => !t.isBacklog), ...carryOverActive].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [tasks, carryOverActive]
  )

  // Backlog = today's backlog tasks + carry-over PENDING de días anteriores, newest first
  const allBacklog = useMemo(() =>
    [...tasks.filter(t => t.isBacklog), ...carryOverPending].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [tasks, carryOverPending]
  )

  const activeTask = useMemo(() => focusTasks.find(t => t.status === 'IN_PROGRESS') ?? null, [focusTasks])

  // ── Atajos de teclado para acciones de tarea ───────────────────────────────
  // Con tarea en curso: Shift+C completar, Shift+P pausar, Shift+B bloquear.
  // Sin tarea en curso: Shift+I inicia la primera tarea de la lista.
  const shortcutRef = useRef(null)
  shortcutRef.current = { activeTask, focusTasks, ended: !!workDay?.endedAt, update: handleUpdateTask }

  useEffect(() => {
    function isTyping(el) {
      if (!el) return false
      const t = el.tagName
      return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable
    }
    async function run(task, endpoint, body) {
      try {
        const { data } = await api.patch(`/tasks/${task.id}/${endpoint}`, body)
        shortcutRef.current.update(data)
      } catch (err) {
        if (err.response?.data?.error) alert(err.response.data.error)
      }
    }
    function onKey(e) {
      // Solo combinaciones Shift + tecla (sin otros modificadores), y nunca mientras se escribe.
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      if (isTyping(e.target)) return
      const k = e.key.toLowerCase()
      if (!['c', 'p', 'b', 'i'].includes(k)) return
      const { activeTask, focusTasks, ended } = shortcutRef.current
      if (ended) return

      if (activeTask) {
        if (k === 'c') { e.preventDefault(); run(activeTask, 'complete') }
        else if (k === 'p') { e.preventDefault(); run(activeTask, 'pause') }
        else if (k === 'b') {
          e.preventDefault()
          const reason = window.prompt('¿Por qué está bloqueada esta tarea?')
          if (reason && reason.trim()) run(activeTask, 'block', { reason: reason.trim() })
        }
        // 'i' con una tarea ya en curso: no hace nada
      } else if (k === 'i') {
        // Primera tarea de la lista que se pueda iniciar/reanudar
        e.preventDefault()
        const next = focusTasks.find(t => t.status === 'PENDING' || t.status === 'PAUSED')
        if (next) run(next, next.status === 'PAUSED' ? 'resume' : 'start')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Lista de la pestaña activa de Seguimiento (Seguidas / Delegadas)
  const seguimientoSource = seguimientoTab === 'SEGUIDAS' ? followedTasks : delegated

  // Cuántas bloqueadas hay entre Seguidas + Delegadas — necesitan atención primero.
  const seguimientoBlockedCount = useMemo(
    () => followedTasks.filter(t => t.status === 'BLOCKED').length + delegated.filter(t => t.status === 'BLOCKED').length,
    [followedTasks, delegated]
  )

  // Tareas de la pestaña activa, ordenadas por urgencia (bloqueadas primero) y agrupadas por proyecto
  const seguimientoByProject = useMemo(() => {
    const sorted = [...seguimientoSource].sort((a, b) =>
      (SEGUIMIENTO_STATUS_PRIORITY[a.status] ?? 9) - (SEGUIMIENTO_STATUS_PRIORITY[b.status] ?? 9)
    )
    const map = {}
    for (const t of sorted) {
      const pid = t.project.id
      if (!map[pid]) map[pid] = { project: t.project, tasks: [] }
      map[pid].tasks.push(t)
    }
    return Object.values(map)
  }, [seguimientoSource])

  // Estados presentes (para los pills de filtro)
  const seguimientoStatuses = useMemo(() => {
    const order = ['ALL', 'PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED', 'COMPLETED']
    const present = new Set(seguimientoSource.map(t => t.status))
    return order.filter(s => s === 'ALL' || present.has(s))
  }, [seguimientoSource])

  // Tareas de la pestaña activa filtradas por estado
  const filteredSeguimientoByProject = useMemo(() => {
    if (delegatedFilter === 'ALL') return seguimientoByProject
    return seguimientoByProject
      .map(g => ({ ...g, tasks: g.tasks.filter(t => t.status === delegatedFilter) }))
      .filter(g => g.tasks.length > 0)
  }, [seguimientoByProject, delegatedFilter])
  const hasActiveTask = !!activeTask

  // Borrar/dejar de seguir en bulk — mismo botón para ambas pestañas, apunta al endpoint
  // correspondiente (dismiss de Delegadas o unfollow de Seguidas).
  async function handleBulkRemoveSeguimiento() {
    setDismissing(true)
    try {
      const params = delegatedFilter !== 'ALL' ? `?status=${delegatedFilter}` : ''
      if (seguimientoTab === 'DELEGADAS') {
        await api.delete(`/tasks/delegated${params}`)
        const { data } = await api.get('/tasks/delegated')
        setDelegated(data)
      } else {
        await api.delete(`/tasks/followed${params}`)
        const { data } = await api.get('/tasks/followed')
        setFollowedTasks(data)
      }
      setDelegatedFilter('ALL')
      setDismissConfirm(false)
    } catch (_) {}
    setDismissing(false)
  }

  // Quitar una sola fila — dismiss individual en Delegadas, dejar de seguir en Seguidas.
  async function handleRemoveOneSeguimiento(task) {
    try {
      if (seguimientoTab === 'DELEGADAS') {
        await api.delete(`/tasks/${task.id}/delegated`)
        setDelegated(prev => prev.filter(t => t.id !== task.id))
      } else {
        await api.delete(`/tasks/${task.id}/follow`)
        setFollowedTasks(prev => prev.filter(t => t.id !== task.id))
      }
    } catch (_) {}
  }

  // Tras seguir/dejar de seguir una tarea desde el modal, refrescar la lista de Seguidas.
  function handleFollowChanged() {
    api.get('/tasks/followed').then(r => setFollowedTasks(r.data)).catch(() => {})
  }

  // Marca una tarea de Seguimiento como vista (firma status+comentarios) para apagar
  // su punto de "novedad" — se llama al abrir su modal de comentarios.
  function markSeguimientoSeen(task) {
    if (!user?.id) return
    const sig = seguimientoSignature(task)
    setSeguimientoSeen(prev => {
      if (prev[task.id] === sig) return prev
      const next = { ...prev, [task.id]: sig }
      try { localStorage.setItem(seguimientoSeenKey(user.id), JSON.stringify(next)) } catch (_) {}
      return next
    })
  }

  // Inactivity detection
  async function handleAutoPause() {
    if (!activeTask) return
    try {
      const { data } = await api.patch(`/tasks/${activeTask.id}/pause`)
      handleUpdateTask(data)
      localStorage.setItem('autoPaused', String(activeTask.id))
      setAutoPausedTask(data)
    } catch (_) {}
  }

  const { dismiss } = useInactivity({ activeTask, onAutoPause: handleAutoPause })

  function clearAutoPaused() {
    localStorage.removeItem('autoPaused')
    setAutoPausedTask(null)
    dismiss()
  }

  const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

  async function saveCompletedDuration(taskId, mins) {
    try {
      const { data } = await api.patch(`/tasks/${taskId}/duration`, { minutes: mins })
      handleUpdateTask(data)
      setCompletedHistory(prev => prev.map(t => t.id === taskId ? data : t))
    } catch (err) {
      if (err.response?.data?.error) alert(err.response.data.error)
    }
  }

  async function loadCompletedHistory(skip = 0) {
    setCompletedLoading(true)
    try {
      const { data } = await api.get(`/tasks/completed?skip=${skip}&before=${todayDate}`)
      setCompletedHistory(prev => skip === 0 ? data.tasks : [...prev, ...data.tasks])
      setCompletedHasMore(data.hasMore)
      setCompletedSkip(skip + data.tasks.length)
    } finally {
      setCompletedLoading(false)
    }
  }

  function handleToggleCompleted() {
    setCompletedOpen(v => {
      if (!v && completedHistory.length === 0) loadCompletedHistory(0)
      return !v
    })
  }

  async function handleResumeAutoPaused() {
    if (!autoPausedTask) return
    try {
      const { data } = await api.patch(`/tasks/${autoPausedTask.id}/resume`)
      handleUpdateTask(data)
    } catch (_) {}
    clearAutoPaused()
  }

  // Sections from focus tasks
  const { inProgress, completed, starred, paused, blocked, pending, totalMins, activeFocusCount } = useMemo(() => {
    const inProgress = focusTasks.filter(t => t.status === 'IN_PROGRESS')
    const completed  = focusTasks
      .filter(t => t.status === 'COMPLETED')
      .sort((a, b) => new Date(b.completedAt ?? 0) - new Date(a.completedAt ?? 0))
    const starred    = focusTasks.filter(t => (t.starred ?? 0) > 0 && t.status !== 'COMPLETED' && t.status !== 'IN_PROGRESS')
    const starredIds = new Set(starred.map(t => t.id))
    const paused     = focusTasks.filter(t => t.status === 'PAUSED'  && !starredIds.has(t.id))
    const blocked    = focusTasks.filter(t => t.status === 'BLOCKED' && !starredIds.has(t.id))
    const pending    = focusTasks.filter(t => t.status === 'PENDING' && !starredIds.has(t.id))
    const totalMins  = completed.reduce((acc, t) => {
      const m = completedMinutes(t)
      return acc + (m ?? 0)
    }, 0)
    const activeFocusCount = focusTasks.filter(t => t.status !== 'COMPLETED').length
    return { inProgress, completed, starred, paused, blocked, pending, totalMins, activeFocusCount }
  }, [focusTasks])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <OnboardingWizard />

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Buen día, {user?.name.split(' ')[0]} 👋</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 capitalize">{todayLabel()}</p>
          </div>
          <div className="text-right">
            {workDay && !workDay.endedAt && (
              <p className="text-sm text-gray-500 dark:text-gray-400">Jornada: <span className="font-medium text-gray-700 dark:text-gray-300">{elapsed}</span></p>
            )}
            {workDay?.endedAt && (
              <p className="text-sm text-green-600 font-medium">Jornada finalizada ✓</p>
            )}
            {user?.role && (
              <div className="mt-1.5 flex justify-end">
                <RoleBadge role={user.role} />
              </div>
            )}
          </div>
        </div>

        {/* Error de jornada */}
        {workdayError && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-red-500 text-lg flex-shrink-0">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">No se pudo cargar la jornada</p>
              <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">{workdayError}</p>
              <button onClick={loadToday} className="text-xs text-red-700 dark:text-red-400 underline mt-1 hover:no-underline">Reintentar</button>
            </div>
          </div>
        )}

        <SetupChecklist />

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 text-center">
            <p className="text-2xl font-bold text-gray-800 dark:text-white">{activeFocusCount}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Tareas de hoy</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 text-center">
            <p className="text-2xl font-bold text-primary-600">{completed.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Completadas</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 text-center">
            <p className="text-2xl font-bold text-primary-600">
              {totalMins >= 60 ? `${Math.floor(totalMins/60)}h ${totalMins%60}m` : `${totalMins}m`}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Tiempo registrado</p>
          </div>
        </div>

        {/* Daily insight */}
        {user?.dailyInsightEnabled !== false && workDay && !workDay.endedAt && (() => {
          const toneStyles = {
            warning:  'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
            alert:    'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
            positive: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
            neutral:  'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
          }
          const toneText = {
            warning:  'text-red-700 dark:text-red-400',
            alert:    'text-amber-700 dark:text-amber-400',
            positive: 'text-green-700 dark:text-green-400',
            neutral:  'text-gray-600 dark:text-gray-400',
          }
          const toneIcon = { warning: '⚠️', alert: '🎯', positive: '✅', neutral: '💡' }

          if (insightLoading) {
            return (
              <div className="flex items-center gap-2.5 border rounded-xl px-4 py-3 mb-6 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <LoadingSpinner size="sm" />
                <span className="text-sm text-gray-400">Generando insight del día...</span>
              </div>
            )
          }

          if (!insight || insightDismissed) return null

          const tone = insight.tono || 'neutral'

          const handleDismiss = () => {
            localStorage.setItem('insightDismissed', String(insight.id))
            setInsightDismissed(true)
          }

          return (
            <div className={`border rounded-xl mb-6 ${toneStyles[tone]}`}>
              {/* Header row — always visible */}
              <div
                className="flex items-center gap-2.5 px-4 py-3 cursor-pointer select-none"
                onClick={() => setInsightExpanded(v => !v)}
              >
                <span className="text-base flex-shrink-0">{toneIcon[tone]}</span>
                <p className={`text-sm font-semibold leading-snug flex-1 min-w-0 ${toneText[tone]}`}>{insight.titulo}</p>
                <button
                  onClick={e => { e.stopPropagation(); handleDismiss() }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0 text-base leading-none px-1"
                  title="Cerrar"
                >×</button>
                <span className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${insightExpanded ? 'rotate-180' : ''}`}>
                  ▾
                </span>
              </div>

              {/* Expanded content */}
              {insightExpanded && (
                <div className="px-4 pb-3">
                  <p className={`text-sm leading-snug ${toneText[tone]} opacity-90`}>{insight.mensaje}</p>
                  {insight.alertaRol && (
                    <p className="text-xs mt-2 leading-snug text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5">
                      <span className="font-medium">⚠️ Rol:</span> {insight.alertaRol}
                    </p>
                  )}
                  {insight.alertaGTD && (
                    <p className="text-xs mt-2 leading-snug text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-2.5 py-1.5">
                      <span className="font-medium">📝 GTD:</span> {insight.alertaGTD}
                    </p>
                  )}
                  {insight.sugerencia && (
                    <p className={`text-xs mt-1.5 leading-snug ${toneText[tone]} opacity-75`}>
                      <span className="font-medium">Acción:</span> {insight.sugerencia}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-black/5 dark:border-white/10">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleInsightFeedback(insight.feedback === 'up' ? null : 'up')}
                        className={`text-sm px-2 py-0.5 rounded-lg transition-colors ${insight.feedback === 'up' ? 'bg-green-200 dark:bg-green-800 text-green-700 dark:text-green-300' : 'text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30'}`}
                        title="Útil"
                      >👍</button>
                      <button
                        onClick={() => handleInsightFeedback(insight.feedback === 'down' ? null : 'down')}
                        className={`text-sm px-2 py-0.5 rounded-lg transition-colors ${insight.feedback === 'down' ? 'bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300' : 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30'}`}
                        title="No útil"
                      >👎</button>
                    </div>
                    <div className="flex items-center gap-2">
                      {insightCooldown && (
                        <span className="text-xs text-gray-400">Disponible en {insightCooldown}min</span>
                      )}
                      <button
                        onClick={handleRefreshInsight}
                        disabled={insightRefreshing}
                        className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 transition-colors flex items-center gap-1"
                        title="Regenerar insight"
                      >
                        <span className={insightRefreshing ? 'animate-spin inline-block' : ''}>↺</span>
                        <span>Regenerar</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* Actions */}
        <div className="flex gap-3 mb-6">
          {!workDay?.endedAt && (
            <button
              onClick={() => setShowModal(true)}
              title="Nueva tarea (tecla N)"
              className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl py-3 transition-colors"
            >
              + Agregar tarea
            </button>
          )}
          {!workDay?.endedAt && (
            <button
              onClick={handleFinish}
              disabled={finishing}
              className="border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium rounded-xl px-5 py-3 transition-colors disabled:opacity-50"
            >
              {finishing ? 'Finalizando...' : 'Finalizar jornada'}
            </button>
          )}
        </div>

        {/* 1. En curso */}
        {inProgress.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">En curso</h2>
            <div className="space-y-2">
              {inProgress.map(t => (
                <TaskCard key={t.id} task={t} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} hasActiveTask={hasActiveTask} onOpenComments={setCommentTask} />
              ))}
            </div>
          </section>
        )}

        {/* 2. Destacadas (starred, no en curso) */}
        {starred.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Destacadas: Foco del día</h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
              {starred.map(t => (
                <TaskCard key={t.id} task={t} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} hasActiveTask={hasActiveTask} onMoveToBacklog={handleUpdateTask} onOpenComments={setCommentTask} />
              ))}
            </div>
          </section>
        )}

        {/* 3. Pausadas */}
        {paused.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Pausadas</h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
              {paused.map(t => (
                <TaskCard key={t.id} task={t} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} hasActiveTask={hasActiveTask} onMoveToBacklog={handleUpdateTask} onOpenComments={setCommentTask} />
              ))}
            </div>
          </section>
        )}

        {/* 4. Bloqueadas */}
        {blocked.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <span>⚠</span> Bloqueadas
            </h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
              {blocked.map(t => (
                <TaskCard key={t.id} task={t} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} hasActiveTask={hasActiveTask} onMoveToBacklog={handleUpdateTask} onOpenComments={setCommentTask} />
              ))}
            </div>
          </section>
        )}

        {/* 5. Pendientes */}
        {pending.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Pendientes</h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
              {pending.map(t => (
                <TaskCard key={t.id} task={t} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} hasActiveTask={hasActiveTask} onMoveToBacklog={handleUpdateTask} onOpenComments={setCommentTask} />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {focusTasks.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-medium">No hay tareas para hoy</p>
            {allBacklog.length > 0
              ? <p className="text-sm mt-1">Expandí el Backlog para agregar tareas al día</p>
              : <p className="text-sm mt-1">Agregá tu primera tarea para empezar</p>
            }
          </div>
        )}

        {/* 6. Backlog — collapsible */}
        {allBacklog.length > 0 && (
          <section className={focusTasks.length > 0 ? 'mb-6' : 'mb-6'}>
            <button
              onClick={() => setBacklogOpen(v => !v)}
              className="w-full flex items-center justify-between py-2 group"
            >
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Backlog</h2>
                <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 font-medium">
                  {allBacklog.length}
                </span>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${backlogOpen ? 'rotate-180' : ''}`}
              >
                <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
              </svg>
            </button>

            {backlogOpen && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 mt-2">
                {allBacklog.map(t => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    onUpdate={handleUpdateTask}
                    onDelete={handleDeleteTask}
                    hasActiveTask={hasActiveTask}
                    backlog
                    onAddToToday={handleAddToToday}
                    onOpenComments={setCommentTask}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* 7. Seguimiento (Seguidas + Delegadas) — collapsible */}
        {(followedTasks.length > 0 || delegated.length > 0) && (
          <section className="mb-6">
            <button
              onClick={() => setDelegatedOpen(v => !v)}
              className="w-full flex items-center justify-between py-2 group"
            >
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Seguimiento</h2>
                <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 font-medium">
                  {followedTasks.length + delegated.length}
                </span>
                {seguimientoBlockedCount > 0 && (
                  <span className="text-xs bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-full px-2 py-0.5 font-medium">
                    ⚠ {seguimientoBlockedCount} bloqueada{seguimientoBlockedCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${delegatedOpen ? 'rotate-180' : ''}`}>
                <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
              </svg>
            </button>

            {delegatedOpen && (
              <div className="mt-2 space-y-4">
                {/* Sub-pestañas: Seguidas / Delegadas */}
                <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-50 dark:bg-gray-800">
                  {[['SEGUIDAS', 'Seguidas', followedTasks.length], ['DELEGADAS', 'Delegadas', delegated.length]].map(([key, label, n]) => (
                    <button
                      key={key}
                      onClick={() => { setSeguimientoTab(key); setDelegatedFilter('ALL'); setDismissConfirm(false) }}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        seguimientoTab === key
                          ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}
                    >
                      {label} <span className="opacity-60">{n}</span>
                    </button>
                  ))}
                </div>

                {/* Pills de filtro + botón borrar (borrar solo en Delegadas) */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex flex-wrap gap-1.5">
                    {seguimientoStatuses.length > 2 && seguimientoStatuses.map(s => {
                      const label = { ALL: 'Todas', PENDING: 'Pendiente', IN_PROGRESS: 'En curso', PAUSED: 'Pausada', BLOCKED: 'Bloqueada', COMPLETED: 'Completada' }[s]
                      const active = delegatedFilter === s
                      const color = active ? {
                        ALL:         'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-900',
                        PENDING:     'bg-gray-500 text-white',
                        IN_PROGRESS: 'bg-primary-600 text-white',
                        PAUSED:      'bg-gray-500 text-white',
                        BLOCKED:     'bg-red-600 text-white',
                        COMPLETED:   'bg-green-600 text-white',
                      }[s] : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      return (
                        <button
                          key={s}
                          onClick={() => { setDelegatedFilter(s); setDismissConfirm(false) }}
                          className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${color}`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>

                  {/* Borrar del dashboard: dismiss en Delegadas, dejar de seguir en Seguidas — mismo botón en ambas */}
                  {filteredSeguimientoByProject.length > 0 && (
                    dismissConfirm ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-xs text-gray-500 dark:text-gray-400">¿Confirmar?</span>
                        <button
                          onClick={handleBulkRemoveSeguimiento}
                          disabled={dismissing}
                          className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
                        >
                          {dismissing ? 'Borrando…' : 'Sí, borrar'}
                        </button>
                        <button
                          onClick={() => setDismissConfirm(false)}
                          className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDismissConfirm(true)}
                        className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors flex-shrink-0"
                        title={
                          seguimientoTab === 'SEGUIDAS'
                            ? (delegatedFilter === 'ALL' ? 'Dejar de seguir todas' : `Dejar de seguir ${delegatedFilter === 'COMPLETED' ? 'las completadas' : 'las filtradas'}`)
                            : (delegatedFilter === 'ALL' ? 'Borrar todas del dashboard' : `Borrar ${delegatedFilter === 'COMPLETED' ? 'completadas' : 'filtradas'} del dashboard`)
                        }
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 3.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                        </svg>
                        {seguimientoTab === 'SEGUIDAS'
                          ? (delegatedFilter === 'ALL' ? 'Dejar de seguir todas' : `Dejar de seguir ${filteredSeguimientoByProject.reduce((s, g) => s + g.tasks.length, 0)}`)
                          : (delegatedFilter === 'ALL' ? 'Borrar todas' : `Borrar ${filteredSeguimientoByProject.reduce((s, g) => s + g.tasks.length, 0)}`)}
                      </button>
                    )
                  )}
                </div>

                {seguimientoTab === 'DELEGADAS' && filteredSeguimientoByProject.length > 0 && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 italic px-1 -mt-2">
                    Las completadas hace más de 7 días se ocultan automáticamente de esta lista.
                  </p>
                )}

                {filteredSeguimientoByProject.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic px-1">
                    {seguimientoTab === 'SEGUIDAS'
                      ? 'No estás siguiendo ninguna tarea. Abrí una tarea y tocá "Seguir" para que te avise si se completa o comenta.'
                      : 'No tenés tareas delegadas.'}
                  </p>
                ) : filteredSeguimientoByProject.map(({ project, tasks }) => (
                  <div key={project.id}>
                    <p className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1.5 px-1">{project.name}</p>
                    <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                      {tasks.map(t => (
                        <TrackedTaskRow
                          key={t.id}
                          task={t}
                          onClick={() => { markSeguimientoSeen(t); setCommentTask(t) }}
                          onRemove={handleRemoveOneSeguimiento}
                          removeTitle={seguimientoTab === 'SEGUIDAS' ? 'Dejar de seguir' : 'Quitar del dashboard'}
                          isNew={seguimientoSeen[t.id] !== seguimientoSignature(t)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 8. Completadas — historial paginado collapsible */}
        <section className="mb-6">
          <button
            onClick={handleToggleCompleted}
            className="w-full flex items-center justify-between py-2"
          >
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Completadas</h2>
              {completed.length > 0 && (
                <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-full px-2 py-0.5 font-medium">
                  {completed.length} hoy
                </span>
              )}
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${completedOpen ? 'rotate-180' : ''}`}
            >
              <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {completedOpen && (
            <div className="mt-2 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
              {/* Hoy */}
              {completed.length === 0 && completedHistory.length === 0 && !completedLoading && (
                <p className="text-sm text-gray-400 text-center py-6">No hay tareas completadas aún</p>
              )}
              {completed.map(t => (
                <CompletedTaskRow key={t.id} task={t} variant="today" onOpenComments={setCommentTask} onSaveDuration={saveCompletedDuration} />
              ))}

              {/* Historial de días anteriores */}
              {completedHistory.map(t => (
                <CompletedTaskRow key={t.id} task={t} variant="history" onOpenComments={setCommentTask} onSaveDuration={saveCompletedDuration} />
              ))}

              {completedLoading && (
                <LoadingSpinner size="sm" className="py-4" />
              )}
              {completedHasMore && !completedLoading && (
                <button
                  onClick={() => loadCompletedHistory(completedSkip)}
                  className="w-full py-3 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors"
                >
                  Cargar más
                </button>
              )}
            </div>
          )}
        </section>

        {/* 9. Futuras — tareas programadas para más adelante, collapsible */}
        {future.length > 0 && (
          <section className="mb-6">
            <button
              onClick={() => setFutureOpen(v => !v)}
              className="w-full flex items-center justify-between py-2 group"
            >
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Futuras</h2>
                <span className="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 rounded-full px-2 py-0.5 font-medium">
                  {future.length}
                </span>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${futureOpen ? 'rotate-180' : ''}`}
              >
                <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
              </svg>
            </button>

            {futureOpen && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 mt-2">
                {future.map(t => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    onUpdate={handleUpdateTask}
                    onDelete={handleDeleteTask}
                    future
                    onBringToToday={handleBringToToday}
                    onOpenComments={setCommentTask}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {showModal && <AddTaskModal onAdd={handleAddTask} onClose={() => setShowModal(false)} alertaGTD={insight?.alertaGTD ?? null} />}

      {commentTask && (
        <TaskCommentsModal
          task={commentTask}
          onClose={() => setCommentTask(null)}
          onCommentAdded={count => handleCommentAdded(commentTask.id, count)}
          onTaskEdited={updated => {
            handleUpdateTask(updated)
            setCompletedHistory(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))
            setCommentTask(updated)
          }}
          onTaskDeleted={id => { handleDeleteTask(id); setCompletedHistory(prev => prev.filter(t => t.id !== id)); setDelegated(prev => prev.filter(t => t.id !== id)); setFollowedTasks(prev => prev.filter(t => t.id !== id)) }}
          onFollowChanged={handleFollowChanged}
        />
      )}

      <InactivityModal
        phase={autoPausedTask ? 'auto_paused' : null}
        taskDescription={autoPausedTask?.description}
        onDismiss={clearAutoPaused}
        onResume={handleResumeAutoPaused}
      />
    </div>
  )
}
