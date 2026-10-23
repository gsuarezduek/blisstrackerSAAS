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
import AgentTasksPanel from '../components/dashboard/AgentTasksPanel'
import AgentsWorkingStrip from '../components/dashboard/AgentsWorkingStrip'
import useMyAgents from '../hooks/useMyAgents'
import { useAuth } from '../context/AuthContext'
import { completedMinutes } from '../utils/format'
import {
  SEGUIMIENTO_STATUS_PRIORITY, seguimientoSeenKey, loadSeguimientoSeen, seguimientoSignature, isSeguimientoNew,
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
const BACKLOG_SORT_KEY = 'bliss_dashboard_backlog_sort' // 'desc' (más nuevas primero) | 'asc'

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
  // Tareas que ejecutan mis agentes de IA (Task.isAgentTask) — pestaña "Agentes", fuera del foco.
  const [agentTasks, setAgentTasks] = useState([])
  const myAgents = useMyAgents()
  const [delegated, setDelegated] = useState([])
  const [followedTasks, setFollowedTasks] = useState([])
  const [seguimientoTab, setSeguimientoTab] = useState('SEGUIDAS')  // 'SEGUIDAS' | 'DELEGADAS'
  const [delegatedFilter, setDelegatedFilter] = useState('ALL')
  const [dismissConfirm, setDismissConfirm] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [seguimientoSeen, setSeguimientoSeen] = useState(() => loadSeguimientoSeen(user?.id))
  const [backlogOpenProjects, setBacklogOpenProjects] = useState(() => new Set())
  // Orden del Backlog por fecha de creación; se recuerda por navegador.
  const [backlogSort, setBacklogSortState] = useState(() => {
    try { return localStorage.getItem(BACKLOG_SORT_KEY) === 'asc' ? 'asc' : 'desc' } catch { return 'desc' }
  })
  function setBacklogSort(dir) {
    setBacklogSortState(dir)
    try { localStorage.setItem(BACKLOG_SORT_KEY, dir) } catch { /* sin storage */ }
  }
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
      const { carryOverTasks, futureTasks, agentTasks: agentList, ...wd } = data
      setWorkDay(wd)
      setCarryOver(carryOverTasks ?? [])
      setFuture(futureTasks ?? [])
      setAgentTasks(agentList ?? [])

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

  // Seguidas + Delegadas. Si un pedido falla, esa lista queda como estaba (en vez de
  // vaciarse en un refresco y perder las novedades). Devuelve las listas frescas (o null).
  const loadSeguimiento = useCallback(() => Promise.all([
    api.get('/tasks/delegated').then(r => r.data).catch(() => null),
    api.get('/tasks/followed').then(r => r.data).catch(() => null),
  ]).then(([del, fol]) => {
    if (del) setDelegated(del)
    if (fol) setFollowedTasks(fol)
    return [del, fol]
  }), [])

  const seguimientoTabInit = useRef(false)
  useEffect(() => {
    loadSeguimiento().then(([del, fol]) => {
      // Pestaña por defecto: Seguidas si hay alguna, si no Delegadas.
      if (!seguimientoTabInit.current) {
        seguimientoTabInit.current = true
        if (!fol?.length && del?.length > 0) setSeguimientoTab('DELEGADAS')
      }
    })
  }, [loadSeguimiento])

  // Las tareas que sigo o delegué las mueven otras personas: refresco cada 60s (solo
  // con la pestaña visible) y al volver a la pestaña, para que el aviso de "nuevas" en
  // Seguimiento aparezca sin recargar.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      loadSeguimiento()
    }
    const t = setInterval(refresh, 60000)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', refresh) }
  }, [loadSeguimiento])

  // La primera vez que una tarea aparece en Seguimiento (recién seguida o delegada) se
  // guarda su firma actual sin marcarla como novedad: solo avisan los cambios posteriores.
  useEffect(() => {
    if (!user?.id) return
    setSeguimientoSeen(prev => {
      const missing = [...followedTasks, ...delegated].filter(t => !t.__deletedNotice && prev[t.id] === undefined)
      if (missing.length === 0) return prev
      const next = { ...prev }
      for (const t of missing) next[t.id] = seguimientoSignature(t)
      try { localStorage.setItem(seguimientoSeenKey(user.id), JSON.stringify(next)) } catch (_) {}
      return next
    })
  }, [followedTasks, delegated, user?.id])

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
    // La hace uno de mis agentes: va a la pestaña Agentes, no a mi foco.
    if (task.isAgentTask) {
      setAgentTasks(prev => [task, ...prev])
      setLaterTab('agentes')
      return
    }
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
    if (agentTasks.find(t => t.id === updated.id)) {
      setAgentTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))
      return
    }
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
    setAgentTasks(prev => prev.filter(t => t.id !== id && (!recurrenceId || t.recurrenceId !== recurrenceId)))
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

  function handleCommentAdded(taskId, newCount) {
    const update = list => list.map(t =>
      t.id === taskId ? { ...t, _count: { ...t._count, comments: newCount } } : t
    )
    setWorkDay(prev => ({ ...prev, tasks: update(prev.tasks) }))
    setCarryOver(prev => update(prev))
    setCompletedHistory(prev => update(prev))
  }

  // Delegar a mi agente / devolverme una tarea: la tarea cambia de lista (y con
  // scope=series, toda la serie) — se recarga la jornada entera en vez de mover a mano.
  function handleAgentHandoff() {
    loadToday()
  }

  // Los agentes trabajan en paralelo y del lado del servidor: refresco liviano de sus
  // tareas cada 30s (solo con la pestaña visible y si hay agentes), para que la franja
  // "Tus agentes trabajando ahora" y la pestaña Agentes no queden congeladas.
  const hasAgents = myAgents.length > 0 || agentTasks.length > 0
  useEffect(() => {
    if (!hasAgents) return
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      api.get('/tasks/agent-queue', { params: { view: 'dashboard' } })
        .then(r => setAgentTasks(r.data))
        .catch(() => {})
    }
    const t = setInterval(refresh, 30000)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', refresh) }
  }, [hasAgents])

  const agentBlockedCount = useMemo(() => agentTasks.filter(t => t.status === 'BLOCKED').length, [agentTasks])
  const agentOpenCount = useMemo(() => agentTasks.filter(t => t.status !== 'COMPLETED').length, [agentTasks])

  function goToAgents() {
    setLaterTab('agentes')
    setTimeout(() => laterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  // Derived state
  const tasks = workDay?.tasks ?? []

  // Dos zonas nada más: el FOCO (lo destacado, lo en curso y lo bloqueado) y el BACKLOG
  // (todas las demás tareas abiertas: de hoy, arrastradas de días anteriores o marcadas
  // como Backlog). Ya no hay una sección "Para hoy" aparte. Las programadas a futuro
  // viven en su pestaña (vienen en `future`, no en tasks/carryOver).
  const isStarred = t => (t.starred ?? 0) > 0
  const allMine = useMemo(() =>
    [...tasks, ...carryOver].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [tasks, carryOver]
  )
  const focusTasks = useMemo(() =>
    allMine.filter(t => t.status === 'COMPLETED' || t.status === 'IN_PROGRESS' || t.status === 'BLOCKED' || isStarred(t)),
    [allMine]
  )
  // Backlog: pausadas primero (ya tienen trabajo invertido), después pendientes, newest first.
  const allBacklog = useMemo(() => {
    const open = allMine.filter(t => (t.status === 'PENDING' || t.status === 'PAUSED') && !isStarred(t))
    return [...open.filter(t => t.status === 'PAUSED'), ...open.filter(t => t.status === 'PENDING')]
  }, [allMine])

  // Backlog agrupado por proyecto, ordenado solo por fecha de creación según el orden
  // elegido (el "pausadas primero" de allBacklog se mantiene para la sugerencia de NowCard,
  // no para esta lista). El orden de los grupos sigue la primera aparición en esa lista.
  const backlogByProject = useMemo(() => {
    const dir = backlogSort === 'asc' ? 1 : -1
    const sorted = [...allBacklog].sort((a, b) => dir * (new Date(a.createdAt) - new Date(b.createdAt)))
    const map = {}
    for (const t of sorted) {
      const pid = t.project.id
      if (!map[pid]) map[pid] = { project: t.project, tasks: [] }
      map[pid].tasks.push(t)
    }
    return Object.values(map)
  }, [allBacklog, backlogSort])

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

  // Cuántas tareas de Seguimiento cambiaron (estado o comentarios) desde que las vi.
  // Una tarea puede estar en las dos listas: se cuenta una vez.
  const seguimientoNewCount = useMemo(() => {
    const ids = new Set()
    for (const t of [...followedTasks, ...delegated]) {
      if (isSeguimientoNew(seguimientoSeen, t)) ids.add(t.id)
    }
    return ids.size
  }, [followedTasks, delegated, seguimientoSeen])

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

  // Al cerrar el detalle de una tarea de Seguimiento, refresca las listas y la marca vista
  // con su firma fresca: lo que se vio adentro (o un comentario propio) no queda como novedad.
  function handleCloseCommentTask() {
    const closed = commentTask
    setCommentTask(null)
    if (!closed || ![...followedTasks, ...delegated].some(t => t.id === closed.id)) return
    loadSeguimiento().then(([del, fol]) => {
      const fresh = [...(fol ?? []), ...(del ?? [])].find(t => t.id === closed.id && !t.__deletedNotice)
      if (fresh) markSeguimientoSeen(fresh)
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

  // Secciones del foco
  const { completed, starred, blocked, totalMins } = useMemo(() => {
    const completed  = focusTasks
      .filter(t => t.status === 'COMPLETED')
      .sort((a, b) => new Date(b.completedAt ?? 0) - new Date(a.completedAt ?? 0))
    const starred    = focusTasks.filter(t => isStarred(t) && t.status !== 'COMPLETED' && t.status !== 'IN_PROGRESS')
    const starredIds = new Set(starred.map(t => t.id))
    const blocked    = focusTasks.filter(t => t.status === 'BLOCKED' && !starredIds.has(t.id))
    const totalMins  = completed.reduce((acc, t) => acc + (completedMinutes(t) ?? 0), 0)
    return { completed, starred, blocked, totalMins }
  }, [focusTasks])

  // Destacadas por prioridad (3 = roja primero).
  const starredSorted = useMemo(() => [...starred].sort((a, b) => (b.starred ?? 0) - (a.starred ?? 0)), [starred])

  // Sugerencia de la tarjeta "Ahora" cuando no hay nada en curso: la destacada de mayor
  // prioridad, si no la pausada más reciente del Backlog, si no la pendiente más nueva.
  const suggestion = activeTask ? null : (starredSorted.find(t => t.status !== 'BLOCKED') ?? allBacklog[0] ?? null)

  const dayEnded = !!workDay?.endedAt
  const inFocus = starred.length + blocked.length
  const leftToday = inFocus + allBacklog.length
  // Sin onMoveToBacklog: con un solo Backlog para todo lo no destacado, "Mover al Backlog" ya no aplica.
  const taskProps = { onUpdate: handleUpdateTask, onDelete: handleDeleteTask, activeTask, onOpenComments: setCommentTask, onDelegated: handleAgentHandoff }

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
                {!dayEnded && <span><span className="font-medium text-gray-700 dark:text-gray-200">{inFocus}</span> en foco</span>}
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

          {/* Lo que mis agentes de IA están haciendo en paralelo (compacto, en azul) */}
          <AgentsWorkingStrip tasks={agentTasks} onOpenComments={setCommentTask} onSeeAll={goToAgents} />

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

          {/* Aviso: un agente se trabó y pide ayuda (la tarea sigue a mi nombre) */}
          {agentBlockedCount > 0 && (
            <button onClick={goToAgents}
              className="w-full flex items-center gap-3 text-left rounded-xl border border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-900/20 px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
              <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
              <span className="text-sm text-red-800 dark:text-red-300 flex-1">
                {agentBlockedCount === 1 ? 'Tu agente se trabó en una tarea y necesita tu ayuda' : `Tus agentes se trabaron en ${agentBlockedCount} tareas y necesitan tu ayuda`}
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

          {/* 5. Más tarde: Backlog / Seguimiento / Programadas / Completadas */}
          <div ref={laterRef} className="scroll-mt-20 pt-2">
            <LaterTabs
              value={laterTab}
              onChange={setLaterTab}
              tabs={[
                { key: 'backlog', label: 'Backlog', count: allBacklog.length },
                { key: 'programadas', label: 'Programadas', count: future.length },
                // Solo si tengo agentes conectados o alguno tiene tareas (ej. tokens ya revocados).
                ...(myAgents.length > 0 || agentTasks.length > 0
                  ? [{ key: 'agentes', label: 'Agentes', count: agentOpenCount, alert: agentBlockedCount > 0 }]
                  : []),
                { key: 'seguimiento', label: 'Seguimiento', count: followedTasks.length + delegated.length, alert: seguimientoBlockedCount > 0,
                  badge: seguimientoNewCount > 0 ? `${seguimientoNewCount} ${seguimientoNewCount === 1 ? 'nueva' : 'nuevas'}` : null },
                { key: 'completadas', label: 'Completadas', count: completed.length, countLabel: completed.length ? `${completed.length} hoy` : null },
              ]}
            />

            <div className="mt-3">
              {laterTab === 'backlog' && (
                allBacklog.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 px-1 py-6 text-center">No tenés tareas pendientes fuera de tu foco.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 px-1">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Todas tus tareas fuera del foco. Destacá con la estrella lo que querés hacer hoy, o iniciala directo.</p>
                      <HowToButton topic="dashboard.backlog" />
                    </div>
                    <div className="flex items-center gap-2 px-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>Ordenar por creación:</span>
                      <div role="group" aria-label="Ordenar por fecha de creación" className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-white dark:bg-gray-800">
                        {[{ key: 'desc', label: 'Más nuevas' }, { key: 'asc', label: 'Más antiguas' }].map(o => (
                          <button key={o.key} type="button" onClick={() => setBacklogSort(o.key)} aria-pressed={backlogSort === o.key}
                            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${backlogSort === o.key
                              ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                              : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>
                            {o.label}
                          </button>
                        ))}
                      </div>
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
                                <TaskCard key={t.id} task={t} {...taskProps} />
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
                      <TaskCard key={t.id} task={t} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} future onBringToToday={handleBringToToday} onOpenComments={setCommentTask} onDelegated={handleAgentHandoff} />
                    ))}
                  </div>
                )
              )}

              {laterTab === 'agentes' && (
                <AgentTasksPanel
                  tasks={agentTasks}
                  today={workDay?.date ?? todayDate}
                  hasAgents={myAgents.length > 0}
                  onChanged={handleUpdateTask}
                  onReturned={handleAgentHandoff}
                  onOpenComments={setCommentTask}
                />
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
          onClose={handleCloseCommentTask}
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
