import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import TaskCard from '../components/TaskCard'
import AddTaskModal from '../components/AddTaskModal'
import InactivityModal from '../components/InactivityModal'
import TaskCommentsModal from '../components/TaskCommentsModal'
import { useInactivity } from '../hooks/useInactivity'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

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

  const loadToday = useCallback(async () => {
    const { data } = await api.get('/workdays/today')
    const { carryOverTasks, ...wd } = data
    setWorkDay(wd)
    setCarryOver(carryOverTasks ?? [])

    const storedId = localStorage.getItem('autoPaused')
    if (storedId) {
      const taskId = Number(storedId)
      const allTasks = [...(wd.tasks ?? []), ...(carryOverTasks ?? [])]
      const task = allTasks.find(t => t.id === taskId && t.status === 'PAUSED')
      if (task) setAutoPausedTask(task)
      else localStorage.removeItem('autoPaused')
    }
  }, [])

  useEffect(() => { loadToday() }, [loadToday])

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
    setWorkDay(prev => ({ ...prev, tasks: [...prev.tasks, task] }))
  }

  function handleUpdateTask(updated) {
    if (carryOver.find(t => t.id === updated.id)) {
      if (updated.status === 'COMPLETED') {
        setCarryOver(prev => prev.filter(t => t.id !== updated.id))
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

  function handleDeleteTask(id) {
    if (carryOver.find(t => t.id === id)) {
      setCarryOver(prev => prev.filter(t => t.id !== id))
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
  }

  // Derived state
  const tasks = workDay?.tasks ?? []

  // Carry-over activos (IN_PROGRESS/PAUSED/BLOCKED sin isBacklog) se muestran en el foco normal
  // Carry-over con isBacklog=true siempre van al backlog, sin importar el status
  const carryOverActive  = useMemo(() => carryOver.filter(t => t.status !== 'PENDING' && !t.isBacklog), [carryOver])
  const carryOverPending = useMemo(() => carryOver.filter(t => t.status === 'PENDING'  || t.isBacklog),  [carryOver])

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
  const hasActiveTask = !!activeTask

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
    const completed  = focusTasks.filter(t => t.status === 'COMPLETED')
    const starred    = focusTasks.filter(t => (t.starred ?? 0) > 0 && t.status !== 'COMPLETED' && t.status !== 'IN_PROGRESS')
    const starredIds = new Set(starred.map(t => t.id))
    const paused     = focusTasks.filter(t => t.status === 'PAUSED'  && !starredIds.has(t.id))
    const blocked    = focusTasks.filter(t => t.status === 'BLOCKED' && !starredIds.has(t.id))
    const pending    = focusTasks.filter(t => t.status === 'PENDING' && !starredIds.has(t.id))
    const totalMins  = completed.reduce((acc, t) => {
      if (!t.startedAt || !t.completedAt) return acc
      return acc + Math.max(0, Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000) - (t.pausedMinutes || 0))
    }, 0)
    const activeFocusCount = focusTasks.filter(t => t.status !== 'COMPLETED').length
    return { inProgress, completed, starred, paused, blocked, pending, totalMins, activeFocusCount }
  }, [focusTasks])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 py-8">
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
          </div>
        </div>

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
                <span className="text-sm text-gray-400 animate-pulse">Generando insight del día...</span>
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
            <div className="space-y-2">
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
            <div className="space-y-2">
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
            <div className="space-y-2">
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
            <div className="space-y-2">
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
              <div className="space-y-2 mt-2">
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

        {/* 7. Completadas — historial paginado collapsible */}
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
              {completed.map(t => {
                const mins = t.minutesOverride !== null && t.minutesOverride !== undefined
                  ? t.minutesOverride
                  : Math.max(0, Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000) - (t.pausedMinutes || 0))
                return (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-green-500 flex-shrink-0 text-sm">✓</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-600 dark:text-gray-300 leading-snug truncate">{t.description}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-400 dark:text-gray-500">{t.project.name}</span>
                        {mins > 0 && (
                          <>
                            <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Historial de días anteriores */}
              {completedHistory.map(t => {
                const mins = t.minutesOverride !== null && t.minutesOverride !== undefined
                  ? t.minutesOverride
                  : Math.max(0, Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000) - (t.pausedMinutes || 0))
                const dateStr = new Date(t.completedAt).toLocaleDateString('es-AR', {
                  weekday: 'short', day: 'numeric', month: 'short',
                })
                return (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-gray-300 dark:text-gray-600 flex-shrink-0 text-sm">✓</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-500 dark:text-gray-400 leading-snug truncate">{t.description}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-400 dark:text-gray-500">{t.project.name}</span>
                        <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">{dateStr}</span>
                        {mins > 0 && (
                          <>
                            <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {completedLoading && (
                <p className="text-sm text-gray-400 text-center py-4">Cargando...</p>
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
      </main>

      {showModal && <AddTaskModal onAdd={handleAddTask} onClose={() => setShowModal(false)} alertaGTD={insight?.alertaGTD ?? null} />}

      {commentTask && (
        <TaskCommentsModal
          task={commentTask}
          onClose={() => setCommentTask(null)}
          onCommentAdded={count => handleCommentAdded(commentTask.id, count)}
          onTaskEdited={updated => { handleUpdateTask(updated); setCommentTask(updated) }}
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
