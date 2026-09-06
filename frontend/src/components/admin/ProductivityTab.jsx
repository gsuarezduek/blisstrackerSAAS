import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import { avatarUrl } from '../../utils/avatarUrl'
import { linkify } from '../../utils/linkify'
import ProductivityPeriodLabel from './ProductivityPeriodLabel'
import RoleBadge from '../RoleBadge'
import UserLink from '../UserLink'

// Selector de modo de período (aplica a ambas vistas).
export function ModeToggle({ mode, onChange }) {
  const opts = [['current', 'Mes en curso'], ['closed', 'Mes cerrado']]
  return (
    <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-50 dark:bg-gray-800">
      {opts.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            mode === key
              ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// Encabezado de la sección: Δ horas del equipo (promedio simple de la utilización por persona).
function TeamHoursHeadline({ teamHours, loading }) {
  if (loading && !teamHours) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Δ horas del equipo: <span className="animate-pulse">…</span></p>
  }
  const pct = teamHours && teamHours.utilizationWeighted != null ? Math.round(teamHours.utilizationWeighted * 100) : null
  if (pct == null) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
        Δ horas del equipo: <span className="text-gray-400 dark:text-gray-500">— configurá horario (inicio y fin) por persona</span>
      </p>
    )
  }
  const cls = pct < 50 ? 'text-amber-600 dark:text-amber-400' : pct >= 100 ? 'text-green-600 dark:text-green-400' : 'text-primary-600 dark:text-primary-400'
  return (
    <div className="mt-1 flex items-baseline gap-2 flex-wrap">
      <span className="text-sm text-gray-500 dark:text-gray-400">Δ horas del equipo</span>
      <span className={`text-2xl font-bold tabular-nums leading-none ${cls}`}>{pct}%</span>
      <span className="text-xs text-gray-400 dark:text-gray-500">
        {fmtHours(teamHours.totalRegistered)} reg / {fmtHours(teamHours.totalAvailable)} disp · {teamHours.nWithSchedule} de {teamHours.nTotal} con horario
      </span>
    </div>
  )
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60)    return 'hace un momento'
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  const days = Math.floor(diff / 86400)
  if (days === 1)   return 'ayer'
  if (days < 7)     return `hace ${days} días`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

const fmtHours = h => (h >= 1 ? `${h}h` : h > 0 ? `${Math.round(h * 60)}m` : '—')

