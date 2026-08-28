import { useState, useEffect, useMemo, useRef } from 'react'
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

// ─── Gráfico de líneas: horas por mes ──────────────────────────────────────────

const MONTH_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function shortMonthLabel(monthStr, idx) {
  const [y, m] = monthStr.split('-').map(Number)
  const name = MONTH_ABBR[m - 1]
  return m === 1 || idx === 0 ? `${name} '${String(y).slice(2)}` : name
}

// "Número lindo" >= value, de la familia 1/2/2.5/5/10 × 10^n — evita ticks del eje Y
// con decimales feos (ej. de un máximo de 37h no queremos ticks en 12.33/24.66).
function niceMax(value) {
  const v = Math.max(value, 1)
  const magnitude = Math.pow(10, Math.floor(Math.log10(v)))
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude
    if (candidate >= v) return candidate
  }
  return 10 * magnitude
}

function fmtHours(h) {
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`
}

const CHART_W = 640
const CHART_H = 220
const MARGIN = { top: 20, right: 16, bottom: 26, left: 34 }
const PLOT_W = CHART_W - MARGIN.left - MARGIN.right
const PLOT_H = CHART_H - MARGIN.top - MARGIN.bottom

// Horas por mes de UN proyecto — línea única (job: tendencia en el tiempo), sin
// necesidad de leyenda (un solo color). Línea de referencia punteada para el
// presupuesto mensual cuando está configurado. Hover/foco muestran un tooltip
// nativo en SVG; la lista de meses de abajo ya funciona como la vista de tabla.
function HoursLineChart({ points, project }) {
  const [activeIdx, setActiveIdx] = useState(null)
  const svgRef = useRef(null)

  const n = points.length
  const hoursByMonth = points.map(p => p.totalMinutes / 60)
  const useBudget = project?.hoursEnabled && project?.monthlyHours != null
  const budgetHours = useBudget ? project.monthlyHours : null
  const maxVal = niceMax(Math.max(...hoursByMonth, budgetHours || 0))

  const x = i => n === 1 ? MARGIN.left + PLOT_W / 2 : MARGIN.left + (i / (n - 1)) * PLOT_W
  const y = h => MARGIN.top + PLOT_H - (h / maxVal) * PLOT_H

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(hoursByMonth[i]).toFixed(1)}`).join(' ')
  const yTicks = [0, maxVal / 2, maxVal]
  const labelStep = n <= 6 ? 1 : Math.ceil(n / 6)

  function handlePointerMove(e) {
    const svg = svgRef.current
    if (!svg || n === 0) return
    const rect = svg.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * CHART_W
    let nearest = 0
    let best = Infinity
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - relX)
      if (d < best) { best = d; nearest = i }
    }
    setActiveIdx(nearest)
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); setActiveIdx(i => Math.min(n - 1, (i ?? n - 1) + 1)) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setActiveIdx(i => Math.max(0, (i ?? n - 1) - 1)) }
    else if (e.key === 'Escape') { setActiveIdx(null) }
  }

  const lastIdx = n - 1
  const active = activeIdx != null ? points[activeIdx] : null

  // Tooltip: caja angosta anclada al punto activo, recortada para no salirse del viewBox.
  const tooltipW = 92
  const tooltipX = active ? Math.min(Math.max(x(activeIdx) - tooltipW / 2, MARGIN.left), CHART_W - MARGIN.right - tooltipW) : 0
  const tooltipY = active ? Math.max(y(hoursByMonth[activeIdx]) - 52, MARGIN.top) : 0

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Horas por mes</p>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full h-auto touch-none"
        role="img"
        aria-label={`Horas trabajadas por mes: de ${fmtHours(hoursByMonth[0])} en ${points[0].label} a ${fmtHours(hoursByMonth[lastIdx])} en ${points[lastIdx].label}`}
        tabIndex={0}
        onMouseMove={handlePointerMove}
        onMouseLeave={() => setActiveIdx(null)}
        onFocus={() => setActiveIdx(idx => idx ?? lastIdx)}
        onBlur={() => setActiveIdx(null)}
        onKeyDown={handleKeyDown}
      >
        {/* Gridlines horizontales (hairline, recesivas) + ticks del eje Y */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={MARGIN.left} x2={CHART_W - MARGIN.right} y1={y(t)} y2={y(t)} className="stroke-gray-100 dark:stroke-gray-700" strokeWidth={1} />
            <text x={MARGIN.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-gray-400 dark:fill-gray-500" fontSize={10}>
              {fmtHours(Number(t.toFixed(1)))}
            </text>
          </g>
        ))}

        {/* Referencia de presupuesto mensual (punteada — a propósito distinta de las gridlines sólidas) */}
        {useBudget && budgetHours <= maxVal && (
          <g>
            <line
              x1={MARGIN.left} x2={CHART_W - MARGIN.right} y1={y(budgetHours)} y2={y(budgetHours)}
              className="stroke-gray-400 dark:stroke-gray-500" strokeWidth={1} strokeDasharray="4 3"
            />
            <text x={CHART_W - MARGIN.right} y={y(budgetHours) - 4} textAnchor="end" className="fill-gray-400 dark:fill-gray-500" fontSize={10}>
              {budgetHours}h contratadas
            </text>
          </g>
        )}

        {/* Etiquetas del eje X */}
        {points.map((p, i) => (
          (i % labelStep === 0 || i === lastIdx) && (
            <text key={p.month} x={x(i)} y={CHART_H - 6} textAnchor="middle" className="fill-gray-400 dark:fill-gray-500" fontSize={10}>
              {shortMonthLabel(p.month, i)}
            </text>
          )
        ))}

        {/* Línea de horas (serie única: un solo hue, sin leyenda) */}
        <path d={linePath} fill="none" className="stroke-primary-500 dark:stroke-primary-400" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Punto final destacado, con anillo en el color de superficie y valor directo al lado */}
        <circle cx={x(lastIdx)} cy={y(hoursByMonth[lastIdx])} r={6} className="fill-white dark:fill-gray-800" />
        <circle cx={x(lastIdx)} cy={y(hoursByMonth[lastIdx])} r={4} className="fill-primary-600 dark:fill-primary-400" />
        <text
          x={x(lastIdx) - 8} y={y(hoursByMonth[lastIdx]) - 10} textAnchor="end"
          className="fill-primary-700 dark:fill-primary-300 font-semibold" fontSize={11}
        >
          {fmtHours(Number(hoursByMonth[lastIdx].toFixed(1)))}
        </text>

        {/* Crosshair + punto activo (hover/foco por teclado) */}
        {active && (
          <g>
            <line x1={x(activeIdx)} x2={x(activeIdx)} y1={MARGIN.top} y2={CHART_H - MARGIN.bottom} className="stroke-gray-300 dark:stroke-gray-600" strokeWidth={1} />
            <circle cx={x(activeIdx)} cy={y(hoursByMonth[activeIdx])} r={6} className="fill-white dark:fill-gray-800" />
            <circle cx={x(activeIdx)} cy={y(hoursByMonth[activeIdx])} r={4} className="fill-primary-600 dark:fill-primary-400" />

            <g transform={`translate(${tooltipX}, ${tooltipY})`}>
              <rect width={tooltipW} height={40} rx={6} className="fill-gray-800 dark:fill-gray-900" opacity={0.95} />
              <text x={8} y={16} className="fill-white font-semibold" fontSize={12}>{fmtHours(Number(hoursByMonth[activeIdx].toFixed(1)))}</text>
              <text x={8} y={30} className="fill-gray-300" fontSize={9}>
                {active.label} · {active.taskCount} tarea{active.taskCount !== 1 ? 's' : ''}
              </text>
            </g>
          </g>
        )}
      </svg>
    </div>
  )
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
  // El backend devuelve los meses más reciente primero; el gráfico los quiere en
  // orden cronológico (más viejo → más nuevo, izquierda a derecha).
  const chartPoints = useMemo(() => [...enriched].reverse(), [enriched])

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
      {chartPoints.length >= 2 && <HoursLineChart points={chartPoints} project={project} />}

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
