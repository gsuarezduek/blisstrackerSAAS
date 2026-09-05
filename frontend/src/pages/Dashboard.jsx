import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
import RoleBadge from '../components/RoleBadge'
import { useAuth } from '../context/AuthContext'
import { completedMinutes } from '../utils/format'
import {
  SEGUIMIENTO_STATUS_PRIORITY, seguimientoSeenKey, loadSeguimientoSeen, seguimientoSignature,
  CompletedTaskRow, DailyInsightBlock, SeguimientoSection,
} from './DashboardParts'

function todayLabel() {
  return new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

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
  const [backlogOpenProjects, setBacklogOpenProjects] = useState(() => new Set())
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

  function handleDismissInsight() {
    if (!insight) return
    localStorage.setItem('insightDismissed', String(insight.id))
    setInsightDismissed(true)
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

  // Backlog agrupado por proyecto (mismo criterio que seguimientoByProject: el orden de los
  // grupos sigue el de la primera aparición en allBacklog, que ya viene newest-first).
  const backlogByProject = useMemo(() => {
    const map = {}
    for (const t of allBacklog) {
      const pid = t.project.id
      if (!map[pid]) map[pid] = { project: t.project, tasks: [] }
      map[pid].tasks.push(t)
    }
    return Object.values(map)
  }, [allBacklog])

  function toggleBacklogProject(pid) {
    setBacklogOpenProjects(prev => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid); else next.add(pid)
      return next
    })
  }

  const activeTask = useMemo(() => focusTasks.find(t => t.status === 'IN_PROGRESS') ?? null, [focusTasks])

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

  function handleSeguimientoTabChange(key) {
    setSeguimientoTab(key)
    setDelegatedFilter('ALL')
    setDismissConfirm(false)
  }

  function handleSeguimientoFilterChange(s) {
    setDelegatedFilter(s)
    setDismissConfirm(false)
  }

  function handleOpenSeguimientoTask(task) {
    markSeguimientoSeen(task)
    setCommentTask(task)
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
        {user?.dailyInsightEnabled !== false && workDay && !workDay.endedAt && (
          <DailyInsightBlock
            loading={insightLoading}
            insight={insight}
            dismissed={insightDismissed}
            expanded={insightExpanded}
            onToggleExpanded={() => setInsightExpanded(v => !v)}
            onDismiss={handleDismissInsight}
            cooldown={insightCooldown}
            refreshing={insightRefreshing}
            onRefresh={handleRefreshInsight}
            onFeedback={handleInsightFeedback}
          />
        )}

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
              <div className="space-y-1 mt-2">
                {backlogByProject.map(({ project, tasks: projectTasks }) => {
                  const isOpen = backlogOpenProjects.has(project.id)
                  return (
                    <div key={project.id}>
                      <button
                        onClick={() => toggleBacklogProject(project.id)}
                        className="w-full flex items-center justify-between py-2 px-1 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                          >
                            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                          </svg>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{project.name}</span>
                        </div>
                        <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 font-medium">
                          {projectTasks.length}
                        </span>
                      </button>

                      {isOpen && (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 mt-1 mb-2 pl-2">
                          {projectTasks.map(t => (
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
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* 7. Seguimiento (Seguidas + Delegadas) — collapsible */}
        {(followedTasks.length > 0 || delegated.length > 0) && (
          <SeguimientoSection
            followedTasks={followedTasks}
            delegated={delegated}
            seguimientoBlockedCount={seguimientoBlockedCount}
            delegatedOpen={delegatedOpen}
            setDelegatedOpen={setDelegatedOpen}
            seguimientoTab={seguimientoTab}
            onChangeTab={handleSeguimientoTabChange}
            delegatedFilter={delegatedFilter}
            onChangeFilter={handleSeguimientoFilterChange}
            dismissConfirm={dismissConfirm}
            setDismissConfirm={setDismissConfirm}
            dismissing={dismissing}
            onBulkRemove={handleBulkRemoveSeguimiento}
            seguimientoStatuses={seguimientoStatuses}
            filteredSeguimientoByProject={filteredSeguimientoByProject}
            seguimientoSeen={seguimientoSeen}
            onOpenTask={handleOpenSeguimientoTask}
            onRemoveOne={handleRemoveOneSeguimiento}
          />
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
