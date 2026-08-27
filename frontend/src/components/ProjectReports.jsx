import { useState, useEffect, useMemo } from 'react'
import api from '../api/client'
import LoadingSpinner from './LoadingSpinner'
import RoleBadge from './RoleBadge'
import { linkify } from '../utils/linkify'
import { fmtMins } from '../utils/format'

// Misma clasificación de estado que Reports.jsx (deriveProjectStatus), acá aplicada
// mes a mes contra el presupuesto ACTUAL del proyecto (no versionamos monthlyHours
// por mes: el histórico compara siempre contra el valor vigente hoy).
const STATUS_META = {
  over: { label: 'Sobre presupuesto', cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' },
  near: { label: 'Cerca del límite',  cls: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800' },
}

function deriveMonthStatus(m, project) {
  const useBudget = project.hoursEnabled && project.monthlyHours != null
  const noBudget  = project.hoursEnabled && project.monthlyHours == null
  const budgetMins = useBudget ? project.monthlyHours * 60 : 0
  const pctRaw = useBudget ? (budgetMins > 0 ? (m.totalMinutes / budgetMins) * 100 : 0) : null

  let status = 'untracked'
  if (noBudget) status = 'noBudget'
  else if (useBudget) {
    if (m.totalMinutes === 0) status = 'noActivity'
    else if (pctRaw > 100) status = 'over'
    else if (pctRaw >= 80) status = 'near'
    else status = 'onTrack'
  }

  return { ...m, useBudget, noBudget, pctRaw, status }
}

export default function ProjectReports({ projectId }) {
  const [project, setProject] = useState(null)
  const [months, setMonths] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedMonth, setExpandedMonth] = useState(null)
  const [expandedUser, setExpandedUser] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    api.get(`/projects/${projectId}/reports/hours-history?months=12`)
      .then(r => { if (active) { setProject(r.data.project); setMonths(r.data.months) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId])

  const enriched = useMemo(() => project ? months.map(m => deriveMonthStatus(m, project)) : [], [months, project])
  const totals = useMemo(() => enriched.reduce((acc, m) => ({
    minutes: acc.minutes + m.totalMinutes,
    tasks: acc.tasks + m.taskCount,
  }), { minutes: 0, tasks: 0 }), [enriched])

  function toggleMonth(key) {
    setExpandedMonth(expandedMonth === key ? null : key)
    setExpandedUser(null)
  }
  function toggleUser(key) {
    setExpandedUser(expandedUser === key ? null : key)
  }

  if (loading) return <LoadingSpinner className="py-16" />

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Horas registradas y tareas completadas de este proyecto, mes a mes.
        {project?.hoursEnabled && project?.monthlyHours != null && (
          <> Comparado contra las {project.monthlyHours}h contratadas actuales (no se versiona el presupuesto por mes).</>
        )}
      </p>

      {enriched.length > 0 && (
        <div className="bg-primary-50 dark:bg-primary-900/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-primary-700 dark:text-primary-300 font-medium">Total últimos {enriched.length} meses</span>
          <div className="flex items-center gap-4">
            <span className="text-xl font-bold text-primary-700 dark:text-primary-300">{fmtMins(totals.minutes)}</span>
            <span className="text-sm text-primary-600 dark:text-primary-400">{totals.tasks} tarea{totals.tasks !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {enriched.map(m => {
          const { useBudget, noBudget, pctRaw, status } = m
          const maxMinutes = Math.max(1, ...enriched.map(x => x.totalMinutes))
          const pct = pctRaw != null ? Math.min(100, pctRaw) : (m.totalMinutes / maxMinutes) * 100
          const barColor = status === 'over' ? 'bg-red-500' : status === 'near' ? 'bg-yellow-500' : 'bg-primary-500'
          const statusBadge = STATUS_META[status]
          return (
            <div key={m.month} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={() => toggleMonth(m.month)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-gray-800 dark:text-gray-200 capitalize truncate">{m.label}</span>
                  <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded px-2 py-0.5 shrink-0">
                    {m.taskCount} tarea{m.taskCount !== 1 ? 's' : ''}
                  </span>
                  {statusBadge && (
                    <span className={`hidden md:inline text-xs rounded px-2 py-0.5 shrink-0 border ${statusBadge.cls}`}>{statusBadge.label}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <span className="font-bold text-primary-600">{fmtMins(m.totalMinutes)}</span>
                  {useBudget && (
                    <span className="hidden sm:inline text-xs text-gray-500 dark:text-gray-400">/ {project.monthlyHours}h contratadas</span>
                  )}
                  <span className="text-gray-400 dark:text-gray-500 text-sm">{expandedMonth === m.month ? '▲' : '▼'}</span>
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
                      <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    {useBudget && (
                      <div className={`text-xs text-right mt-1 ${status === 'noActivity' ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}`}>
                        {status === 'noActivity' ? 'Sin actividad este mes' : `${Math.round(pctRaw)}% de las horas contratadas`}
                      </div>
                    )}
                  </>
                )}
              </div>

              {expandedMonth === m.month && (
                <div className="border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  {m.byUser.length === 0 && (
                    <p className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">Sin tareas completadas este mes.</p>
                  )}
                  {[...m.byUser].sort((a, b) => b.minutes - a.minutes).map(u => {
                    const userKey = `${m.month}-${u.user.id}`
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
                            {[...u.taskList].sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt)).map(task => (
                              <div
                                key={task.id}
                                className="flex items-start justify-between text-sm py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                              >
                                <div className="flex items-start gap-2 flex-1 min-w-0">
                                  <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                                  <span className="text-gray-700 dark:text-gray-300 truncate text-left">{linkify(task.description)}</span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                                  {task.isOverride && <span className="text-amber-500 text-xs">✎</span>}
                                  <span className="text-gray-500 dark:text-gray-400">{fmtMins(task.minutes)}</span>
                                </div>
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
          )
        })}
      </div>

      {enriched.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">📊</p>
          <p>Todavía no hay tareas completadas en este proyecto.</p>
        </div>
      )}
    </div>
  )
}
