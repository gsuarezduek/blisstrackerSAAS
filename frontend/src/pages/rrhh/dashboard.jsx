import { useState, useEffect } from 'react'
import api from '../../api/client'
import { Link } from 'react-router-dom'
import { avatarUrl } from '../../utils/avatarUrl'
import LoadingSpinner from '../../components/LoadingSpinner'
import { minsToTime } from './shared'
import { Inbox } from 'lucide-react'
import { Icon } from '../../components/ui/Icon'

// Piezas compartidas de la sección "Hoy" de RRHH (ver hoy.jsx): tarjeta de People
// Score, modales de lista de personas / horas del equipo e historial de métricas.

export function healthBand(pct) {
  if (pct == null) return { text: 'text-gray-500 dark:text-gray-400',  bar: 'bg-gray-300 dark:bg-gray-600', label: 'Sin evaluar' }
  if (pct > 70)    return { text: 'text-green-600 dark:text-green-400', bar: 'bg-green-500',                 label: 'Equipo saludable' }
  if (pct >= 40)   return { text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500',                 label: 'Requiere atención' }
  return             { text: 'text-red-600 dark:text-red-400',          bar: 'bg-red-500',                   label: 'Crítico' }
}

// Color del total de faltas: 0 verde · 1–3 amarillo · >3 rojo.
export function faltasColor(n) {
  if (n === 0) return 'text-green-600 dark:text-green-400'
  if (n <= 3)  return 'text-amber-600 dark:text-amber-400'
  return         'text-red-600 dark:text-red-400'
}

// Tarjeta de People Score (EOS) — salud del equipo según el Analizador de Personas.
export function PeopleScoreCard({ peopleScore }) {
  const { score, rightPeople, total, strikesTotal = 0 } = peopleScore
  const band = healthBand(score)
  const seatPct = total > 0 ? Math.round(rightPeople / total * 100) : null
  const seatColor = healthBand(seatPct).text
  const strikesColor = faltasColor(strikesTotal)
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Salud del equipo
        </p>
        <Link to="/admin/eos?tab=personas"
          className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline shrink-0">
          Analizador de Personas →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* People Score */}
        <div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold leading-none ${band.text}`}>{score != null ? `${score}%` : '—'}</span>
            <span className={`text-xs font-medium ${band.text}`}>{band.label}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">People Score</p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${band.bar}`} style={{ width: `${score ?? 0}%` }} />
          </div>
        </div>
        {/* Personas correctas */}
        <div className="sm:border-l border-gray-100 dark:border-gray-700 sm:pl-4">
          <span className={`text-3xl font-bold leading-none ${seatColor}`}>
            {rightPeople}<span className="text-xl text-gray-400 dark:text-gray-500">/{total}</span>
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Personas correctas en el asiento</p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-snug">
            Con <span className="font-medium text-green-600 dark:text-green-400">+</span> en todos sus valores y GWC
          </p>
        </div>
        {/* Faltas del equipo */}
        <div className="sm:border-l border-gray-100 dark:border-gray-700 sm:pl-4">
          <span className={`text-3xl font-bold leading-none ${strikesColor}`}>{strikesTotal}</span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Faltas del equipo</p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-snug">
            Total de faltas (strikes) registradas
          </p>
        </div>
      </div>
    </div>
  )
}

