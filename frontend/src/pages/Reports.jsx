import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import { linkify } from '../utils/linkify'
import LoadingSpinner from '../components/LoadingSpinner'
import DateRangeFilter from '../components/DateRangeFilter'
import EditDurationModal from '../components/EditDurationModal'
import api from '../api/client'
import { fmtMins } from '../utils/format'

// ── By Project View ────────────────────────────────────────────────────────────

function ByProjectView({ data, loading, onEditTask }) {
  const [expandedProject, setExpandedProject] = useState(null)
  const [expandedUser, setExpandedUser] = useState(null)
  const totalMins = data.reduce((s, d) => s + d.totalMinutes, 0)

  function toggleProject(id) {
    setExpandedProject(expandedProject === id ? null : id)
    setExpandedUser(null)
  }

  function toggleUser(key) {
    setExpandedUser(expandedUser === key ? null : key)
  }

  if (loading) return <LoadingSpinner className="py-16" />

  return (
    <>
      {totalMins > 0 && (
        <div className="bg-primary-50 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
          <span className="text-sm text-primary-700 font-medium">Tiempo total registrado</span>
          <span className="text-xl font-bold text-primary-700">{fmtMins(totalMins)}</span>
        </div>
      )}

      <div className="space-y-3">
        {data.map(d => {
          const hoursEnabled = d.project.hoursEnabled
          const monthlyHours = d.project.monthlyHours
          const useBudget    = hoursEnabled && monthlyHours != null
          const noBudget     = hoursEnabled && monthlyHours == null
          // Presupuesto = 100% de las horas contratadas del mes (sin ponderar por días transcurridos)
          const budgetMins   = useBudget ? monthlyHours * 60 : 0
          const pctRaw       = useBudget
            ? (budgetMins > 0 ? (d.totalMinutes / budgetMins) * 100 : 0)
            : (totalMins   > 0 ? (d.totalMinutes / totalMins)   * 100 : 0)
          const pct          = Math.min(100, pctRaw)
          const overBudget   = useBudget && pctRaw > 100
          return (
          <div key={d.project.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              onClick={() => toggleProject(d.project.id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-medium text-gray-800 dark:text-gray-200 truncate">{d.project.name}</span>
                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded px-2 py-0.5 shrink-0">{d.taskCount} tareas</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <span className="font-bold text-primary-600">{fmtMins(d.totalMinutes)}</span>
                {useBudget && (
                  <span className="hidden sm:inline text-xs text-gray-500 dark:text-gray-400">/ {monthlyHours}h contratadas</span>
                )}
                <span className="text-gray-400 dark:text-gray-500 text-sm">{expandedProject === d.project.id ? '▲' : '▼'}</span>
              </div>
            </button>

            <div className="px-4 pb-3">
              {noBudget ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5" />
                  <span className="text-xs text-gray-400 dark:text-gray-500">Sin presupuesto</span>
                </div>
              ) : (
                <>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${overBudget ? 'bg-red-500' : 'bg-primary-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {useBudget && (
                    <div className="text-xs text-right mt-1 text-gray-500 dark:text-gray-400">
                      {Math.round(pctRaw)}% de las horas contratadas
                    </div>
                  )}
                </>
              )}
            </div>

            {expandedProject === d.project.id && (
              <div className="border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                {d.byUser.sort((a, b) => b.minutes - a.minutes).map(u => {
                  const userKey = `${d.project.id}-${u.user.id}`
                  return (
                    <div key={u.user.id} className="border-b dark:border-gray-700 last:border-b-0">
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm"
                        onClick={() => toggleUser(userKey)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{u.user.name}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{u.tasks} tarea{u.tasks !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600 dark:text-gray-400">{fmtMins(u.minutes)}</span>
                          <span className="text-gray-400 dark:text-gray-500 text-xs">{expandedUser === userKey ? '▲' : '▼'}</span>
                        </div>
                      </button>
                      {expandedUser === userKey && (
                        <div className="px-4 pb-3 space-y-1.5 bg-white dark:bg-gray-800">
                          {u.taskList.sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt)).map(task => (
                            <button
                              key={task.id}
                              onClick={() => onEditTask(task)}
                              className="w-full flex items-start justify-between text-sm py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded px-1 transition-colors group"
                            >
                              <div className="flex items-start gap-2 flex-1 min-w-0">
                                <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                                <span className="text-gray-700 dark:text-gray-300 truncate text-left">{linkify(task.description)}</span>
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
                  )
                })}
              </div>
            )}
          </div>
          )
        })}
      </div>

      {data.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">📊</p>
          <p>No hay datos para el período seleccionado</p>
        </div>
      )}
    </>
  )
}

// ── Main Reports page ──────────────────────────────────────────────────────────

export default function Reports() {
  const [projectData, setProjectData] = useState([])
  const [loading, setLoading] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [from, setFrom] = useState(() => {
    const tz = 'America/Argentina/Buenos_Aires'
    const now = new Date(); const day = now.getDay() || 7
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
    return mon.toLocaleDateString('en-CA', { timeZone: tz })
  })
  const [to, setTo] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }))

  async function loadReport(f = from, t = to) {
    setLoading(true)
    const params = new URLSearchParams()
    if (f) params.append('from', f)
    if (t) params.append('to', t)
    try {
      const { data } = await api.get(`/reports/by-project?${params}`)
      const projects = Array.isArray(data) ? data : data.projects
      setProjectData(projects.sort((a, b) => b.totalMinutes - a.totalMinutes))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadReport() }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Reportes</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Horas registradas por proyecto frente al 100% de las horas contratadas del mes.</p>

        <DateRangeFilter
          from={from} to={to}
          onFromChange={setFrom} onToChange={setTo}
          onSearch={loadReport} loading={loading}
          compact
        />

        <ByProjectView data={projectData} loading={loading} onEditTask={setEditingTask} />
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
