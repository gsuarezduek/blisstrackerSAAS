import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import { linkify } from '../utils/linkify'
import LoadingSpinner from '../components/LoadingSpinner'
import DateRangeFilter from '../components/DateRangeFilter'
import EditDurationModal from '../components/EditDurationModal'
import api from '../api/client'
import useRoles from '../hooks/useRoles'
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
        {data.map(d => (
          <div key={d.project.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              onClick={() => toggleProject(d.project.id)}
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-800 dark:text-gray-200">{d.project.name}</span>
                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded px-2 py-0.5">{d.taskCount} tareas</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-primary-600">{fmtMins(d.totalMinutes)}</span>
                <span className="text-gray-400 dark:text-gray-500 text-sm">{expandedProject === d.project.id ? '▲' : '▼'}</span>
              </div>
            </button>

            <div className="px-4 pb-3">
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-primary-500 h-1.5 rounded-full"
                  style={{ width: totalMins ? `${(d.totalMinutes / totalMins) * 100}%` : '0%' }}
                />
              </div>
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
        ))}
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

// ── By Person View ─────────────────────────────────────────────────────────────

function ByPersonView({ data, loading, onEditTask }) {
  const { labelFor } = useRoles()
  const [expandedUser, setExpandedUser] = useState(null)
  const [expandedProject, setExpandedProject] = useState(null)
  const totalMins = data.reduce((s, d) => s + d.totalMinutes, 0)

  function toggleUser(id) {
    setExpandedUser(expandedUser === id ? null : id)
    setExpandedProject(null)
  }

  function toggleProject(key) {
    setExpandedProject(expandedProject === key ? null : key)
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
        {data.map(d => (
          <div key={d.user.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              onClick={() => toggleUser(d.user.id)}
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-800 dark:text-gray-200">{d.user.name}</span>
                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded px-2 py-0.5">
                  {labelFor(d.user.role)}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{d.taskCount} tarea{d.taskCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-primary-600">{fmtMins(d.totalMinutes)}</span>
                <span className="text-gray-400 dark:text-gray-500 text-sm">{expandedUser === d.user.id ? '▲' : '▼'}</span>
              </div>
            </button>

            <div className="px-4 pb-3">
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-primary-500 h-1.5 rounded-full"
                  style={{ width: totalMins ? `${(d.totalMinutes / totalMins) * 100}%` : '0%' }}
                />
              </div>
            </div>

            {expandedUser === d.user.id && (
              <div className="border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                {d.byProject.sort((a, b) => b.minutes - a.minutes).map(proj => {
                  const projKey = `${d.user.id}-${proj.project.id}`
                  return (
                    <div key={proj.project.id} className="border-b dark:border-gray-700 last:border-b-0">
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm"
                        onClick={() => toggleProject(projKey)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{proj.project.name}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{proj.taskList.length} tarea{proj.taskList.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600 dark:text-gray-400">{fmtMins(proj.minutes)}</span>
                          <span className="text-gray-400 dark:text-gray-500 text-xs">{expandedProject === projKey ? '▲' : '▼'}</span>
                        </div>
                      </button>
                      {expandedProject === projKey && (
                        <div className="px-4 pb-3 space-y-1.5 bg-white dark:bg-gray-800">
                          {proj.taskList.sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt)).map(task => (
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
        ))}
      </div>

      {data.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">👤</p>
          <p>No hay datos para el período seleccionado</p>
        </div>
      )}
    </>
  )
}

// ── Main Reports page ──────────────────────────────────────────────────────────

export default function Reports() {
  const { labelFor } = useRoles()
  const [view, setView] = useState('project') // 'project' | 'person'
  const [projectData, setProjectData] = useState([])
  const [personData, setPersonData] = useState([])
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
      const [proj, person] = await Promise.all([
        api.get(`/reports/by-project?${params}`),
        api.get(`/reports/by-user-summary?${params}`),
      ])
      setProjectData(proj.data.sort((a, b) => b.totalMinutes - a.totalMinutes))
      setPersonData(person.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadReport() }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Reportes</h1>

        <DateRangeFilter
          from={from} to={to}
          onFromChange={setFrom} onToChange={setTo}
          onSearch={loadReport} loading={loading}
        />

        {/* View toggle */}
        <div className="flex gap-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-1 mb-6 w-fit">
          <button
            onClick={() => setView('project')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === 'project' ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Por proyecto
          </button>
          <button
            onClick={() => setView('person')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === 'person' ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Por persona
          </button>
        </div>

        {view === 'project'
          ? <ByProjectView data={projectData} loading={loading} onEditTask={setEditingTask} />
          : <ByPersonView data={personData} loading={loading} onEditTask={setEditingTask} />
        }
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