const STATUS = {
  inactive: { label: 'inactivo',  cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
  down:     { label: '↓ baja',    cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
  stuck:    { label: 'atascos',   cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
  up:       { label: '↑ alta',    cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
  ok:       { label: 'OK',        cls: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' },
  nodata:   { label: 'sin datos', cls: 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500' },
}

const PRIORITY = { inactive: 0, down: 1, stuck: 2, ok: 3, up: 4, nodata: 5 }

// Celda "Δ horas" de la tabla: utilización (horas registradas ÷ disponibles) en %, con marca vs equipo.
function UtilCell({ value, median }) {
  if (value === null || value === undefined) return <span className="text-gray-300 dark:text-gray-600">—</span>
  const pct = Math.round(value * 100)
  const cls = pct < 50 ? 'text-amber-600 dark:text-amber-400' : pct >= 100 ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'
  return <span className={`tabular-nums font-medium ${cls}`}>{pct}%<VsTeam value={value} median={median} /></span>
}

// Indicador "vs equipo" (mediana). higherBetter define si estar arriba es bueno.
function VsTeam({ value, median, higherBetter = true }) {
  if (median === null || median === undefined) return null
  const diff = value - median
  const eps = Math.max(0.05, Math.abs(median) * 0.05) // ignora diferencias <5%
  if (Math.abs(diff) <= eps) return <span className="text-[10px] text-gray-400 ml-1">≈</span>
  const above = diff > 0
  const good = higherBetter ? above : !above
  return (
    <span className={`text-[10px] ml-1 ${good ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
      {above ? '▲' : '▼'}
    </span>
  )
}

// Celda compacta de asistencia: presencia + badge de tardanzas.
function AttendanceCell({ att }) {
  if (!att || att.expectedDays === 0) return <span className="text-gray-300 dark:text-gray-600">—</span>
  const { daysPresent, expectedDays, absentDays, lateDays } = att
  const color = absentDays === 0
    ? 'text-gray-700 dark:text-gray-300'
    : absentDays <= 1 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`tabular-nums ${color}`} title={`${daysPresent} de ${expectedDays} días hábiles esperados`}>{daysPresent}/{expectedDays}</span>
      {lateDays > 0 && (
        <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" title="Tardanzas en el período">⏰{lateDays}</span>
      )}
    </span>
  )
}

// Bloque detallado "Horas y Asistencia" (fila expandida): Δ horas + disponibles/registradas + presencia + tardanzas.
function HoursAttendanceBlock({ att }) {
  if (!att) return <p className="text-xs text-gray-400 dark:text-gray-500 italic">Sin datos de asistencia.</p>
  const { businessDays, daysPresent, expectedDays, leaveDays, absentDays, lateDays, hasSchedule, availableHours, registeredHours, utilization } = att
  const utilPct = utilization != null ? Math.round(utilization * 100) : null
  const utilCls = utilPct == null ? '' : utilPct < 50 ? 'text-amber-600 dark:text-amber-400' : utilPct >= 100 ? 'text-green-600 dark:text-green-400' : 'text-gray-800 dark:text-gray-100'
  return (
    <ul className="text-sm space-y-1 text-gray-700 dark:text-gray-300">
      <li className="flex justify-between gap-2">
        <span className="text-gray-500 dark:text-gray-400">Δ horas</span>
        {utilPct != null
          ? <strong className={`tabular-nums ${utilCls}`}>{utilPct}% <span className="font-normal text-gray-400 dark:text-gray-500">· reg ÷ disp</span></strong>
          : <span className="text-gray-400 dark:text-gray-500">— sin horario</span>}
      </li>
      <li className="flex justify-between gap-2">
        <span className="text-gray-500 dark:text-gray-400">Horas disponibles</span>
        <strong className="tabular-nums">{availableHours != null ? fmtHours(availableHours) : '—'}</strong>
      </li>
      <li className="flex justify-between gap-2">
        <span className="text-gray-500 dark:text-gray-400">Horas registradas</span>
        <strong className="tabular-nums">{fmtHours(registeredHours ?? 0)}</strong>
      </li>
      <li className="flex justify-between gap-2">
        <span className="text-gray-500 dark:text-gray-400">Presencia</span>
        <span className="tabular-nums">
          <strong>{daysPresent}/{expectedDays}</strong> días háb.
          {absentDays > 0 && <span className="text-red-600 dark:text-red-400"> · {absentDays} sin act.</span>}
          {leaveDays > 0 && <span className="text-gray-400 dark:text-gray-500"> · 🌴{leaveDays}</span>}
        </span>
      </li>
      <li className="flex justify-between gap-2">
        <span className="text-gray-500 dark:text-gray-400">Tardanzas</span>
        {hasSchedule
          ? (lateDays > 0
              ? <strong className="text-amber-600 dark:text-amber-400">⏰ {lateDays}</strong>
              : <span className="text-green-600 dark:text-green-400">sin tardanzas</span>)
          : <span className="text-gray-400 dark:text-gray-500">sin horario</span>}
      </li>
      <li className="text-[11px] text-gray-400 dark:text-gray-500 pt-0.5">{businessDays} días hábiles en el período</li>
    </ul>
  )
}

const fmtChartDate = d => new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
const fmtTooltipDate = d => new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })

// Gráfico de líneas de horas registradas por día (últimos 60 días, contexto de tendencia).
// Hover/foco por teclado muestran un tooltip con el día y las horas — mismo patrón que
// el gráfico de horas por mes de Proyectos → Reportes (ProjectReports.jsx).
// history = [{ date: 'YYYY-MM-DD', hours }]
function HoursLineChart({ history }) {
  const [activeIdx, setActiveIdx] = useState(null)
  const svgRef = useRef(null)
  const data = history || []
  if (data.length < 2) return <p className="text-xs text-gray-400 dark:text-gray-500 italic">Sin datos suficientes.</p>
  const hrs = data.map(d => d.hours)
  const max = Math.max(...hrs, 0.5)
  const n = data.length
  const W = 760, H = 150, padL = 30, padR = 8, padT = 12, padB = 22
  const innerW = W - padL - padR, innerH = H - padT - padB
  const x = i => padL + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1))
  const y = v => padT + innerH - (v / max) * innerH
  const points = data.map((d, i) => `${x(i).toFixed(1)},${y(d.hours).toFixed(1)}`).join(' ')
  const step = Math.max(1, Math.ceil(n / 8))
  // Con muchos puntos diarios, marcar un punto por día encima de la línea es ruido visual —
  // solo se dibujan círculos donde también va la etiqueta del eje X (más el último, siempre).
  const dotRadius = n > 20 ? 2 : 2.5
  const lastIdx = n - 1
  const active = activeIdx != null ? data[activeIdx] : null

  function handlePointerMove(e) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * W
    let nearest = 0, best = Infinity
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - relX)
      if (d < best) { best = d; nearest = i }
    }
    setActiveIdx(nearest)
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); setActiveIdx(i => Math.min(lastIdx, (i ?? lastIdx) + 1)) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setActiveIdx(i => Math.max(0, (i ?? lastIdx) - 1)) }
    else if (e.key === 'Escape') { setActiveIdx(null) }
  }

  // Tooltip: caja angosta anclada al punto activo, recortada para no salirse del viewBox.
  const tooltipW = 96
  const tooltipX = active ? Math.min(Math.max(x(activeIdx) - tooltipW / 2, padL), W - padR - tooltipW) : 0
  const tooltipY = active ? Math.max(y(active.hours) - 42, padT) : 0

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full touch-none"
      style={{ maxHeight: 190 }}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Horas registradas por día: de ${fmtTooltipDate(data[0].date)} a ${fmtTooltipDate(data[lastIdx].date)}`}
      tabIndex={0}
      onMouseMove={handlePointerMove}
      onMouseLeave={() => setActiveIdx(null)}
      onFocus={() => setActiveIdx(i => i ?? lastIdx)}
      onBlur={() => setActiveIdx(null)}
      onKeyDown={handleKeyDown}
    >
      {/* eje base + etiquetas Y */}
      <g className="text-gray-300 dark:text-gray-600">
        <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)} stroke="currentColor" strokeWidth="1" />
        <line x1={padL} y1={y(max)} x2={W - padR} y2={y(max)} stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.5" />
      </g>
      <g className="text-gray-400 dark:text-gray-500" fill="currentColor">
        <text x={padL - 5} y={y(max) + 3} textAnchor="end" fontSize="9">{Math.round(max)}h</text>
        <text x={padL - 5} y={y(0) + 3} textAnchor="end" fontSize="9">0</text>
      </g>
      <polyline points={points} fill="none" stroke="#F7931A" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => {
        const isLast = i === n - 1
        const showTick = i % step === 0 || isLast
        return (
          <g key={i}>
            {(showTick || n <= 20) && (
              <circle cx={x(i)} cy={y(d.hours)} r={isLast ? 3.5 : dotRadius} fill="#F7931A" />
            )}
            {showTick && (
              <text x={x(i)} y={H - 7} textAnchor="middle" fontSize="9" fill="currentColor" className="text-gray-400 dark:text-gray-500">{fmtChartDate(d.date)}</text>
            )}
          </g>
        )
      })}

      {/* Crosshair + punto activo (hover/foco por teclado) */}
      {active && (
        <g>
          <line x1={x(activeIdx)} x2={x(activeIdx)} y1={padT} y2={H - padB} className="stroke-gray-300 dark:stroke-gray-600" strokeWidth={1} />
          <circle cx={x(activeIdx)} cy={y(active.hours)} r={5} className="fill-white dark:fill-gray-800" />
          <circle cx={x(activeIdx)} cy={y(active.hours)} r={3} fill="#F7931A" />

          <g transform={`translate(${tooltipX}, ${tooltipY})`}>
            <rect width={tooltipW} height={34} rx={5} className="fill-gray-800 dark:fill-gray-900" opacity={0.95} />
            <text x={8} y={14} className="fill-white font-semibold" fontSize={11}>{fmtHours(active.hours)}</text>
            <text x={8} y={26} className="fill-gray-300" fontSize={9}>{fmtTooltipDate(active.date)}</text>
          </g>
        </g>
      )}
    </svg>
  )
}

// Envuelve HoursLineChart con navegación a bloques de 60 días anteriores + el rango de
// fechas cubierto arriba del gráfico. Arranca con el historial ya incluido en el payload
// de la tabla (back=0); navegar hacia atrás pide el bloque siguiente bajo demanda (lazy,
// mismo patrón que el drill-down de ProjectBars) sin invalidar la caché de la tabla completa.
function HoursHistorySection({ userId, initialHistory }) {
  const [back, setBack] = useState(0)
  const [history, setHistory] = useState(initialHistory)
  const [loading, setLoading] = useState(false)

  // Si se recarga el payload del padre (ej. cambio de modo current/closed en el panel de
  // usuario), volver a la ventana actual en vez de quedar "atascado" en un período viejo.
  useEffect(() => {
    setHistory(initialHistory)
    setBack(0)
  }, [initialHistory])

  async function goTo(next) {
    if (next < 0 || next === back || loading) return
    setLoading(true)
    try {
      if (next === 0) {
        setHistory(initialHistory)
      } else {
        const { data } = await api.get(`/admin/productivity/users/${userId}/hours-history`, { params: { back: next } })
        setHistory(data.history)
      }
      setBack(next)
    } catch {
      // se queda con el historial que ya tenía cargado
    } finally {
      setLoading(false)
    }
  }

  const rangeLabel = history?.length
    ? `${fmtChartDate(history[0].date)} – ${fmtChartDate(history[history.length - 1].date)}`
    : ''

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <button
          type="button"
          onClick={() => goTo(back + 1)}
          disabled={loading}
          className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-400"
        >
          ← 60 días antes
        </button>
        <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">{rangeLabel}</span>
        <button
          type="button"
          onClick={() => goTo(back - 1)}
          disabled={loading || back === 0}
          className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-400"
        >
          60 días después →
        </button>
      </div>
      <HoursLineChart history={history} />
    </div>
  )
}

// Barras horizontales de tiempo por proyecto. Cada proyecto se expande para ver el
// drill-down de tareas completadas (lazy: trae el breakdown del período al primer click).
function ProjectBars({ porProyecto, userId, mode }) {
  const [expandedPid, setExpandedPid] = useState(null)
  const [breakdown, setBreakdown] = useState(null) // { [projectId]: taskList }
  const [loading, setLoading] = useState(false)

  async function toggle(pid) {
    if (expandedPid === pid) { setExpandedPid(null); return }
    setExpandedPid(pid)
    if (!breakdown) {
      setLoading(true)
      try {
        const { data } = await api.get(`/admin/productivity/users/${userId}/breakdown`, { params: { mode } })
        const map = {}
        for (const p of data.byProject || []) map[p.project.id] = p.taskList
        setBreakdown(map)
      } catch {
        setBreakdown({})
      } finally {
        setLoading(false)
      }
    }
  }

  if (!porProyecto || porProyecto.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500 italic">Sin tiempo registrado por proyecto.</p>
  }
  const max = Math.max(...porProyecto.map(p => p.minutes), 1)
  return (
    <div className="space-y-1.5">
      {porProyecto.map(p => {
        const open = expandedPid === p.projectId
        const tasks = breakdown?.[p.projectId]
        return (
          <div key={p.projectId}>
            <button onClick={() => toggle(p.projectId)} className="w-full flex items-center gap-2 group">
              <span className={`text-gray-300 dark:text-gray-600 transition-transform text-xs shrink-0 ${open ? 'rotate-90' : ''}`}>›</span>
              <span className="text-xs text-gray-600 dark:text-gray-300 w-28 truncate shrink-0 text-left group-hover:text-gray-900 dark:group-hover:text-white" title={p.name}>{p.name}</span>
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                <div className="bg-primary-500 h-3 rounded-full" style={{ width: `${Math.round(p.minutes / max * 100)}%` }} />
              </div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-20 text-right shrink-0">
                {fmtHours(Math.round(p.minutes / 60 * 10) / 10)} · {p.completadas}t
              </span>
            </button>
            {open && (
              <div className="pl-5 pr-1 py-1.5 space-y-1">
                {loading && !breakdown && <p className="text-xs text-gray-400 dark:text-gray-500 italic">Cargando tareas…</p>}
                {tasks && tasks.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500 italic">Sin tareas completadas.</p>}
                {tasks && tasks.map(task => (
                  <div key={task.id} className="flex items-start justify-between text-xs gap-3">
                    <div className="flex items-start gap-1.5 flex-1 min-w-0">
                      <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                      <span className="text-gray-600 dark:text-gray-300 truncate">{linkify(task.description)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {task.isOverride && <span className="text-amber-500">✎</span>}
                      <span className="text-gray-400 dark:text-gray-500">{fmtHours(Math.round(task.minutes / 60 * 10) / 10)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Comparación con la mediana del equipo (fila expandida).
function TeamCompare({ stats, benchmark }) {
  if (!benchmark) return null
  const rows = []
  if (stats.utilization != null && benchmark.utilizationMedian != null) {
    rows.push({ label: 'Δ horas', me: stats.utilization, med: benchmark.utilizationMedian, fmt: v => `${Math.round(v * 100)}%` })
  }
  rows.push(
    { label: 'Tareas', me: stats.completed,      med: benchmark.completed,      fmt: v => Math.round(v) },
    { label: 'Horas',  me: stats.hours,          med: benchmark.horas,          fmt: v => fmtHours(Math.round(v * 10) / 10) },
    { label: 'Tasa',   me: stats.tasaCompletado, med: benchmark.tasaCompletado, fmt: v => `${Math.round(v * 100)}%` },
  )
  return (
    <div className="space-y-1.5">
      {rows.map(r => {
        const max = Math.max(r.me, r.med, 0.0001)
        return (
          <div key={r.label} className="text-xs">
            <div className="flex justify-between text-gray-500 dark:text-gray-400 mb-0.5">
              <span>{r.label}</span>
              <span><strong className="text-gray-700 dark:text-gray-200">{r.fmt(r.me)}</strong> <span className="text-gray-400">· equipo {r.fmt(r.med)}</span></span>
            </div>
            <div className="relative h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full">
              <div className="absolute top-0 left-0 h-1.5 bg-primary-500 rounded-full" style={{ width: `${(r.me / max) * 100}%` }} />
              {/* marca de la mediana del equipo */}
              <div className="absolute top-[-2px] h-2.5 w-0.5 bg-gray-500 dark:bg-gray-300" style={{ left: `${(r.med / max) * 100}%` }} title="Mediana del equipo" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Contenido de la fila expandida de una persona: gráfico de horas, tiempo por proyecto,
// asistencia, comparación con el equipo y análisis IA. Exportado para reuso fuera de la
// tabla (ver el panel de administración del perfil de usuario, que muestra esto para una
// sola persona sin la tabla completa alrededor).
export function PersonProductivityDetail({ m, benchmark, mode, onRefresh, refreshing }) {
  const s = m.stats
  return (
    <div className="space-y-6">
      {/* Gráfico de horas — ventana de 60 días navegable a meses anteriores (contexto de tendencia, no depende del período) */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
          Horas registradas por día <span className="normal-case font-normal text-gray-400 dark:text-gray-500">· ventana de 60 días (contexto, no depende del período)</span>
        </p>
        <HoursHistorySection userId={m.id} initialHistory={s.hoursHistory} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Col 1: Tiempo por proyecto (expandible a tareas) */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Tiempo por proyecto</p>
          <ProjectBars porProyecto={s.porProyecto} userId={m.id} mode={mode} />
        </div>

        {/* Col 2: Horas y Asistencia */}
        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Horas y Asistencia</p>
            <HoursAttendanceBlock att={s.attendance} />
          </div>
          {s.stuckTasks > 0 && (
            <p className="text-xs"><span className="font-bold text-amber-600 dark:text-amber-400">{s.stuckTasks}</span> <span className="text-gray-500 dark:text-gray-400">tarea{s.stuckTasks !== 1 ? 's' : ''} atascada{s.stuckTasks !== 1 ? 's' : ''} &gt;7d</span></p>
          )}
        </div>

        {/* Col 3: Comparación con el equipo */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Comparación con el equipo</p>
          <TeamCompare stats={s} benchmark={benchmark} />
        </div>
      </div>

      {/* Análisis IA — a todo el ancho, igual que el gráfico de horas */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Análisis IA</p>
          <div className="flex items-center gap-3">
            {m.insight?.updatedAt && (
              <span className="text-[11px] text-gray-300 dark:text-gray-600">actualizado {timeAgo(m.insight.updatedAt)}</span>
            )}
            <button
              onClick={e => { e.stopPropagation(); onRefresh(m.id) }}
              disabled={refreshing}
              className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-40 transition-colors flex items-center gap-1"
            >
              <span className={refreshing ? 'animate-spin inline-block' : ''}>↺</span>
              {refreshing ? 'Generando análisis...' : 'Regenerar análisis IA'}
            </button>
          </div>
        </div>
        {m.insight ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
            {m.insight.tendencias && (
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug"><span className="text-gray-400 dark:text-gray-500">Cambio:</span> {m.insight.tendencias}</p>
            )}
            {m.insight.fortalezas && (
              <p className="text-sm text-green-700 dark:text-green-400 leading-snug"><span className="opacity-60">Fortaleza:</span> {m.insight.fortalezas}</p>
            )}
            {m.insight.areasDeAtencion && (
              <p className="text-sm text-red-700 dark:text-red-400 leading-snug"><span className="opacity-60">Riesgo:</span> {m.insight.areasDeAtencion}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">Sin señales destacables — dentro del promedio.</p>
        )}
      </div>
    </div>
  )
}

function PersonRow({ m, benchmark, expanded, onToggle, onRefresh, refreshing, mode }) {
  const st = STATUS[m.status] || STATUS.ok
  const s = m.stats
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer"
      >
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2.5">
            <span className={`text-gray-300 dark:text-gray-600 transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
            <UserLink userId={m.id}><img src={avatarUrl(m.avatar)} alt={m.name} className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-600 hover:opacity-90 transition-opacity" /></UserLink>
            <div className="min-w-0">
              <UserLink userId={m.id} as="p" className="text-sm font-medium text-gray-900 dark:text-white truncate leading-tight hover:text-primary-600 dark:hover:text-primary-400">{m.name}</UserLink>
              <div className="flex items-center gap-2">
                <RoleBadge role={m.role} userId={m.id} className="inline-block mt-0.5" />
                <UserLink userId={m.id} className="text-[11px] text-primary-600 dark:text-primary-400 hover:underline mt-0.5">Ver perfil →</UserLink>
              </div>
            </div>
          </div>
        </td>
        <td className="py-2.5 px-3 text-center text-sm tabular-nums"><UtilCell value={s.utilization} median={benchmark?.utilizationMedian} /></td>
        <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-300 tabular-nums">
          {s.completed}{s.hasData && <VsTeam value={s.completed} median={benchmark?.completed} />}
        </td>
        <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-300 tabular-nums">
          {fmtHours(s.hours)}{s.hasData && <VsTeam value={s.hours} median={benchmark?.horas} />}
        </td>
        <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-300 tabular-nums">
          {s.hasData ? `${Math.round(s.tasaCompletado * 100)}%` : '—'}{s.hasData && <VsTeam value={s.tasaCompletado} median={benchmark?.tasaCompletado} />}
        </td>
        <td className="py-2.5 px-3 text-center text-sm hidden sm:table-cell"><AttendanceCell att={s.attendance} /></td>
        <td className="py-2.5 px-3 text-center">
          <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50 dark:bg-gray-800/60">
          <td colSpan={7} className="px-4 py-5">
            <PersonProductivityDetail m={m} benchmark={benchmark} mode={mode} onRefresh={onRefresh} refreshing={refreshing} />
          </td>
        </tr>
      )}
    </>
  )
}

// Encabezado de columna ordenable
function SortTh({ label, col, sortBy, sortDir, onSort, align = 'center', className = '' }) {
  const active = sortBy === col
  const alignCls = align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center'
  return (
    <th className={`py-2 px-3 font-semibold ${alignCls} ${className}`}>
      <button
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors ${
          active ? 'text-gray-700 dark:text-gray-200' : 'hover:text-gray-600 dark:hover:text-gray-300'
        }`}
      >
        {label}
        <span className={active ? 'opacity-100' : 'opacity-0'}>{sortDir === 'asc' ? '▲' : '▼'}</span>
      </button>
    </th>
  )
}

// Valor de ordenamiento por columna
function sortValue(m, col) {
  switch (col) {
    case 'name':      return m.name
    case 'completed': return m.stats.completed
    case 'hours':     return m.stats.hours
    case 'tasa':      return m.stats.hasData ? m.stats.tasaCompletado : -1
    case 'dhoras':    return m.stats.utilization ?? -1
    case 'attendance':return m.stats.attendance ? -(m.stats.attendance.absentDays ?? 0) : -999
    case 'status':    return PRIORITY[m.status] ?? 3
    default:          return 0
  }
}

// Dirección por defecto al activar una columna
const DEFAULT_DIR = { name: 'asc', status: 'asc', completed: 'desc', hours: 'desc', tasa: 'desc', dhoras: 'desc', attendance: 'desc' }

// Panel colapsable de ayuda: glosario de métricas + cuándo preocuparse.
function HelpPanel() {
  const [open, setOpen] = useState(false)
  const items = [
    ['Δ horas', 'Horas registradas ÷ horas disponibles (días esperados × la jornada del horario configurado). Mide cuánto del tiempo disponible quedó registrado en tareas. Requiere horario (inicio y fin) cargado; si no, muestra "—".'],
    ['Tareas', 'Tareas completadas en el período, por fecha de completado (incluye las que se arrastraron de días previos). Compará contra la mediana del equipo (▲/▼).'],
    ['Horas', 'Tiempo activo de esas tareas (completado − iniciado − pausas, tope 8h por tarea, o el ajuste manual). No cuenta tiempo en tareas sin terminar.'],
    ['Tasa', 'Completadas ÷ creadas en el período: ritmo de cierre vs creación. >100% = está bajando backlog; <100% sostenido = lo está acumulando.'],
    ['Horas y Asistencia', 'Al expandir la fila: Δ horas, horas disponibles vs registradas, presencia (días hábiles trabajados / esperados = hábiles − licencias) y tardanzas (primer login vs su horario). Separa "el mes está a medias" de "faltó".'],
    ['Estado', 'Semáforo automático: inactivo (vino ≥3 días la última semana y no completó nada), ↓ baja (cae fuerte en tareas/horas/tasa), atascos (≥5 tareas frenadas >7d), ↑ alta (sube ≥30%), OK. Mirá primero a los rojos y ámbar.'],
    ['vs equipo', 'El ▲/▼ y la barra comparan a la persona contra la mediana del equipo (no el promedio, para que un outlier no la distorsione).'],
    ['Período', 'En "Mes en curso" se compara el mes a la fecha contra los mismos días del mes anterior, para que los números sean comparables. "Mes cerrado" usa el último mes completo.'],
  ]
  return (
    <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
      >
        <span>💡 ¿Cómo se lee esta sección?</span>
        <span className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-700">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 mt-3">
            {items.map(([term, desc]) => (
              <div key={term}>
                <dt className="text-xs font-semibold text-gray-800 dark:text-gray-200">{term}</dt>
                <dd className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{desc}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}

// Resumen ejecutivo: chips por estado, clickeables para filtrar.
function SummaryBar({ members, filter, onFilter }) {
  const counts = useMemo(() => {
    const c = { inactive: 0, down: 0, stuck: 0, up: 0 }
    for (const m of members) if (c[m.status] !== undefined) c[m.status]++
    return c
  }, [members])

  const chips = [
    { key: 'down',     label: 'En baja',   n: counts.down,     cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
    { key: 'inactive', label: 'Inactivos', n: counts.inactive, cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
    { key: 'stuck',    label: 'Con atascos', n: counts.stuck,  cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
    { key: 'up',       label: 'En alza',   n: counts.up,       cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
  ]
  const needAttention = counts.down + counts.inactive + counts.stuck

  return (
    <div className="mb-4">
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
        {needAttention === 0
          ? <>✅ Nadie necesita atención inmediata.</>
          : <><strong className="text-gray-900 dark:text-white">{needAttention}</strong> {needAttention === 1 ? 'persona necesita' : 'personas necesitan'} atención.</>}
      </p>
      <div className="flex flex-wrap gap-2">
        {chips.map(c => (
          <button
            key={c.key}
            onClick={() => onFilter(filter === c.key ? null : c.key)}
            disabled={c.n === 0}
            className={`text-xs font-medium px-2.5 py-1 rounded-full transition-all disabled:opacity-40 disabled:cursor-default ${c.cls} ${
              filter === c.key ? 'ring-2 ring-offset-1 ring-gray-400 dark:ring-offset-gray-900' : ''
            }`}
          >
            {c.n} {c.label}
          </button>
        ))}
        {filter && (
          <button onClick={() => onFilter(null)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-1">
            ✕ quitar filtro
          </button>
        )}
      </div>
    </div>
  )
}

function ByPersonView({ data, loading, setData, mode }) {
  const [expandedId, setExpandedId] = useState(null)
  const [refreshing, setRefreshing] = useState({})
  const [sortBy, setSortBy]   = useState('status')
  const [sortDir, setSortDir] = useState('asc')
  const [filter, setFilter]   = useState(null)
  const [query, setQuery]     = useState('')

  function handleSort(col) {
    if (col === sortBy) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(col); setSortDir(DEFAULT_DIR[col] || 'desc') }
  }

  async function handleRefresh(userId) {
    setRefreshing(prev => ({ ...prev, [userId]: true }))
    try {
      const { data: insight } = await api.post(`/admin/productivity/${userId}/refresh`)
      setData(prev => ({
        ...prev,
        members: prev.members.map(m => m.id === userId ? { ...m, insight } : m),
      }))
    } catch {
      // silently ignore
    } finally {
      setRefreshing(prev => ({ ...prev, [userId]: false }))
    }
  }

  const benchmark = data?.benchmark || null

  const sorted = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    const filtered = data.members.filter(m =>
      (!filter || m.status === filter) &&
      (!q || m.name.toLowerCase().includes(q))
    )
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sortBy), vb = sortValue(b, sortBy)
      const cmp = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, sortBy, sortDir, filter, query])

  if (loading) return <LoadingSpinner className="py-16" />
  if (!data || data.members.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-gray-500">
        <p className="text-sm">No hay miembros activos en el equipo.</p>
      </div>
    )
  }

  return (
    <div>
      <HelpPanel />
      <SummaryBar members={data.members} filter={filter} onFilter={setFilter} />

      {/* Buscador de personas */}
      <div className="mb-4 relative max-w-xs">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">🔍</span>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar persona…"
          className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
            aria-label="Limpiar búsqueda"
          >
            ✕
          </button>
        )}
      </div>

      {/* Período analizado */}
      <ProductivityPeriodLabel period={data.period} />

      {/* Tabla */}
      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[680px]">
          <thead>
            <tr className="text-[11px] text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
              <SortTh label="Persona"     col="name"       sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="left" />
              <SortTh label="Δ horas"     col="dhoras"     sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="Tareas"      col="completed"  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="Horas"       col="hours"      sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="Tasa"        col="tasa"       sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="Asistencia"  col="attendance" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
              <SortTh label="Estado"      col="status"     sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(m => (
              <PersonRow
                key={m.id}
                m={m}
                benchmark={benchmark}
                expanded={expandedId === m.id}
                onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
                onRefresh={handleRefresh}
                refreshing={!!refreshing[m.id]}
                mode={mode}
              />
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">Nadie en este filtro.</td></tr>
            )}
          </tbody>
          {benchmark && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60 font-medium">
                <td className="py-2.5 px-3 text-xs text-gray-500 dark:text-gray-400">Mediana equipo ({benchmark.teamSize})</td>
                <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-200 tabular-nums">{benchmark.utilizationMedian != null ? `${Math.round(benchmark.utilizationMedian * 100)}%` : '—'}</td>
                <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-200 tabular-nums">{Math.round(benchmark.completed)}</td>
                <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-200 tabular-nums">{fmtHours(benchmark.horas)}</td>
                <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-200 tabular-nums">{Math.round(benchmark.tasaCompletado * 100)}%</td>
                <td className="py-2.5 px-3 hidden sm:table-cell" />
                <td className="py-2.5 px-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
        Δ horas = horas registradas ÷ horas disponibles (requiere horario configurado por persona). La comparación con el equipo usa la mediana de quienes tuvieron actividad. El análisis IA se actualiza cada sábado o al regenerarlo.
      </p>
    </div>
  )
}

export default function ProductivityTab() {
  const [mode, setMode] = useState('current')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/admin/productivity', { params: { mode } })
      setData(data)
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Productividad del equipo</h2>
          <TeamHoursHeadline teamHours={data?.teamHours} loading={loading} />
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      <ByPersonView data={data} loading={loading} setData={setData} mode={mode} />
    </div>
  )
}
