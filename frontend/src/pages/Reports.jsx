import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import DateRangeFilter from '../components/DateRangeFilter'
import api from '../api/client'
import useRoles from '../hooks/useRoles'

function fmtMins(mins) {
  if (!mins || mins === 0) return '0m'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}


// ── By Project View ────────────────────────────────────────────────────────────

function ByProjectView({ data, loading }) {
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

  if (loading) return <div className="text-center py-16 text-gray-400">Cargando...</div>

  return (
    <>
      {totalMins > 0 && (
        <div className="bg-indigo-50 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
          <span className="text-sm text-indigo-700 font-medium">Tiempo total registrado</span>
          <span className="text-xl font-bold text-indigo-700">{fmtMins(totalMins)}</span>
        </div>
      )}

      <div className="space-y-3">
        {data.map(d => (
          <div key={d.project.id} className="bg-white border rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              onClick={() => toggleProject(d.project.id)}
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-800">{d.project.name}</span>
                <span className="text-xs bg-gray-100 text-gray-500 rounded px-2 py-0.5">{d.taskCount} tareas</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-primary-600">{fmtMins(d.totalMinutes)}</span>
                <span className="text-gray-400 text-sm">{expandedProject === d.project.id ? '▲' : '▼'}</span>
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
              <div className="border-t bg-gray-50">
                {d.byUser.sort((a, b) => b.minutes - a.minutes).map(u => {
                  const userKey = `${d.project.id}-${u.user.id}`
                  return (
                    <div key={u.user.id} className="border-b last:border-b-0">
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 transition-colors text-sm"
                        onClick={() => toggleUser(userKey)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-700">{u.user.name}</span>
                          <span className="text-xs text-gray-400">{u.tasks} tarea{u.tasks !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">{fmtMins(u.minutes)}</span>
                          <span className="text-gray-400 text-xs">{expandedUser === userKey ? '▲' : '▼'}</span>
                        </div>
                      </button>
                      {expandedUser === userKey && (
                        <div className="px-4 pb-3 space-y-1.5 bg-white">
                          {u.taskList.sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt)).map(task => (
                            <div key={task.id} className="flex items-start justify-between text-sm py-1.5 border-b border-gray-100 last:border-b-0">
                              <div className="flex items-start gap-2 flex-1 min-w-0">
                                <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                                <span className="text-gray-700 truncate">{task.description}</span>
                              </div>
                              <span className="text-gray-500 flex-shrink-0 ml-3">{fmtMins(task.minutes)}</span>
                            </div>
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

function ByPersonView({ data, loading }) {
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

  if (loading) return <div className="text-center py-16 text-gray-400">Cargando...</div>

  return (
    <>
      {totalMins > 0 && (
        <div className="bg-indigo-50 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
          <span className="text-sm text-indigo-700 font-medium">Tiempo total registrado</span>
          <span className="text-xl font-bold text-indigo-700">{fmtMins(totalMins)}</span>
        </div>
      )}

      <div className="space-y-3">
        {data.map(d => (
          <div key={d.user.id} className="bg-white border rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              onClick={() => toggleUser(d.user.id)}
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-800">{d.user.name}</span>
                <span className="text-xs bg-gray-100 text-gray-500 rounded px-2 py-0.5">
                  {labelFor(d.user.role)}
                </span>
                <span className="text-xs text-gray-400">{d.taskCount} tarea{d.taskCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-primary-600">{fmtMins(d.totalMinutes)}</span>
                <span className="text-gray-400 text-sm">{expandedUser === d.user.id ? '▲' : '▼'}</span>
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
              <div className="border-t bg-gray-50">
                {d.byProject.sort((a, b) => b.minutes - a.minutes).map(proj => {
                  const projKey = `${d.user.id}-${proj.project.id}`
                  return (
                    <div key={proj.project.id} className="border-b last:border-b-0">
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 transition-colors text-sm"
                        onClick={() => toggleProject(projKey)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-700">{proj.project.name}</span>
                          <span className="text-xs text-gray-400">{proj.taskList.length} tarea{proj.taskList.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">{fmtMins(proj.minutes)}</span>
                          <span className="text-gray-400 text-xs">{expandedProject === projKey ? '▲' : '▼'}</span>
                        </div>
                      </button>
                      {expandedProject === projKey && (
                        <div className="px-4 pb-3 space-y-1.5 bg-white">
                          {proj.taskList.sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt)).map(task => (
                            <div key={task.id} className="flex items-start justify-between text-sm py-1.5 border-b border-gray-100 last:border-b-0">
                              <div className="flex items-start gap-2 flex-1 min-w-0">
                                <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                                <span className="text-gray-700 truncate">{task.description}</span>
                              </div>
                              <span className="text-gray-500 flex-shrink-0 ml-3">{fmtMins(task.minutes)}</span>
                            </div>
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
  const [from, setFrom] = useState(() => {
    const now = new Date(); const day = now.getDay() || 7
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
    return mon.toLocaleDateString('en-CA')
  })
  const [to, setTo] = useState(() => new Date().toLocaleDateString('en-CA'))

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
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Reportes</h1>

        <DateRangeFilter
          from={from} to={to}
          onFromChange={setFrom} onToChange={setTo}
          onSearch={loadReport} loading={loading}
        />

        {/* View toggle */}
        <div className="flex gap-1 bg-white border rounded-xl p-1 mb-6 w-fit">
          <button
            onClick={() => setView('project')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === 'project' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Por proyecto
          </button>
          <button
            onClick={() => setView('person')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === 'person' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Por persona
          </button>
        </div>

        {view === 'project'
          ? <ByProjectView data={projectData} loading={loading} />
          : <ByPersonView data={personData} loading={loading} />
        }
      </main>
    </div>
  )
}
