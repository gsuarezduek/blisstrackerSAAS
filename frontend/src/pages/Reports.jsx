import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { linkify } from '../utils/linkify'
import LoadingSpinner from '../components/LoadingSpinner'
import DateRangeFilter from '../components/DateRangeFilter'
import EditDurationModal from '../components/EditDurationModal'
import RoleBadge from '../components/RoleBadge'
import api from '../api/client'
import { fmtMins } from '../utils/format'

// ── Estado de presupuesto por proyecto ─────────────────────────────────────────
// Deriva, a partir de hoursEnabled/monthlyHours/totalMinutes, una única categoría
// por proyecto. Se usa tanto para los chips de resumen como para el filtro y el
// color de la barra de cada fila.
const STATUS_META = {
  over:       { label: 'Sobre presupuesto',          cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' },
  near:       { label: 'Cerca del límite',            cls: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800' },
  noActivity: { label: 'Sin actividad',               cls: 'bg-gray-200 text-gray-600 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600' },
  noBudget:   { label: 'Sin presupuesto configurado', cls: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700' },
}

function deriveProjectStatus(d) {
  const hoursEnabled = d.project.hoursEnabled
  const monthlyHours = d.project.monthlyHours
  const useBudget = hoursEnabled && monthlyHours != null
  const noBudget  = hoursEnabled && monthlyHours == null
  const budgetMins = useBudget ? monthlyHours * 60 : 0
  const pctRaw = useBudget ? (budgetMins > 0 ? (d.totalMinutes / budgetMins) * 100 : 0) : null

  let status = 'untracked' // hoursEnabled=false: proyecto fuera del seguimiento de presupuesto
  if (noBudget) status = 'noBudget'
  else if (useBudget) {
    if (d.totalMinutes === 0) status = 'noActivity'
    else if (pctRaw > 100) status = 'over'
    else if (pctRaw >= 80) status = 'near'
    else status = 'onTrack'
  }

  return { ...d, useBudget, noBudget, pctRaw, status }
}

function exportCsv(rows) {
  const header = 'proyecto,horas contratadas,horas registradas,% usado,tareas,estado'
  const csvRows = rows.map(d => {
    const contracted = d.useBudget ? d.project.monthlyHours : ''
    const pctLabel = d.useBudget ? `${Math.round(d.pctRaw)}%` : ''
    const statusLabel = STATUS_META[d.status]?.label ?? (d.status === 'onTrack' ? 'En curso' : 'Sin seguimiento')
    return [
      `"${d.project.name}"`,
      contracted,
      (d.totalMinutes / 60).toFixed(1),
      pctLabel,
      d.taskCount,
      `"${statusLabel}"`,
    ].join(',')
  })
  const csv = [header, ...csvRows].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `reportes-proyectos-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// ── By Project View ────────────────────────────────────────────────────────────

function ByProjectView({ data, sortBy, search, statusFilter, loading, onEditTask }) {
  const [expandedProject, setExpandedProject] = useState(null)
  const [expandedUser, setExpandedUser] = useState(null)

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data.filter(d => d.project.name.toLowerCase().includes(q))
  }, [data, search])

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return searched
    return searched.filter(d => d.status === statusFilter)
  }, [searched, statusFilter])

  const totalMins = filtered.reduce((s, d) => s + d.totalMinutes, 0)

  const sorted = useMemo(() => {
    const arr = [...filtered]
    if (sortBy === 'contracted') {
      arr.sort((a, b) => (b.useBudget ? b.project.monthlyHours : -1) - (a.useBudget ? a.project.monthlyHours : -1) || b.totalMinutes - a.totalMinutes)
    } else if (sortBy === 'pct') {
      arr.sort((a, b) => (b.pctRaw ?? -1) - (a.pctRaw ?? -1) || b.totalMinutes - a.totalMinutes)
    } else {
      arr.sort((a, b) => b.totalMinutes - a.totalMinutes)
    }
    return arr
  }, [filtered, sortBy])

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
      {sorted.length > 0 && (
        <div className="bg-primary-50 dark:bg-primary-900/20 rounded-xl px-4 py-3 mb-5 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-primary-700 dark:text-primary-300 font-medium">Tiempo total registrado</span>
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-primary-700 dark:text-primary-300">{fmtMins(totalMins)}</span>
            <button
              onClick={() => exportCsv(sorted)}
              className="text-xs bg-white dark:bg-gray-800 border border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 rounded-lg px-2.5 py-1 font-medium hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
            >
              ⬇ Exportar CSV
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {sorted.map(d => {
          const { useBudget, noBudget, pctRaw, status } = d
          const pct = pctRaw != null ? Math.min(100, pctRaw) : (totalMins > 0 ? (d.totalMinutes / totalMins) * 100 : 0)
          const barColor = status === 'over' ? 'bg-red-500' : status === 'near' ? 'bg-yellow-500' : 'bg-primary-500'
          const statusBadge = STATUS_META[status]
          return (
          <div key={d.project.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              onClick={() => toggleProject(d.project.id)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-gray-800 dark:text-gray-200 truncate">{d.project.name}</span>
                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded px-2 py-0.5 shrink-0">{d.taskCount} tareas</span>
                {statusBadge && (status === 'over' || status === 'near' || status === 'noActivity') && (
                  <span className={`hidden md:inline text-xs rounded px-2 py-0.5 shrink-0 border ${statusBadge.cls}`}>{statusBadge.label}</span>
                )}
              </div>
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <span className="font-bold text-primary-600">{fmtMins(d.totalMinutes)}</span>
                {useBudget && (
                  <span className="hidden sm:inline text-xs text-gray-500 dark:text-gray-400">/ {d.project.monthlyHours}h contratadas</span>
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
                      className={`h-1.5 rounded-full ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {useBudget && (
                    <div className={`text-xs text-right mt-1 ${status === 'noActivity' ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}`}>
                      {status === 'noActivity' ? 'Sin actividad en este período' : `${Math.round(pctRaw)}% de las horas contratadas`}
                    </div>
                  )}
                </>
              )}
            </div>

            {expandedProject === d.project.id && (
              <div className="border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                {d.byUser.length === 0 && (
                  <p className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">Sin tareas completadas en este período.</p>
                )}
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
                          <RoleBadge userId={u.user.id} />
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

      {sorted.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">📊</p>
          <p>{data.length === 0 ? 'No hay datos para el período seleccionado' : 'Ningún proyecto coincide con los filtros'}</p>
        </div>
      )}
    </>
  )
}

