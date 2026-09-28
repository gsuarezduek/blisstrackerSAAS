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
import HowToButton from '../components/HowToButton'
import { useInactivity } from '../hooks/useInactivity'
import api from '../api/client'
import ConfirmModal from '../components/ConfirmModal'
import NowCard from '../components/dashboard/NowCard'
import LaterTabs from '../components/dashboard/LaterTabs'
import { useAuth } from '../context/AuthContext'
import { completedMinutes } from '../utils/format'
import {
  SEGUIMIENTO_STATUS_PRIORITY, seguimientoSeenKey, loadSeguimientoSeen, seguimientoSignature,
  CompletedTaskRow, DailyInsightBlock, SeguimientoSection,
} from './DashboardParts'

function todayLabel() {
  const s = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function greeting() {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }))
  return h < 12 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
}

function fmtHM(mins) {
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
}

const LATER_TAB_KEY = 'bliss_dashboard_later_tab'

// Sección del foco del día: título + contador + lista en una sola columna (tarjeta con
// divisores). Reemplaza a la grilla de 2 columnas por estado, que zigzagueaba al leer.
function TaskSection({ title, count, tone = 'default', hint, children }) {
  const titleColor = tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2 px-1">
        <h2 className={`text-sm font-semibold ${titleColor}`}>{title}</h2>
        <span className="text-xs text-gray-400">{count}</span>
        {hint && <span className="hidden sm:inline text-xs text-gray-400 dark:text-gray-500 ml-auto">{hint}</span>}
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/70">
        {children}
      </div>
    </section>
  )
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
  const [delegated, setDelegated] = useState([])
  const [followedTasks, setFollowedTasks] = useState([])
  const [seguimientoTab, setSeguimientoTab] = useState('SEGUIDAS')  // 'SEGUIDAS' | 'DELEGADAS'
  const [delegatedFilter, setDelegatedFilter] = useState('ALL')
  const [dismissConfirm, setDismissConfirm] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [seguimientoSeen, setSeguimientoSeen] = useState(() => loadSeguimientoSeen(user?.id))
  const [backlogOpenProjects, setBacklogOpenProjects] = useState(() => new Set())
  // Panel "Más tarde" (Backlog / Seguimiento / Programadas / Completadas): reemplaza a
  // los 4 acordeones del final. Recuerda la última pestaña por navegador.
  const [laterTab, setLaterTabState] = useState(() => {
    try { return localStorage.getItem(LATER_TAB_KEY) || 'backlog' } catch { return 'backlog' }
  })
  const [finishOpen, setFinishOpen] = useState(false)
  const laterRef = useRef(null)
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

  // Refrescar cuando se crea una tarea desde el atajo global (tecla N en otra página).
  // Si quedó delegada a otra persona, además refresca Delegadas (no aparece en loadToday()).
  useEffect(() => {
    function onTaskCreated(e) {
      loadToday()
      const task = e.detail
      if (task?.userId && user?.id && task.userId !== user.id) {
        api.get('/tasks/delegated').then(r => setDelegated(r.data)).catch(() => {})
      }
    }
    window.addEventListener('bliss:task-created', onTaskCreated)
    return () => window.removeEventListener('bliss:task-created', onTaskCreated)
  }, [loadToday, user?.id])

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
    // Tarea delegada a otra persona: no es mía, no debe aparecer en mi foco de hoy.
    // La respuesta de POST /tasks no trae el `user` (asignado) con avatar incluido
    // (taskInclude solo trae `createdBy`), así que refrescamos /tasks/delegated en
    // vez de armar la fila a mano — aparece ya mismo en Seguimiento, sin recargar.
    if (task.userId && user?.id && task.userId !== user.id) {
      api.get('/tasks/delegated').then(r => setDelegated(r.data)).catch(() => {})
      setSeguimientoTab('DELEGADAS')
      setDelegatedFilter('ALL')
      setLaterTab('seguimiento')
      return
    }
    // Tarea programada a futuro: no va al foco de hoy, va a la sección "Futuras".
    if (task.scheduledFor && workDay && task.scheduledFor > workDay.date) {
      setFuture(prev => [...prev, task].sort((a, b) => (a.scheduledFor > b.scheduledFor ? 1 : -1)))
      setLaterTab('programadas')
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

  // Cuántas Delegadas están completadas — es lo único que el botón "Borrar" bulk
  // toca por default (ver handleBulkRemoveSeguimiento). Excluye avisos de eliminación
  // (status 'DELETED', no 'COMPLETED'; el backend igual los limpia junto con las
  // completadas — ver delegation.controller.js).
  const delegatedCompletedCount = useMemo(
    () => delegated.filter(t => t.status === 'COMPLETED').length,
    [delegated]
  )

  // Visibilidad del botón bulk: en Delegadas sin filtro, solo si hay completadas
  // que borrar (si no, no hay nada que el botón "Borrar completadas" pueda hacer).
  const showSeguimientoBulkButton = seguimientoTab === 'DELEGADAS' && delegatedFilter === 'ALL'
    ? delegatedCompletedCount > 0
    : filteredSeguimientoByProject.length > 0

  // Borrar/dejar de seguir en bulk — mismo botón para ambas pestañas, apunta al endpoint
  // correspondiente (dismiss de Delegadas o unfollow de Seguidas). En Delegadas sin un
  // filtro de estado explícito, el bulk-clear apunta solo a completadas — nunca a las
  // que siguen pendientes/en curso/bloqueadas, que siguen siendo trabajo por hacer.
  async function handleBulkRemoveSeguimiento() {
    setDismissing(true)
    try {
      if (seguimientoTab === 'DELEGADAS') {
        const status = delegatedFilter !== 'ALL' ? delegatedFilter : 'COMPLETED'
        await api.delete(`/tasks/delegated?status=${status}`)
        const { data } = await api.get('/tasks/delegated')
        setDelegated(data)
      } else {
        const params = delegatedFilter !== 'ALL' ? `?status=${delegatedFilter}` : ''
        await api.delete(`/tasks/followed${params}`)
        const { data } = await api.get('/tasks/followed')
        setFollowedTasks(data)
      }
      setDelegatedFilter('ALL')
      setDismissConfirm(false)
    } catch (_) {}
    setDismissing(false)
  }

  // Quitar una sola fila — dismiss individual en Delegadas (tarea real o aviso de
  // eliminación, cada uno con su propio endpoint), dejar de seguir en Seguidas.
  async function handleRemoveOneSeguimiento(task) {
    try {
      if (task.__deletedNotice) {
        await api.delete(`/tasks/delegated/notices/${task.id}`)
        setDelegated(prev => prev.filter(t => !(t.__deletedNotice && t.id === task.id)))
      } else if (seguimientoTab === 'DELEGADAS') {
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

  function setLaterTab(key) {
    setLaterTabState(key)
    try { localStorage.setItem(LATER_TAB_KEY, key) } catch { /* sin storage */ }
  }

  // El historial de completadas se carga recién la primera vez que se abre esa pestaña.
  useEffect(() => {
    if (laterTab === 'completadas' && completedHistory.length === 0 && !completedLoading && completedSkip === 0) loadCompletedHistory(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laterTab])

  function goToSeguimiento() {
    setLaterTab('seguimiento')
    setSeguimientoTab(followedTasks.some(t => t.status === 'BLOCKED') ? 'SEGUIDAS' : 'DELEGADAS')
    setDelegatedFilter('BLOCKED')
    setTimeout(() => laterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
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

  // Destacadas por prioridad (3 = roja primero) y, para "Para hoy", pausadas antes que
  // pendientes (ya tienen trabajo invertido).
  const starredSorted = useMemo(() => [...starred].sort((a, b) => (b.starred ?? 0) - (a.starred ?? 0)), [starred])
  const forToday = useMemo(() => [...paused, ...pending], [paused, pending])

  // Sugerencia de la tarjeta "Ahora" cuando no hay nada en curso.
  const suggestion = activeTask ? null : (starredSorted.find(t => t.status !== 'BLOCKED') ?? paused[0] ?? pending[0] ?? null)

  const dayEnded = !!workDay?.endedAt
  const leftToday = starred.length + paused.length + blocked.length + pending.length
  const taskProps = { onUpdate: handleUpdateTask, onDelete: handleDeleteTask, activeTask, onMoveToBacklog: handleUpdateTask, onOpenComments: setCommentTask }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <OnboardingWizard />

      <main className="max-w-4xl mx-auto px-4 pt-6 sm:pt-10 pb-16">
        {/* Encabezado: saludo + resumen del día en línea + acciones */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div className="min-w-0">
            <p className="text-sm text-gray-500 dark:text-gray-400">{todayLabel()}</p>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 dark:text-white mt-0.5">
              {greeting()}, {user?.name.split(' ')[0]}
            </h1>
            {workDay && (
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                {!dayEnded && elapsed && <span>Jornada <span className="font-medium text-gray-700 dark:text-gray-200">{elapsed}</span></span>}
                <span><span className="font-medium text-gray-700 dark:text-gray-200">{completed.length}</span> completada{completed.length === 1 ? '' : 's'}</span>
                <span><span className="font-medium text-gray-700 dark:text-gray-200">{fmtHM(totalMins)}</span> registradas</span>
                {!dayEnded && <span><span className="font-medium text-gray-700 dark:text-gray-200">{leftToday}</span> por hacer</span>}
              </p>
            )}
          </div>
          {!dayEnded && (
            <div className="flex items-center gap-2 sm:flex-shrink-0">
              <button
                onClick={() => setFinishOpen(true)}
                disabled={finishing}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Terminar jornada
              </button>
              <button
                onClick={() => setShowModal(true)}
                title="Nueva tarea (tecla N)"
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white shadow-sm transition-colors"
              >
                <span className="text-base leading-none">+</span> Agregar tarea
                <kbd className="hidden sm:inline ml-1 text-[10px] font-medium bg-white/20 rounded px-1.5 py-0.5">N</kbd>
              </button>
            </div>
          )}
        </div>

        {workdayError && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">No se pudo cargar la jornada</p>
            <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">{workdayError}</p>
            <button onClick={loadToday} className="text-xs text-red-700 dark:text-red-400 underline mt-1 hover:no-underline">Reintentar</button>
          </div>
        )}

        <SetupChecklist />

        {user?.dailyInsightEnabled !== false && workDay && !dayEnded && (
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

        <div className="space-y-6">
          {/* 1. Ahora */}
          {workDay && (
            <NowCard
              activeTask={activeTask}
              suggestion={suggestion}
              dayEnded={dayEnded}
              onUpdate={handleUpdateTask}
              onOpenComments={setCommentTask}
              onAddTask={() => setShowModal(true)}
            />
          )}

          {/* Aviso: algo que delegué o sigo está bloqueado (antes quedaba escondido en un acordeón cerrado) */}
          {seguimientoBlockedCount > 0 && (
            <button onClick={goToSeguimiento}
              className="w-full flex items-center gap-3 text-left rounded-xl border border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-900/20 px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
              <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
              <span className="text-sm text-red-800 dark:text-red-300 flex-1">
                {seguimientoBlockedCount === 1 ? 'Una tarea que delegaste o seguís está bloqueada' : `${seguimientoBlockedCount} tareas que delegaste o seguís están bloqueadas`}
              </span>
              <span className="text-sm font-semibold text-red-700 dark:text-red-300">Ver →</span>
            </button>
          )}

          {/* 2. Foco del día (destacadas) */}
          {starredSorted.length > 0 && (
            <TaskSection title="Foco del día" count={starredSorted.length} hint="Tus destacadas, de mayor a menor prioridad">
              {starredSorted.map(t => <TaskCard key={t.id} task={t} {...taskProps} />)}
            </TaskSection>
          )}

          {/* 3. Bloqueadas */}
          {blocked.length > 0 && (
            <TaskSection title="Bloqueadas" count={blocked.length} tone="danger">
              {blocked.map(t => <TaskCard key={t.id} task={t} {...taskProps} />)}
            </TaskSection>
          )}

          {/* 4. Para hoy (pausadas + pendientes) */}
          {forToday.length > 0 && (
            <TaskSection title="Para hoy" count={forToday.length}>
              {forToday.map(t => <TaskCard key={t.id} task={t} {...taskProps} />)}
            </TaskSection>
          )}

          {/* 5. Más tarde: Backlog / Seguimiento / Programadas / Completadas */}
          <div ref={laterRef} className="scroll-mt-20 pt-2">
            <LaterTabs
              value={laterTab}
              onChange={setLaterTab}
              tabs={[
                { key: 'backlog', label: 'Backlog', count: allBacklog.length },
                { key: 'seguimiento', label: 'Seguimiento', count: followedTasks.length + delegated.length, alert: seguimientoBlockedCount > 0 },
                { key: 'programadas', label: 'Programadas', count: future.length },
                { key: 'completadas', label: 'Completadas', count: completed.length, countLabel: completed.length ? `${completed.length} hoy` : null },
              ]}
            />

            <div className="mt-3">
              {laterTab === 'backlog' && (
                allBacklog.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 px-1 py-6 text-center">Tu Backlog está vacío. Lo que no sea para hoy, mandalo acá desde el menú ⋯ de la tarea.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Lo que querés hacer, pero no hoy. Traé al foco lo que esté listo para trabajarse.</p>
                      <HowToButton topic="dashboard.backlog" />
                    </div>
                    {backlogByProject.map(({ project, tasks: projectTasks }) => {
                      const isOpen = !backlogOpenProjects.has(project.id) // el set guarda los proyectos COLAPSADOS: abiertos por defecto
                      return (
                        <div key={project.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700 overflow-hidden">
                          <button onClick={() => toggleBacklogProject(project.id)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                            <span className="flex items-center gap-2">
                              <svg viewBox="0 0 20 20" fill="currentColor" className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" /></svg>
                              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{project.name}</span>
                            </span>
                            <span className="text-xs text-gray-400">{projectTasks.length}</span>
                          </button>
                          {isOpen && (
                            <div className="divide-y divide-gray-100 dark:divide-gray-700/70 border-t border-gray-100 dark:border-gray-700/70">
                              {projectTasks.map(t => (
                                <TaskCard key={t.id} task={t} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} backlog onAddToToday={handleAddToToday} onOpenComments={setCommentTask} />
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              )}

              {laterTab === 'seguimiento' && (
                (followedTasks.length === 0 && delegated.length === 0) ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 px-1 py-6 text-center">Cuando delegues una tarea o sigas una ajena, vas a ver acá cómo avanza.</p>
                ) : (
                  <SeguimientoSection
                    embedded
                    followedTasks={followedTasks}
                    delegated={delegated}
                    seguimientoBlockedCount={seguimientoBlockedCount}
                    seguimientoTab={seguimientoTab}
                    onChangeTab={handleSeguimientoTabChange}
                    delegatedFilter={delegatedFilter}
                    onChangeFilter={handleSeguimientoFilterChange}
                    dismissConfirm={dismissConfirm}
                    setDismissConfirm={setDismissConfirm}
                    dismissing={dismissing}
                    onBulkRemove={handleBulkRemoveSeguimiento}
                    showBulkButton={showSeguimientoBulkButton}
                    delegatedCompletedCount={delegatedCompletedCount}
                    seguimientoStatuses={seguimientoStatuses}
                    filteredSeguimientoByProject={filteredSeguimientoByProject}
                    seguimientoSeen={seguimientoSeen}
                    onOpenTask={handleOpenSeguimientoTask}
                    onRemoveOne={handleRemoveOneSeguimiento}
                  />
                )
              )}

              {laterTab === 'programadas' && (
                future.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 px-1 py-6 text-center">No tenés tareas programadas. Al crear una tarea podés elegir que aparezca en una fecha futura.</p>
                ) : (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/70">
                    {future.map(t => (
                      <TaskCard key={t.id} task={t} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} future onBringToToday={handleBringToToday} onOpenComments={setCommentTask} />
                    ))}
                  </div>
                )
              )}

              {laterTab === 'completadas' && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/70">
                  {completed.length === 0 && completedHistory.length === 0 && !completedLoading && (
                    <p className="text-sm text-gray-400 text-center py-6">Todavía no completaste tareas.</p>
                  )}
                  {completed.map(t => (
                    <CompletedTaskRow key={t.id} task={t} variant="today" onOpenComments={setCommentTask} onSaveDuration={saveCompletedDuration} />
                  ))}
                  {completedHistory.map(t => (
                    <CompletedTaskRow key={t.id} task={t} variant="history" onOpenComments={setCommentTask} onSaveDuration={saveCompletedDuration} />
                  ))}
                  {completedLoading && <LoadingSpinner size="sm" className="py-4" />}
                  {completedHasMore && !completedLoading && (
                    <button onClick={() => loadCompletedHistory(completedSkip)}
                      className="w-full py-3 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium transition-colors">
                      Cargar más
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {showModal && <AddTaskModal onAdd={handleAddTask} onClose={() => setShowModal(false)} alertaGTD={insight?.alertaGTD ?? null} />}

      <ConfirmModal
        open={finishOpen}
        title="¿Terminar la jornada?"
        message={`Hoy completaste ${completed.length} tarea${completed.length === 1 ? '' : 's'} y registraste ${fmtHM(totalMins)}.${leftToday === 1 ? '\nLa que queda pendiente pasa a mañana.' : leftToday > 1 ? `\nLas ${leftToday} que quedan pendientes pasan a mañana.` : ''}${activeTask ? '\nLa tarea en curso se va a pausar.' : ''}\n\nSe cierra tu sesión.`}
        confirmLabel="Terminar jornada"
        danger={false}
        loading={finishing}
        onConfirm={handleFinish}
        onCancel={() => setFinishOpen(false)}
      />

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
