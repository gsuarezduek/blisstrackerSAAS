import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import { avatarUrl } from '../../utils/avatarUrl'
import ProductivityByProjectTab from './ProductivityByProjectTab'
import ProductivityPeriodLabel from './ProductivityPeriodLabel'

// Selector de modo de período (aplica a ambas vistas).
function ModeToggle({ mode, onChange }) {
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

// Δ porcentual (tareas / horas)
function DeltaPct({ value }) {
  if (value === null || value === undefined) return <span className="text-gray-300 dark:text-gray-600">—</span>
  const p = Math.round(value * 100)
  if (p === 0) return <span className="text-gray-400">=</span>
  const up = p > 0
  return (
    <span className={up ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
      {up ? '↑' : '↓'}{Math.abs(p)}%
    </span>
  )
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

// Bloque detallado de asistencia (fila expandida).
function AttendanceBlock({ att }) {
  if (!att) return <p className="text-xs text-gray-400 dark:text-gray-500 italic">Sin datos de asistencia.</p>
  const { businessDays, daysPresent, expectedDays, leaveDays, absentDays, lateDays, hasSchedule } = att
  return (
    <ul className="text-sm space-y-1 text-gray-700 dark:text-gray-300">
      <li>
        Presencia: <strong>{daysPresent}/{expectedDays}</strong> días hábiles
        {absentDays > 0 && <span className="text-red-600 dark:text-red-400"> · {absentDays} sin actividad</span>}
      </li>
      {leaveDays > 0 && <li className="text-gray-500 dark:text-gray-400">🌴 {leaveDays} día{leaveDays !== 1 ? 's' : ''} de licencia aprobada</li>}
      {hasSchedule
        ? (lateDays > 0
            ? <li className="text-amber-600 dark:text-amber-400">⏰ {lateDays} tardanza{lateDays !== 1 ? 's' : ''}</li>
            : <li className="text-green-600 dark:text-green-400">⏰ Sin tardanzas</li>)
        : <li className="text-xs text-gray-400 dark:text-gray-500">Sin horario configurado — no se miden tardanzas</li>}
      <li className="text-xs text-gray-400 dark:text-gray-500">{businessDays} días hábiles en el período</li>
    </ul>
  )
}

// Barras de horas activas por semana (reemplaza el sparkline de tasa).
function WeeklyHoursBars({ series, curStart }) {
  const weeks = series || []
  if (weeks.length < 2) return <p className="text-xs text-gray-400 dark:text-gray-500 italic">Sin datos suficientes.</p>
  const hours = weeks.map(w => Math.round((w.minutes / 60) * 10) / 10)
  const max = Math.max(...hours, 0.5)
  const weekLabel = i => {
    if (!curStart) return `S${i + 1}`
    const d = new Date(curStart + 'T12:00:00'); d.setDate(d.getDate() + i * 7)
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  }
  return (
    <div className="flex items-end gap-2">
      {weeks.map((w, i) => {
        const h = hours[i]
        const isLast = i === weeks.length - 1
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums h-3">{h > 0 ? fmtHours(h) : ''}</span>
            <div className="w-full h-12 bg-gray-100 dark:bg-gray-700 rounded flex items-end overflow-hidden">
              <div
                className={`w-full rounded ${isLast ? 'bg-primary-500' : 'bg-primary-300 dark:bg-primary-700'}`}
                style={{ height: `${Math.max(3, (h / max) * 100)}%` }}
              />
            </div>
            <span className="text-[9px] text-gray-400 dark:text-gray-500">{weekLabel(i)}</span>
          </div>
        )
      })}
    </div>
  )
}

// Barras horizontales de tiempo por proyecto
function ProjectBars({ porProyecto }) {
  if (!porProyecto || porProyecto.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500 italic">Sin tiempo registrado por proyecto.</p>
  }
  const max = Math.max(...porProyecto.map(p => p.minutes), 1)
  return (
    <div className="space-y-1.5">
      {porProyecto.map(p => (
        <div key={p.projectId} className="flex items-center gap-2">
          <span className="text-xs text-gray-600 dark:text-gray-300 w-32 truncate shrink-0" title={p.name}>{p.name}</span>
          <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
            <div className="bg-primary-500 h-3 rounded-full" style={{ width: `${Math.round(p.minutes / max * 100)}%` }} />
          </div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-20 text-right shrink-0">
            {fmtHours(Math.round(p.minutes / 60 * 10) / 10)} · {p.completadas}t
          </span>
        </div>
      ))}
    </div>
  )
}

// Comparación con la mediana del equipo (fila expandida).
function TeamCompare({ stats, benchmark }) {
  if (!benchmark) return null
  const rows = [
    { label: 'Tareas hechas', val: stats.completed,                me: stats.completed, med: benchmark.completed, fmt: v => Math.round(v) },
    { label: 'Horas',         val: stats.hours,                    me: stats.hours,     med: benchmark.horas,     fmt: v => fmtHours(Math.round(v * 10) / 10) },
    { label: 'Tasa',          val: stats.tasaCompletado,           me: stats.tasaCompletado, med: benchmark.tasaCompletado, fmt: v => `${Math.round(v * 100)}%` },
  ]
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

function PersonRow({ m, benchmark, period, expanded, onToggle, onRefresh, refreshing }) {
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
            <img src={avatarUrl(m.avatar)} alt={m.name} className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-600" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate leading-tight">{m.name}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{m.role || '—'}</p>
            </div>
          </div>
        </td>
        <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-300 tabular-nums">
          {s.completed}{s.hasData && <VsTeam value={s.completed} median={benchmark?.completed} />}
        </td>
        <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-300 tabular-nums">
          {fmtHours(s.hours)}{s.hasData && <VsTeam value={s.hours} median={benchmark?.horas} />}
        </td>
        <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-300 tabular-nums">
          {s.hasData ? `${Math.round(s.tasaCompletado * 100)}%` : '—'}{s.hasData && <VsTeam value={s.tasaCompletado} median={benchmark?.tasaCompletado} />}
        </td>
        <td className="py-2.5 px-3 text-center text-sm font-medium tabular-nums"><DeltaPct value={s.delta?.tareasPct} /></td>
        <td className="py-2.5 px-3 text-center text-sm hidden sm:table-cell"><AttendanceCell att={s.attendance} /></td>
        <td className="py-2.5 px-3 text-center">
          <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50 dark:bg-gray-800/60">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Col 1: Tiempo por proyecto + horas/semana */}
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Tiempo por proyecto</p>
                  <ProjectBars porProyecto={s.porProyecto} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Horas por semana</p>
                  <WeeklyHoursBars series={s.weeklySeries} curStart={period?.curStart} />
                </div>
              </div>

              {/* Col 2: Asistencia + comparación con el equipo */}
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Asistencia</p>
                  <AttendanceBlock att={s.attendance} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Comparación con el equipo</p>
                  <TeamCompare stats={s} benchmark={benchmark} />
                </div>
                {s.stuckTasks > 0 && (
                  <p className="text-xs"><span className="font-bold text-amber-600 dark:text-amber-400">{s.stuckTasks}</span> <span className="text-gray-500 dark:text-gray-400">tarea{s.stuckTasks !== 1 ? 's' : ''} atascada{s.stuckTasks !== 1 ? 's' : ''} &gt;7d</span></p>
                )}
              </div>

              {/* Col 3: Análisis IA */}
              <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Análisis IA</p>
                {m.insight ? (
                  <div className="space-y-2">
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

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={e => { e.stopPropagation(); onRefresh(m.id) }}
                    disabled={refreshing}
                    className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-40 transition-colors flex items-center gap-1"
                  >
                    <span className={refreshing ? 'animate-spin inline-block' : ''}>↺</span>
                    {refreshing ? 'Generando análisis...' : 'Regenerar análisis IA'}
                  </button>
                  {m.insight?.updatedAt && (
                    <span className="text-[11px] text-gray-300 dark:text-gray-600">actualizado {timeAgo(m.insight.updatedAt)}</span>
                  )}
                </div>
              </div>
            </div>
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
    case 'delta':     return m.stats.delta?.tareasPct ?? 0
    case 'attendance':return m.stats.attendance ? -(m.stats.attendance.absentDays ?? 0) : -999
    case 'status':    return PRIORITY[m.status] ?? 3
    default:          return 0
  }
}

// Dirección por defecto al activar una columna
const DEFAULT_DIR = { name: 'asc', status: 'asc', completed: 'desc', hours: 'desc', tasa: 'desc', delta: 'desc', attendance: 'desc' }

// Panel colapsable de ayuda: glosario de métricas + cuándo preocuparse.
function HelpPanel() {
  const [open, setOpen] = useState(false)
  const items = [
    ['Hechas', 'Tareas completadas en el período, por fecha de completado (incluye las que se arrastraron de días previos). Compará contra su propio ritmo y la mediana del equipo (▲/▼).'],
    ['Horas', 'Tiempo activo de esas tareas (completado − iniciado − pausas, tope 8h por tarea, o el ajuste manual). No cuenta tiempo en tareas sin terminar.'],
    ['Tasa', 'Completadas ÷ creadas en el período: ritmo de cierre vs creación. >100% = está bajando backlog; <100% sostenido = lo está acumulando.'],
    ['Δ tareas', 'Cambio del ritmo por día trabajado (tareas/día) vs el período anterior. Es por-día para no castigar tener menos días. Preocupate si cae ≥25%.'],
    ['Asistencia', 'Días hábiles trabajados / esperados (esperados = hábiles − licencias aprobadas). Separa "el mes está a medias" de "faltó". ⏰ = tardanzas (primer login vs su horario).'],
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

function ByPersonView({ mode }) {
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [refreshing, setRefreshing] = useState({})
  const [sortBy, setSortBy]   = useState('status')
  const [sortDir, setSortDir] = useState('asc')
  const [filter, setFilter]   = useState(null)

  function handleSort(col) {
    if (col === sortBy) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(col); setSortDir(DEFAULT_DIR[col] || 'desc') }
  }

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
    const filtered = filter ? data.members.filter(m => m.status === filter) : data.members
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sortBy), vb = sortValue(b, sortBy)
      const cmp = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, sortBy, sortDir, filter])

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

      {/* Período analizado */}
      <ProductivityPeriodLabel period={data.period} />

      {/* Tabla */}
      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[680px]">
          <thead>
            <tr className="text-[11px] text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
              <SortTh label="Persona"     col="name"       sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="left" />
              <SortTh label="Hechas"      col="completed"  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="Horas"       col="hours"      sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="Tasa"        col="tasa"       sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="Δ tareas"    col="delta"      sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
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
                period={data.period}
                expanded={expandedId === m.id}
                onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
                onRefresh={handleRefresh}
                refreshing={!!refreshing[m.id]}
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
                <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-200 tabular-nums">{Math.round(benchmark.completed)}</td>
                <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-200 tabular-nums">{fmtHours(benchmark.horas)}</td>
                <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-200 tabular-nums">{Math.round(benchmark.tasaCompletado * 100)}%</td>
                <td className="py-2.5 px-3 text-center text-gray-300 dark:text-gray-600">—</td>
                <td className="py-2.5 px-3 hidden sm:table-cell" />
                <td className="py-2.5 px-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
        El Δ compara el ritmo por día trabajado (tareas/día y horas/día) contra el período anterior, para neutralizar diferencias en la cantidad de días trabajados. La comparación con el equipo usa la mediana de quienes tuvieron actividad. El análisis IA se actualiza cada sábado o al regenerarlo.
      </p>
    </div>
  )
}

export default function ProductivityTab() {
  const [tab, setTab] = useState('person')
  const [mode, setMode] = useState('current')

  return (
    <div>
      <div className="mb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Productividad del equipo</h2>
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
        <div className="flex gap-1 mt-3 border-b border-gray-200 dark:border-gray-700">
          {[['person', 'Por persona'], ['project', 'Por proyecto']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                tab === key
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'person' ? <ByPersonView mode={mode} /> : <ProductivityByProjectTab mode={mode} />}
    </div>
  )
}