// ── Main Reports page ──────────────────────────────────────────────────────────

function defaultFrom() {
  const tz = 'America/Argentina/Buenos_Aires'
  const now = new Date(); const day = now.getDay() || 7
  const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
  return mon.toLocaleDateString('en-CA', { timeZone: tz })
}
function defaultTo() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [projectData, setProjectData] = useState([])
  const [sortBy, setSortBy] = useState(() => searchParams.get('sort') || 'used')
  const [search, setSearch] = useState(() => searchParams.get('q') || '')
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || 'all')
  const [loading, setLoading] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [from, setFrom] = useState(() => searchParams.get('from') || defaultFrom())
  const [to, setTo] = useState(() => searchParams.get('to') || defaultTo())

  async function loadReport(f = from, t = to) {
    setLoading(true)
    const params = new URLSearchParams()
    if (f) params.append('from', f)
    if (t) params.append('to', t)
    try {
      const { data } = await api.get(`/reports/by-project?${params}`)
      const projects = Array.isArray(data) ? data : data.projects
      setProjectData(projects)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadReport() }, [])

  // Refleja el estado de los filtros en la URL (sin ensuciar el historial) para
  // poder recargar, compartir o volver atrás sin perder búsqueda/orden/rango.
  useEffect(() => {
    const next = {}
    if (search) next.q = search
    if (sortBy !== 'used') next.sort = sortBy
    if (statusFilter !== 'all') next.status = statusFilter
    if (from) next.from = from
    if (to) next.to = to
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sortBy, statusFilter, from, to])

  const enriched = useMemo(() => projectData.map(deriveProjectStatus), [projectData])
  const hasBudgetTracking = enriched.some(d => d.project.hoursEnabled)
  const counts = useMemo(() => {
    const c = { over: 0, near: 0, noActivity: 0, noBudget: 0 }
    for (const d of enriched) if (c[d.status] !== undefined) c[d.status] += 1
    return c
  }, [enriched])

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

        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="relative w-full sm:w-64">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar proyecto..."
              className="w-full text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg pl-8 pr-8 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm"
                aria-label="Limpiar búsqueda"
              >
                ✕
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Ordenar por</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="used">Más horas usadas</option>
              <option value="contracted">Más horas contratadas</option>
              <option value="pct">Mayor % usado</option>
            </select>
          </div>
        </div>

        {hasBudgetTracking && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setStatusFilter('all')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                statusFilter === 'all'
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-400'
              }`}
            >
              Todos ({enriched.length})
            </button>
            {Object.entries(STATUS_META).map(([key, meta]) => counts[key] > 0 && (
              <button
                key={key}
                onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                  statusFilter === key ? meta.cls : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-400'
                }`}
              >
                {meta.label} ({counts[key]})
              </button>
            ))}
          </div>
        )}

        <ByProjectView data={enriched} sortBy={sortBy} search={search} statusFilter={statusFilter} loading={loading} onEditTask={setEditingTask} />
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
