import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import TaskCard from '../components/TaskCard'
import AddTaskModal from '../components/AddTaskModal'
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

  const loadToday = useCallback(async () => {
    const { data } = await api.get('/workdays/today')
    const { carryOverTasks, ...wd } = data
    setWorkDay(wd)
    setCarryOver(carryOverTasks ?? [])
  }, [])

  useEffect(() => { loadToday() }, [loadToday])

  // Live clock for workday elapsed time
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
    // Si la tarea estaba en carryOver y se completó, sacarla de ahí
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

  const tasks = workDay?.tasks ?? []
  const pending    = tasks.filter(t => t.status === 'PENDING')
  const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS')
  const paused     = tasks.filter(t => t.status === 'PAUSED')
  const completed  = tasks.filter(t => t.status === 'COMPLETED')
  const hasActiveTask = inProgress.length > 0 || carryOver.some(t => t.status === 'IN_PROGRESS')

  const totalMins = completed.reduce((acc, t) => {
    if (!t.startedAt || !t.completedAt) return acc
    return acc + Math.max(0, Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000) - (t.pausedMinutes || 0))
  }, 0)

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
            <p className="text-2xl font-bold text-gray-800 dark:text-white">{tasks.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total tareas</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{completed.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Completadas</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 text-center">
            <p className="text-2xl font-bold text-indigo-600">
              {totalMins >= 60 ? `${Math.floor(totalMins/60)}h ${totalMins%60}m` : `${totalMins}m`}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Tiempo registrado</p>
          </div>
        </div>

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
          {!workDay?.endedAt && tasks.length > 0 && (
            <button
              onClick={handleFinish}
              disabled={finishing}
              className="border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium rounded-xl px-5 py-3 transition-colors disabled:opacity-50"
            >
              {finishing ? 'Finalizando...' : 'Finalizar jornada'}
            </button>
          )}
        </div>

        {/* Carry-over tasks from previous days */}
        {carryOver.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-orange-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <span>⏳</span> Pendientes de días anteriores
            </h2>
            <div className="space-y-2">
              {carryOver.map(t => (
                <TaskCard key={t.id} task={t} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} hasActiveTask={hasActiveTask} />
              ))}
            </div>
          </section>
        )}

        {/* Task lists */}
        {inProgress.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">En curso</h2>
            <div className="space-y-2">
              {inProgress.map(t => (
                <TaskCard key={t.id} task={t} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} hasActiveTask={hasActiveTask} />
              ))}
            </div>
          </section>
        )}

        {paused.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Pausadas</h2>
            <div className="space-y-2">
              {paused.map(t => (
                <TaskCard key={t.id} task={t} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} hasActiveTask={hasActiveTask} />
              ))}
            </div>
          </section>
        )}

        {pending.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Pendientes</h2>
            <div className="space-y-2">
              {pending.map(t => (
                <TaskCard key={t.id} task={t} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} hasActiveTask={hasActiveTask} />
              ))}
            </div>
          </section>
        )}

        {completed.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Completadas</h2>
            <div className="space-y-2">
              {completed.map(t => (
                <TaskCard key={t.id} task={t} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} hasActiveTask={hasActiveTask} />
              ))}
            </div>
          </section>
        )}

        {tasks.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-medium">No hay tareas por hoy</p>
            <p className="text-sm mt-1">Agregá tu primera tarea para empezar</p>
          </div>
        )}
      </main>

      {showModal && <AddTaskModal onAdd={handleAddTask} onClose={() => setShowModal(false)} />}
    </div>
  )
}
