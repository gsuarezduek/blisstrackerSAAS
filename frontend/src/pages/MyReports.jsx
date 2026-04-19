import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import { linkify } from '../utils/linkify'
import LoadingSpinner from '../components/LoadingSpinner'
import DateRangeFilter from '../components/DateRangeFilter'
import EditDurationModal from '../components/EditDurationModal'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { fmtMins } from '../utils/format'

export default function MyReports() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [from, setFrom] = useState(() => {
    const tz = 'America/Argentina/Buenos_Aires'
    const now = new Date(); const day = now.getDay() || 7
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
    return mon.toLocaleDateString('en-CA', { timeZone: tz })
  })
  const [to, setTo] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const [expandedProject, setExpandedProject] = useState(null)
  const [editingTask, setEditingTask] = useState(null)

  async function loadReport(f = from, t = to) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (f) params.append('from', f)
      if (t) params.append('to', t)
      const { data: res } = await api.get(`/reports/mine?${params}`)
      setData(res)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadReport() }, [])

  const byProject = data?.byProject ?? []

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mis Reportes</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{user?.name}</p>
        </div>

        <DateRangeFilter
          from={from} to={to}
          onFromChange={setFrom} onToChange={setTo}
          onSearch={loadReport} loading={loading}
        />

        {/* Summary cards */}
        {data && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 text-center">
              <p className="text-2xl font-bold text-primary-600">{fmtMins(data.totalMinutes)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Tiempo total registrado</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{data.taskCount}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Tareas completadas</p>
            </div>
          </div>
        )}

        {loading && <LoadingSpinner className="py-16" />}

        {/* Projects list */}
        {!loading && byProject.length > 0 && (
          <div className="space-y-3">
            {byProject.map(p => (
              <div key={p.project.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => setExpandedProject(expandedProject === p.project.id ? null : p.project.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-800 dark:text-gray-200">{p.project.name}</span>
                    <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded px-2 py-0.5">
                      {p.taskList.length} tarea{p.taskList.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-primary-600">{fmtMins(p.minutes)}</span>
                    <span className="text-gray-400 dark:text-gray-500 text-sm">
                      {expandedProject === p.project.id ? '▲' : '▼'}
                    </span>
                  </div>
                </button>

                {/* Progress bar */}
                <div className="px-4 pb-3">
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-primary-500 h-1.5 rounded-full"
                      style={{ width: data.totalMinutes ? `${(p.minutes / data.totalMinutes) * 100}%` : '0%' }}
                    />
                  </div>
                </div>

                {/* Task list */}
                {expandedProject === p.project.id && (
                  <div className="border-t dark:border-gray-700 px-4 py-3 space-y-1.5 bg-gray-50 dark:bg-gray-800/50">
                    {p.taskList.map(task => (
                      <button
                        key={task.id}
                        onClick={() => setEditingTask(task)}
                        className="w-full flex items-start justify-between text-sm py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded px-1 transition-colors group"
                      >
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                          <span className="text-gray-700 dark:text-gray-300 text-left">{linkify(task.description)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                          {task.isOverride && <span className="text-amber-500 text-xs">✎</span>}
                          <span className="text-gray-500 dark:text-gray-400">{fmtMins(task.minutes)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && data && byProject.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-3xl mb-2">📋</p>
            <p>No hay tareas completadas en este período</p>
          </div>
        )}
      </main>

      {editingTask && (
        <EditDurationModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={() => { setEditingTask(null); loadReport() }}
        />
      )}
    </div>
  )
}