// Modal genérico de lista de personas (avatar + nombre + dato a la derecha).
export function PeopleListModal({ title, subtitle, people, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md max-h-[80vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">{title}</p>
            {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto px-5 py-3">
          {people.length === 0
            ? <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">Nadie</p>
            : <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {people.map(p => (
                  <div key={p.id} className="flex items-center gap-2.5 py-2">
                    <img src={avatarUrl(p.avatar)} alt={p.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    <span className="text-sm text-gray-800 dark:text-gray-200 flex-1 truncate">{p.name}</span>
                    {p.right && <span className={`text-xs flex-shrink-0 ${p.rightCls || 'text-gray-400 dark:text-gray-500'}`}>{p.right}</span>}
                  </div>
                ))}
              </div>}
        </div>
      </div>
    </div>
  )
}

// Modal de horas disponibles del equipo: detalle por persona + quiénes no tienen horario.
export function TeamHoursModal({ teamHours, onClose }) {
  const { withSchedule, without, totalHours, count, total } = teamHours
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md max-h-[80vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">Horas disponibles del equipo</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{totalHours} h/día · {count} de {total} con horario</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto px-5 py-3">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {withSchedule.map(u => (
              <div key={u.id} className="flex items-center gap-2.5 py-2">
                <img src={avatarUrl(u.avatar)} alt={u.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                <span className="text-sm text-gray-800 dark:text-gray-200 flex-1 truncate">{u.name}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{u.workStartTime}–{u.workEndTime}</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 tabular-nums w-10 text-right">{u.dailyHours}h</span>
              </div>
            ))}
          </div>
          {without.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Sin horario cargado ({without.length})</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {without.map(u => (
                  <div key={u.id} className="flex items-center gap-1.5">
                    <img src={avatarUrl(u.avatar)} alt={u.name} className="w-5 h-5 rounded-full object-cover" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">{u.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
          Suma de horas diarias (salida − entrada) de quienes tienen horario cargado.
        </div>
      </div>
    </div>
  )
}

// Config de cada métrica de RRHH con historial mensual (icono, título, formateo).
//   fmt(value)          → texto de la columna de valor + se usa el value crudo para escalar la barra
//   detailText(detail)  → texto auxiliar a la derecha (opcional)
//   currentText(c)      → frase del estado vacío ("Este mes: …")
export const METRIC_HISTORY = {
  activeMembers: {
    metric: 'activeMembers',

    title: 'Personas activas',
    footer: 'Integrantes activos del workspace · se guarda una captura por mes',
    fmt: v => `${v}`,
    detailText: () => '',
    currentText: c => (c != null ? `Este mes: ${c}.` : ''),
  },
  tenure: {
    metric: 'tenure',

    title: 'Antigüedad promedio',
    footer: 'Antigüedad promedio del equipo activo · se guarda una captura por mes',
    fmt: v => (v < 1 ? `${Math.round(v * 12)}m` : `${v.toFixed(1)}a`),
    detailText: d => (d?.memberCount != null ? `${d.memberCount} pers.` : ''),
    currentText: c => (c ? `Este mes: ${c}.` : ''),
  },
  projectsPerPerson: {
    metric: 'projectsPerPerson',

    title: 'Proyectos por persona',
    footer: 'Proyectos activos ÷ equipo activo · se guarda una captura por mes',
    fmt: v => `${v}`,
    detailText: d => (d?.activeProjects != null ? `${d.activeProjects}p / ${d.activeMembers}` : ''),
    currentText: c => (c != null ? `Este mes: ${c} proyectos/persona.` : ''),
  },
  avgLoginTime: {
    metric: 'avgLoginTime',

    title: 'Horario promedio de ingreso',
    footer: 'Promedio mensual del primer ingreso · solo quienes tienen horario',
    barMode: 'range', // la hora del día se escala dentro del rango del período (más legible que desde 0)
    fmt: v => minsToTime(v),
    detailText: d => (d?.scheduledDays != null ? `${d.scheduledDays} ingresos` : ''),
    currentText: c => (c ? `Este mes: ${c}.` : ''),
  },
  punctuality: {
    metric: 'punctuality',

    title: 'Puntualidad del equipo',
    footer: '% de llegadas a horario · promedio mensual',
    fmt: v => `${v}%`,
    detailText: d => (d?.scheduledDays != null ? `${d.scheduledDays - d.lateCount}/${d.scheduledDays} a horario` : ''),
    currentText: c => (c != null ? `Este mes: ${c}.` : ''),
  },
}

// Modal genérico: evolución mensual de una métrica de RRHH.
// Muestra hasta 12 meses; con datos de varios años aparece un selector de año.
export function MetricHistoryModal({ config, current, onClose }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [year, setYear]       = useState(null)   // null = últimos 12 meses

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ metric: config.metric })
    if (year) params.set('year', year)
    api.get(`/admin/rrhh/metric-history?${params}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year, config.metric])

  const snapshots = data?.snapshots ?? []
  const years     = data?.availableYears ?? []
  const showYearSelector = years.length > 1
  const withData  = snapshots.filter(s => s.value != null)
  const hasAny    = withData.length > 0
  const values    = withData.map(s => s.value)
  const maxValue  = Math.max(...values, 0.0001)
  const minValue  = Math.min(...values)

  // Ancho de la barra. 'range' escala dentro del [min, max] del período (útil para horas del día,
  // donde el 0 absoluto no aporta); por defecto escala desde 0.
  function barWidth(v) {
    if (config.barMode === 'range') {
      if (maxValue === minValue) return 100
      return Math.max(8, ((v - minValue) / (maxValue - minValue)) * 100)
    }
    return Math.max(4, (v / maxValue) * 100)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">{config.title}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Evolución mensual · {year ? `año ${year}` : 'últimos 12 meses'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showYearSelector && (
              <select
                value={year ?? ''}
                onChange={e => setYear(e.target.value ? Number(e.target.value) : null)}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Últimos 12 meses</option>
                {years.slice().reverse().map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {loading ? (
            <LoadingSpinner className="py-10" />
          ) : !hasAny ? (
            <div className="text-center py-10 text-gray-400">
              <p className="mb-2"><Icon as={Inbox} size={28} className="inline-block text-gray-300 dark:text-gray-600" /></p>
              <p className="text-sm font-medium">Todavía no hay historial</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Se guarda una captura por mes. {config.currentText(current)}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {snapshots.map(s => (
                <div key={s.month} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-24 flex-shrink-0 capitalize">{s.label}</span>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 min-w-0">
                    {s.value != null && (
                      <div
                        className="bg-primary-500 h-2.5 rounded-full transition-all"
                        style={{ width: `${barWidth(s.value)}%` }}
                      />
                    )}
                  </div>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 tabular-nums w-12 text-right flex-shrink-0">
                    {s.value != null ? config.fmt(s.value) : '—'}
                  </span>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 w-16 text-right flex-shrink-0 hidden sm:block">
                    {s.value != null ? config.detailText(s.detail) : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
          {config.footer}
        </div>
      </div>
    </div>
  )
}
