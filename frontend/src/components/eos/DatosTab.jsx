import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import api from '../../api/client'
import { avatarUrl } from '../../utils/avatarUrl'
import { adminMemberOptions } from '../../utils/adminMembers'

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers de períodos (ISO week + meses)
// ═══════════════════════════════════════════════════════════════════════════════

function getISOWeek(date) {
  // Reinterpretar el Date como UTC del mismo día calendario (componentes UTC).
  // Si el Date ya estaba en UTC, no hay cambio; si vino con componentes locales,
  // se normaliza al día que el usuario "ve" sin desfase de huso horario.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return [d.getUTCFullYear(), week]
}

/** Todas las ISO weeks que pertenecen al año ISO dado (52 o 53 semanas) */
function yearWeekPeriods(year) {
  const periods = []
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dow4 = jan4.getUTCDay() || 7
  let d = new Date(Date.UTC(year, 0, 4 - dow4 + 1)) // Lunes de W01
  while (true) {
    const [isoYear, isoWeek] = getISOWeek(d)
    if (isoYear !== year) break
    periods.push(`${isoYear}-W${String(isoWeek).padStart(2, '0')}`)
    d.setUTCDate(d.getUTCDate() + 7)
  }
  return periods
}

/** Los 12 meses del año calendario dado */
function yearMonthPeriods(year) {
  return Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, '0')}`
  )
}

const MONTH_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const MONTH_LONG  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const WEEK_MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function weekLabel(period) {
  return 'S' + parseInt(period.split('-W')[1], 10)
}

function weekRange(period) {
  const [y, ws] = period.split('-W')
  const year = parseInt(y), week = parseInt(ws)
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dow4 = jan4.getUTCDay() || 7
  const mon  = new Date(Date.UTC(year, 0, 4 - dow4 + 1 + (week - 1) * 7))
  const sun  = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6)
  return { mon, sun }
}

function weekTooltip(period) {
  const { mon, sun } = weekRange(period)
  const fmt = d => `${d.getUTCDate()} ${WEEK_MONTHS[d.getUTCMonth()]}`
  return `${fmt(mon)} – ${fmt(sun)}`
}

function monthLabel(period) {
  return MONTH_SHORT[parseInt(period.split('-')[1], 10) - 1]
}

function monthTooltip(period) {
  const [year, m] = period.split('-')
  return `${MONTH_LONG[parseInt(m, 10) - 1]} ${year}`
}

function todayWeekPeriod() {
  const now = new Date()
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function todayMonthPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function shiftWeekPeriod(period, delta) {
  const { mon } = weekRange(period)
  const d = new Date(mon)
  d.setUTCDate(d.getUTCDate() + delta * 7)
  const [y, w] = getISOWeek(d)
  return `${y}-W${String(w).padStart(2, '0')}`
}

function shiftMonthPeriod(period, delta) {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const TODAY_WEEK       = todayWeekPeriod()
const TODAY_MONTH      = todayMonthPeriod()
const TODAY_WEEK_YEAR  = parseInt(TODAY_WEEK.split('-W')[0])
const TODAY_MONTH_YEAR = parseInt(TODAY_MONTH.split('-')[0])

function formatVal(v) {
  if (v === null || v === undefined) return ''
  const n = Number(v)
  if (Number.isInteger(n)) return String(n)
  return String(parseFloat(n.toFixed(2)))
}

/**
 * Determina si un valor alcanza la meta según la dirección.
 * lowerIsBetter=false (default): mejor cuando value >= goal (ej: leads, ventas).
 * lowerIsBetter=true: mejor cuando value <= goal (ej: tardanzas, errores).
 * Devuelve 'on' (verde), 'off' (rojo) o null (sin meta / sin valor).
 */
function goalStatus(value, goal, lowerIsBetter) {
  if (goal == null || value == null || isNaN(value)) return null
  const onTrack = lowerIsBetter ? value <= goal : value >= goal
  return onTrack ? 'on' : 'off'
}

/** Formatea valor con unidad. `$` va antes; el resto va después. */
function formatWithUnit(v, unit) {
  if (v === null || v === undefined) return ''
  const formatted = formatVal(v)
  if (!unit) return formatted
  if (unit === '$') return `$${formatted}`
  return `${formatted} ${unit}`
}

/** Meta con su comparador según la dirección: "≥ 10 leads" o "≤ 5 días". */
function goalDisplay(metric) {
  if (metric.goal == null) return ''
  const cmp = metric.lowerIsBetter ? '≤' : '≥'
  return `${cmp} ${formatWithUnit(metric.goal, metric.unit)}`
}

/**
 * Valor de una métrica en un período. Las automáticas (autoKey) lo leen de
 * `autoData` (calculado por el backend); las manuales, de `entriesMap`.
 */
function metricValueAt(metric, period, entriesMap, autoData) {
  if (metric.autoKey) return autoData?.[metric.autoKey]?.[period]?.value ?? null
  return entriesMap[metric.id]?.[period] ?? null
}

/** Detalle (top 3) de una métrica automática en un período. */
function metricDetailAt(metric, period, autoData) {
  if (!metric.autoKey) return null
  return autoData?.[metric.autoKey]?.[period] ?? null
}

// Badge "Automático" reutilizable — solo el rayo (el icono ya comunica que es automático).
function AutoBadge({ className = '' }) {
  return (
    <span title="Dato automático"
      className={`inline-flex items-center justify-center w-4 h-4 rounded text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 ${className}`}>
      ⚡
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// YearNav — navegación de año con botón "Hoy"
// ═══════════════════════════════════════════════════════════════════════════════

function YearNav({ year, onPrev, onNext, isCurrentYear, onToday }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onPrev}
        title="Año anterior"
        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-semibold"
      >‹</button>
      <span className="text-sm font-bold text-gray-800 dark:text-gray-100 w-12 text-center tabular-nums select-none">
        {year}
      </span>
      <button
        onClick={onNext}
        title="Año siguiente"
        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-semibold"
      >›</button>
      {!isCurrentYear && (
        <button
          onClick={onToday}
          className="ml-1 px-2.5 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 border border-primary-200 dark:border-primary-700 rounded-lg transition-colors"
        >
          Hoy
        </button>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// QuickEntryCard — tarjeta de carga del período actual
// ═══════════════════════════════════════════════════════════════════════════════

function QuickEntryCard({ metric, owner, initialValue, onSave }) {
  const [val, setVal]       = useState(initialValue != null ? formatVal(initialValue) : '')
  const lastSaved           = useRef(initialValue ?? null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setVal(initialValue != null ? formatVal(initialValue) : '')
    lastSaved.current = initialValue ?? null
  }, [initialValue])

  const numVal   = val === '' ? null : parseFloat(val)
  const hasGoal  = metric.goal != null
  const status   = goalStatus(numVal, metric.goal, metric.lowerIsBetter)
  const onTrack  = status === 'on'
  const offTrack = status === 'off'
  const showDollar = metric.unit === '$'

  async function save() {
    const newVal = val === '' ? null : parseFloat(val)
    if (isNaN(newVal) && val !== '') { setVal(formatVal(lastSaved.current)); return }
    if (newVal === lastSaved.current) return
    setSaving(true)
    await onSave(newVal)
    lastSaved.current = newVal
    setSaving(false)
  }

  const inputBorder = onTrack  ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                    : offTrack ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:border-primary-400'

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2 min-h-[36px]">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-tight line-clamp-2">{metric.name}</p>
          {owner && (
            <div className="flex items-center gap-1 mt-1">
              <img src={avatarUrl(owner.avatar)} alt={owner.name}
                className="w-4 h-4 rounded-full object-cover border border-gray-200 dark:border-gray-600" />
              <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{owner.name.split(' ')[0]}</span>
            </div>
          )}
        </div>
        {hasGoal && (
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-medium">Meta</div>
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
              {goalDisplay(metric)}
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        {showDollar && (
          <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-base font-semibold pointer-events-none ${
            onTrack ? 'text-green-600 dark:text-green-400'
            : offTrack ? 'text-red-500 dark:text-red-400'
            : 'text-gray-400 dark:text-gray-500'
          }`}>$</span>
        )}
        <input
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          placeholder="Cargar valor"
          className={`w-full text-right text-base font-semibold tabular-nums border-2 rounded-lg py-2 pr-3 transition-all ${
            showDollar ? 'pl-8' : 'pl-3'
          } ${inputBorder} focus:outline-none focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-900 ${saving ? 'opacity-50' : ''}`}
        />
        {hasGoal && numVal != null && (
          <span className="absolute -top-2 -right-1.5 text-base bg-white dark:bg-gray-800 rounded-full leading-none">
            {onTrack ? '✅' : '🔴'}
          </span>
        )}
      </div>

      {!hasGoal && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">Sin meta definida</p>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// AutoMetricCard — tarjeta de solo-lectura de una métrica automática (valor + top 3)
// ═══════════════════════════════════════════════════════════════════════════════

// Títulos del bloque de detalle por tipo de dato automático.
const AUTO_RANK_TITLE = {
  tardanzas:           'Más tarde llegaron',
  ocupacion:           'Menos aprovecharon sus horas',
  delta_horas:         'Menos aprovecharon sus horas',
  proyectos_nuevos:    'Cuáles',
  proyectos_perdidos:  'Cuáles',
  tareas_completadas:  'Quién completó más',
  propuestas_enviadas: 'Quién generó más',
  todos_completados:   'Quién completó más',
  faltas:              'Quiénes',
  informes_entregados: 'Proyectos',
  seguidores_nuevos:   'Por red',
  objetivos_cumplidos: 'No cumplidos',
}

// Datos automáticos cuyo top 3 son filas de solo nombre (con valor opcional al final).
const NAME_ROW_KEYS = new Set([
  'proyectos_nuevos', 'proyectos_perdidos', 'informes_entregados',
  'seguidores_nuevos', 'objetivos_cumplidos',
])

// Mensaje cuando no hay detalle (valor presente pero lista vacía). null = no mostrar nada.
function autoEmptyHint(autoKey) {
  switch (autoKey) {
    case 'tardanzas':           return 'Nadie llegó tarde 🎉'
    case 'ocupacion':
    case 'delta_horas':         return 'Sin personas con horario cargado'
    case 'proyectos_nuevos':    return 'Sin altas este mes'
    case 'proyectos_perdidos':  return 'Sin bajas 🎉'
    case 'tareas_completadas':  return 'Sin tareas completadas'
    case 'propuestas_enviadas': return 'Sin propuestas generadas'
    case 'todos_completados':   return 'Sin to-dos completados'
    case 'faltas':              return 'Sin faltas registradas 🎉'
    case 'informes_entregados': return 'Sin informes este mes'
    case 'seguidores_nuevos':   return 'Sin datos de redes'
    case 'objetivos_cumplidos': return '¡Todos cumplidos! 🎉'
    default:                    return null
  }
}

/** Renderiza la línea de cada item del top 3 según el tipo de dato automático. */
function autoRankRow(autoKey, p, i) {
  // Filas de solo nombre (proyectos / informes / objetivos / redes), con valor opcional al final.
  if (NAME_ROW_KEYS.has(autoKey)) {
    const suffix = p.value != null
      ? (p.value > 0 ? `+${formatVal(p.value)}` : formatVal(p.value))
      : null
    return (
      <li key={`${p.name}-${i}`} className="flex items-center gap-2 text-xs">
        <span className="w-4 text-center text-[11px] font-bold text-gray-400 dark:text-gray-500 tabular-nums shrink-0">{i + 1}</span>
        <span className="font-medium text-gray-700 dark:text-gray-200 truncate min-w-0 flex-1">{p.name}</span>
        {suffix && <span className="text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap shrink-0">{suffix}</span>}
      </li>
    )
  }
  // Personas: tardanzas / ocupación / Δ horas / tareas / to-dos.
  let detail = ''
  if (autoKey === 'tardanzas') {
    detail = `${p.lateDays} ${p.lateDays === 1 ? 'día' : 'días'} · +${p.lateMins} min`
  } else if (autoKey === 'tareas_completadas') {
    detail = `${p.count} ${p.count === 1 ? 'tarea' : 'tareas'}`
  } else if (autoKey === 'propuestas_enviadas') {
    detail = `${p.count} ${p.count === 1 ? 'propuesta' : 'propuestas'}`
  } else if (autoKey === 'todos_completados') {
    detail = `${p.done} to-do${p.done === 1 ? '' : 's'}`
  } else if (autoKey === 'faltas') {
    detail = `${p.strikes} ${p.strikes === 1 ? 'falta' : 'faltas'}`
  } else if (p.util != null) {
    // ocupación / Δ horas: solo si el dato trae `util` (evita "undefined%").
    detail = `${p.util}% · ${formatVal(p.registeredHours)}/${formatVal(p.availableHours)}h`
  }
  return (
    <li key={p.userId} className="flex items-center gap-2 text-xs">
      <span className="w-4 text-center text-[11px] font-bold text-gray-400 dark:text-gray-500 tabular-nums shrink-0">{i + 1}</span>
      <img src={avatarUrl(p.avatar)} alt={p.name}
        className="w-5 h-5 rounded-full object-cover border border-gray-200 dark:border-gray-600 shrink-0" />
      <span className="font-medium text-gray-700 dark:text-gray-200 truncate min-w-0 flex-1">{p.name.split(' ')[0]}</span>
      <span className="text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap shrink-0">{detail}</span>
    </li>
  )
}

// Cartel para una tarjeta automática sin valor. Distingue semanal/mensual y, en las
// mensuales, explica el porqué del vacío según el estado de captura del mes en curso
// (`collecting` = ya se registran, aparecen en el próximo cierre · `not_saving` = no se
// están guardando, falta configurar la fuente).
function AutoEmptyValue({ metric, period, status }) {
  if (metric.frequency !== 'monthly') {
    return (
      <span className="text-sm text-gray-400 dark:text-gray-500">
        {period === TODAY_WEEK ? 'Aún sin datos esta semana' : 'Sin datos de esta semana'}
      </span>
    )
  }

  const isCurrent  = period === TODAY_MONTH
  const notSaving  = status === 'not_saving'
  const collecting = status === 'collecting'

  const main = isCurrent
    ? 'El mes en curso se cierra el 1° del próximo mes.'
    : 'Sin datos de este período.'

  let note = null
  if (notSaving) {
    note = 'No se están guardando estos datos todavía — revisá la configuración de la fuente.'
  } else if (collecting && !isCurrent) {
    note = 'Los del mes en curso ya se están registrando y aparecerán en el próximo cierre mensual.'
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm text-gray-400 dark:text-gray-500">{main}</span>
      {note && (
        <span className={`text-[11px] leading-snug ${
          notSaving ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'
        }`}>
          {note}
        </span>
      )}
    </div>
  )
}

function AutoMetricCard({ metric, value, detail, period, monthStatus }) {
  const hasGoal = metric.goal != null
  const status  = goalStatus(value, metric.goal, metric.lowerIsBetter)
  const onTrack = status === 'on'
  const offTrack = status === 'off'
  const top3 = detail?.top3 || []

  const valColor = onTrack  ? 'text-green-700 dark:text-green-300'
                 : offTrack ? 'text-red-600 dark:text-red-400'
                 : 'text-gray-800 dark:text-gray-100'

  const rankTitle = AUTO_RANK_TITLE[metric.autoKey] || 'Detalle'
  const emptyHint = autoEmptyHint(metric.autoKey)

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2 min-h-[36px]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-tight truncate">{metric.name}</p>
            <AutoBadge />
          </div>
        </div>
        {hasGoal && (
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-medium">Meta</div>
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">{goalDisplay(metric)}</div>
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-1 mb-2">
        {value != null ? (
          <>
            <span className={`text-2xl font-bold tabular-nums ${valColor}`}>{formatVal(value)}</span>
            {metric.unit && <span className={`text-sm font-medium ${valColor}`}>{metric.unit}</span>}
            {hasGoal && <span className="ml-1 text-base">{onTrack ? '✅' : '🔴'}</span>}
          </>
        ) : (
          <AutoEmptyValue metric={metric} period={period} status={monthStatus} />
        )}
      </div>

      {top3.length > 0 ? (
        <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-medium mb-1.5">{rankTitle}</p>
          <ul className="space-y-1.5">
            {top3.map((p, i) => autoRankRow(metric.autoKey, p, i))}
          </ul>
        </div>
      ) : (value != null && emptyHint) && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-100 dark:border-gray-700">
          {emptyHint}
        </p>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// CurrentPeriodPanel — panel destacado del período actual
// ═══════════════════════════════════════════════════════════════════════════════

function CurrentPeriodPanel({
  metrics, entriesMap, autoData, currentStatus, members, period, title, subtitle, onEntryChange,
  isCurrent, canGoForward, onPrev, onNext, onToday,
}) {
  if (metrics.length === 0 || !period) return null

  return (
    <div className="bg-gradient-to-br from-primary-50/80 via-white to-white dark:from-primary-900/20 dark:via-gray-800 dark:to-gray-800 border-2 border-primary-200 dark:border-primary-800/60 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`px-2 py-0.5 text-white text-[10px] font-bold uppercase tracking-wider rounded ${
            isCurrent ? 'bg-primary-600' : 'bg-gray-500 dark:bg-gray-600'
          }`}>
            {isCurrent ? 'Ahora' : 'Cargar atrasado'}
          </span>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
          {subtitle && <span className="text-xs text-gray-500 dark:text-gray-400">· {subtitle}</span>}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onPrev}
            title="Período anterior"
            className="w-7 h-7 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors text-sm font-semibold"
          >‹</button>
          {!isCurrent && (
            <button
              onClick={onToday}
              className="px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300 bg-white dark:bg-gray-800 hover:bg-primary-50 dark:hover:bg-primary-900/30 border border-primary-300 dark:border-primary-700 rounded-lg transition-colors"
            >
              Hoy
            </button>
          )}
          <button
            onClick={onNext}
            disabled={!canGoForward}
            title={canGoForward ? 'Período siguiente' : 'No se puede avanzar al futuro'}
            className="w-7 h-7 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors text-sm font-semibold disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >›</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {metrics.map(metric => {
          if (metric.autoKey) {
            return (
              <AutoMetricCard
                key={`${metric.id}-${period}`}
                metric={metric}
                value={metricValueAt(metric, period, entriesMap, autoData)}
                detail={metricDetailAt(metric, period, autoData)}
                period={period}
                monthStatus={currentStatus?.[metric.autoKey]}
              />
            )
          }
          const owner = metric.ownerId ? members.find(m => m.id === metric.ownerId) : null
          const currentVal = entriesMap[metric.id]?.[period] ?? null
          return (
            <QuickEntryCard
              key={`${metric.id}-${period}`}
              metric={metric}
              owner={owner}
              initialValue={currentVal}
              onSave={(value) => onEntryChange(metric.id, period, value)}
            />
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ScoreCell — celda editable de scorecard (tabla histórica)
// ═══════════════════════════════════════════════════════════════════════════════

function ScoreCell({ metricId, period, initialValue, goal, lowerIsBetter, unit, isCurrent, isWeekly, onSave }) {
  const [val, setVal]       = useState(initialValue != null ? formatVal(initialValue) : '')
  const lastSaved           = useRef(initialValue ?? null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setVal(initialValue != null ? formatVal(initialValue) : '')
    lastSaved.current = initialValue ?? null
  }, [initialValue])

  const numVal   = val === '' ? null : parseFloat(val)
  const status   = goalStatus(numVal, goal, lowerIsBetter)
  const onTrack  = status === 'on'
  const offTrack = status === 'off'
  const showDollar = unit === '$' && val !== ''

  async function save() {
    const newVal = val === '' ? null : parseFloat(val)
    if (isNaN(newVal) && val !== '') { setVal(formatVal(lastSaved.current)); return }
    if (newVal === lastSaved.current) return
    setSaving(true)
    await onSave(metricId, period, newVal)
    lastSaved.current = newVal
    setSaving(false)
  }

  const bg = onTrack  ? 'bg-green-50 dark:bg-green-900/25'
           : offTrack ? 'bg-red-50 dark:bg-red-900/20'
           : ''

  const textColor = onTrack  ? 'text-green-800 dark:text-green-300'
                  : offTrack ? 'text-red-700 dark:text-red-400'
                  : 'text-gray-700 dark:text-gray-300'

  const dollarColor = onTrack  ? 'text-green-600 dark:text-green-400'
                    : offTrack ? 'text-red-500 dark:text-red-400'
                    : 'text-gray-400 dark:text-gray-500'

  return (
    <td className={`p-0 ${isCurrent ? 'bg-primary-50/40 dark:bg-primary-900/15 border-x-2 border-primary-400 dark:border-primary-600' : ''}`}>
      <div className={`relative ${bg} transition-colors`}>
        {showDollar && (
          <span className={`absolute left-1 top-1/2 -translate-y-1/2 text-[11px] font-medium pointer-events-none ${dollarColor}`}>$</span>
        )}
        <input
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          placeholder={isCurrent ? '✎' : '—'}
          className={`w-full text-right bg-transparent focus:outline-none focus:bg-primary-50 dark:focus:bg-primary-900/20 transition-colors ${textColor} ${saving ? 'opacity-40' : ''} ${
            isWeekly
              ? `text-xs py-2 ${showDollar ? 'pl-4 pr-1' : 'px-1'}`
              : `text-sm py-3 ${showDollar ? 'pl-5 pr-2' : 'px-2'}`
          } ${isCurrent ? 'placeholder:text-primary-500 placeholder:font-bold' : ''}`}
          style={{ minWidth: isWeekly ? 34 : 88 }}
        />
      </div>
    </td>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// AutoScoreCell — celda de solo-lectura (métrica automática) en la tabla histórica
// ═══════════════════════════════════════════════════════════════════════════════

function AutoScoreCell({ value, goal, lowerIsBetter, isCurrent, isWeekly }) {
  const status   = goalStatus(value, goal, lowerIsBetter)
  const onTrack  = status === 'on'
  const offTrack = status === 'off'

  const bg = onTrack  ? 'bg-green-50 dark:bg-green-900/25'
           : offTrack ? 'bg-red-50 dark:bg-red-900/20'
           : ''
  const textColor = onTrack  ? 'text-green-800 dark:text-green-300'
                  : offTrack ? 'text-red-700 dark:text-red-400'
                  : 'text-gray-600 dark:text-gray-300'

  return (
    <td className={`p-0 ${isCurrent ? 'bg-primary-50/40 dark:bg-primary-900/15 border-x-2 border-primary-400 dark:border-primary-600' : ''}`}>
      <div className={`text-right tabular-nums ${bg} ${textColor} ${
        isWeekly ? 'text-xs py-2 px-1' : 'text-sm py-3 px-2'
      }`} style={{ minWidth: isWeekly ? 34 : 88 }}>
        {value != null ? formatVal(value) : <span className="text-gray-300 dark:text-gray-600">—</span>}
      </div>
    </td>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Modal crear / editar métrica
// ═══════════════════════════════════════════════════════════════════════════════

const UNITS = ['', '#', '$', '%', 'hs', 'días', 'km', 'kg', 'leads', 'clientes', 'ventas', 'tickets']

function MetricModal({ metric, members, onSave, onClose, saving }) {
  const isAuto = !!metric?.autoKey
  const [name,          setName]          = useState(metric?.name      ?? '')
  const [ownerId,       setOwnerId]       = useState(metric?.ownerId   != null ? String(metric.ownerId) : '')
  const [goal,          setGoal]          = useState(metric?.goal      != null ? String(metric.goal)    : '')
  const [lowerIsBetter, setLowerIsBetter] = useState(metric?.lowerIsBetter ?? false)
  const [unit,          setUnit]          = useState(metric?.unit      ?? '')
  const [frequency,     setFrequency]     = useState(metric?.frequency ?? 'weekly')

  function handleSave() {
    if (isAuto) {
      onSave({ goal: goal !== '' ? Number(goal) : null })
      return
    }
    if (!name.trim()) return
    onSave({
      name:      name.trim(),
      ownerId:   ownerId   ? Number(ownerId)  : null,
      goal:      goal !== '' ? Number(goal)   : null,
      lowerIsBetter,
      unit:      unit.trim() || null,
      frequency,
    })
  }

  const isNew = !metric?.id

  // Edición de un dato automático: solo la meta es editable (el resto sale del catálogo).
  if (isAuto) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
           onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              {metric.name} <AutoBadge />
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Dato calculado por el sistema. Definí su meta {metric.frequency === 'monthly' ? 'mensual' : 'semanal'} ({metric.lowerIsBetter ? 'menor es mejor' : 'mayor es mejor'}):
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Meta {metric.unit ? `(${metric.unit})` : ''}
            </label>
            <input type="number" value={goal} onChange={e => setGoal(e.target.value)}
              placeholder="Ej: 3"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Dejala vacía para no marcar verde/rojo.</p>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {isNew ? 'Nueva métrica' : 'Editar métrica'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre de la métrica</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={200}
              placeholder="Ej: Nuevos leads, Facturación mensual, Propuestas enviadas…"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Frecuencia</label>
            <div className="flex gap-2">
              {[
                { v: 'weekly',  label: 'Semanal',  desc: 'S1 – S52 por año' },
                { v: 'monthly', label: 'Mensual',  desc: 'Ene – Dic por año' },
              ].map(opt => (
                <button key={opt.v} type="button" onClick={() => setFrequency(opt.v)}
                  className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    frequency === opt.v
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                  }`}>
                  <div>{opt.label}</div>
                  <div className="text-xs opacity-60 font-normal mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meta</label>
              <input type="number" value={goal} onChange={e => setGoal(e.target.value)}
                placeholder="Ej: 10"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="w-28">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unidad</label>
              <input type="text" value={unit} onChange={e => setUnit(e.target.value)} maxLength={20}
                list="unit-suggestions" placeholder="Ej: leads"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <datalist id="unit-suggestions">
                {UNITS.filter(Boolean).map(u => <option key={u} value={u} />)}
              </datalist>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">¿Cuándo está en verde?</label>
            <div className="flex gap-2">
              {[
                { v: false, label: 'Mayor es mejor', desc: 'Verde si ≥ la meta', hint: 'leads, ventas, facturación' },
                { v: true,  label: 'Menor es mejor', desc: 'Verde si ≤ la meta', hint: 'tardanzas, errores, costos' },
              ].map(opt => (
                <button key={String(opt.v)} type="button" onClick={() => setLowerIsBetter(opt.v)}
                  className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all text-left ${
                    lowerIsBetter === opt.v
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                  }`}>
                  <div>{opt.label}</div>
                  <div className="text-xs opacity-60 font-normal mt-0.5">{opt.desc}</div>
                  <div className="text-[10px] opacity-50 font-normal mt-0.5">Ej: {opt.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Responsable</label>
            <select value={ownerId} onChange={e => setOwnerId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Sin asignar</option>
              {adminMemberOptions(members, ownerId).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={!name.trim() || saving}
            className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ScorecardTable — tabla con scroll horizontal y columna sticky
// ═══════════════════════════════════════════════════════════════════════════════

function ScorecardTable({
  metrics, entriesMap, autoData, members, periods, currentPeriod,
  labelFn, tooltipFn,
  onEntryChange, onEdit, onDelete,
  containerRef, currentPeriodRef,
  isWeekly,
}) {
  function avg(metric) {
    const vals = periods.map(p => metricValueAt(metric, p, entriesMap, autoData)).filter(v => v != null)
    if (!vals.length) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  const colW = isWeekly ? 'min-w-[38px]' : 'min-w-[96px]'

  return (
    <div ref={containerRef} className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900/60">
            {/* Columna métrica sticky */}
            <th className={`sticky left-0 z-10 bg-gray-50 dark:bg-gray-900 text-left px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 ${
              isWeekly ? 'min-w-[180px]' : 'min-w-[220px]'
            }`}>
              Métrica
            </th>

            {/* Meta y responsable van apilados dentro de la columna métrica (semanal y mensual) */}

            {/* Columnas de período */}
            {periods.map(p => (
              <th
                key={p}
                ref={p === currentPeriod ? currentPeriodRef : null}
                title={tooltipFn ? tooltipFn(p) : undefined}
                className={`px-1 py-2.5 text-xs font-medium border-b border-gray-200 dark:border-gray-700 text-right ${colW} ${
                  p === currentPeriod
                    ? 'text-primary-700 dark:text-primary-300 font-bold bg-primary-100 dark:bg-primary-900/40 border-x-2 border-primary-400 dark:border-primary-600'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {labelFn(p)}
              </th>
            ))}

            <th className={`px-3 py-2.5 text-xs font-medium text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700 text-right w-[64px] ${
              !isWeekly ? 'sticky right-10 z-10 bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700' : ''
            }`}>
              Prom.
            </th>
            <th className={`px-2 py-2.5 border-b border-gray-200 dark:border-gray-700 w-10 ${
              !isWeekly ? 'sticky right-0 z-10 bg-gray-50 dark:bg-gray-900' : ''
            }`} />
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {metrics.map(metric => {
            const owner    = metric.ownerId ? members.find(m => m.id === metric.ownerId) : null
            const isAuto   = !!metric.autoKey
            const avgVal   = avg(metric)
            const hasGoal  = metric.goal != null
            const avgStat  = goalStatus(avgVal, metric.goal, metric.lowerIsBetter)
            const avgOK    = avgStat === 'on'
            const avgBAD   = avgStat === 'off'

            return (
              <tr key={metric.id} className="group hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                {/* Métrica sticky — nombre + meta + responsable apilados (semanal y mensual) */}
                <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 group-hover:bg-gray-50/50 dark:group-hover:bg-gray-700/20 px-4 py-2 transition-colors align-top">
                  <div className="flex flex-col gap-1 py-1">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-tight">{metric.name}</span>
                      {isAuto && <AutoBadge />}
                    </span>
                    {hasGoal && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-medium">Meta</span>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          {goalDisplay(metric)}
                        </span>
                      </div>
                    )}
                    {isAuto ? (
                      <span className="text-[11px] text-indigo-500 dark:text-indigo-300 font-medium">Calculado por el sistema</span>
                    ) : owner ? (
                      <div className="flex items-center gap-1.5">
                        <img src={avatarUrl(owner.avatar)} alt={owner.name}
                          className="w-4 h-4 rounded-full object-cover border border-gray-200 dark:border-gray-600 shrink-0" />
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{owner.name}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-gray-300 dark:text-gray-600 italic">Sin responsable</span>
                    )}
                  </div>
                </td>

                {/* Celdas de período */}
                {periods.map(period => (
                  isAuto ? (
                    <AutoScoreCell
                      key={period}
                      value={metricValueAt(metric, period, entriesMap, autoData)}
                      goal={metric.goal}
                      lowerIsBetter={metric.lowerIsBetter}
                      isCurrent={period === currentPeriod}
                      isWeekly={isWeekly}
                    />
                  ) : (
                    <ScoreCell
                      key={period}
                      metricId={metric.id}
                      period={period}
                      initialValue={entriesMap[metric.id]?.[period] ?? null}
                      goal={metric.goal}
                      lowerIsBetter={metric.lowerIsBetter}
                      unit={metric.unit}
                      isCurrent={period === currentPeriod}
                      isWeekly={isWeekly}
                      onSave={onEntryChange}
                    />
                  )
                ))}

                {/* Promedio */}
                <td className={`px-3 py-2 text-right w-[64px] ${
                  !isWeekly ? 'sticky right-10 z-10 bg-white dark:bg-gray-800 group-hover:bg-gray-50/50 dark:group-hover:bg-gray-700/20 border-l border-gray-100 dark:border-gray-700' : ''
                }`}>
                  {avgVal != null ? (
                    <span className={`text-xs font-medium whitespace-nowrap ${
                      avgOK  ? 'text-green-600 dark:text-green-400'
                    : avgBAD ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {metric.unit === '$' ? `$${formatVal(avgVal)}` : formatVal(avgVal)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                  )}
                </td>

                {/* Acciones */}
                <td className={`px-2 py-2 text-center w-10 ${
                  !isWeekly ? 'sticky right-0 z-10 bg-white dark:bg-gray-800 group-hover:bg-gray-50/50 dark:group-hover:bg-gray-700/20' : ''
                }`}>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-center">
                    <button onClick={() => onEdit(metric)} title="Editar"
                      className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs transition-colors">✎</button>
                    <button onClick={() => onDelete(metric.id)} title="Eliminar"
                      className="p-1 text-gray-400 hover:text-red-500 text-xs transition-colors">✕</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ConfirmModal
// ═══════════════════════════════════════════════════════════════════════════════

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-5">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel}  className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors">Eliminar</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// AutoMetricPicker — agregar un dato automático desde el catálogo
// ═══════════════════════════════════════════════════════════════════════════════

function AutoMetricPicker({ catalog, onAdd, onClose, saving }) {
  const available = catalog.filter(c => !c.added)
  const [goals, setGoals] = useState({})

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            Datos automáticos <AutoBadge />
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Métricas que el sistema calcula solo con datos que ya tiene. Se actualizan automáticamente.
          Las mensuales se llenan a mes vencido.
        </p>

        {available.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
            Ya agregaste todos los datos automáticos disponibles.
          </div>
        ) : (
          <div className="space-y-3">
            {available.map(c => (
              <div key={c.key} className="border border-gray-200 dark:border-gray-700 rounded-xl p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                      {c.name}
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                        {c.frequency === 'monthly' ? 'Mensual' : 'Semanal'}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{c.description}</p>
                  </div>
                  <button
                    onClick={() => onAdd(c.key, goals[c.key])}
                    disabled={saving}
                    className="shrink-0 px-3 py-1.5 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    Agregar
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <label className="text-xs text-gray-500 dark:text-gray-400">
                    Meta {c.frequency === 'monthly' ? 'mensual' : 'semanal'} {c.unit ? `(${c.unit})` : ''} · {c.lowerIsBetter ? 'menor es mejor' : 'mayor es mejor'}
                  </label>
                  <input
                    type="number"
                    value={goals[c.key] ?? ''}
                    onChange={e => setGoals(g => ({ ...g, [c.key]: e.target.value }))}
                    placeholder="opcional"
                    className="w-24 px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5">
          <button onClick={onClose} className="w-full py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cerrar</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// DatosTab — componente principal
// ═══════════════════════════════════════════════════════════════════════════════

export default function DatosTab() {
  const [members,     setMembers]     = useState([])
  const [metrics,     setMetrics]     = useState([])
  const [entriesMap,  setEntriesMap]  = useState({})
  const [autoData,    setAutoData]    = useState({})   // { autoKey: { 'YYYY-Www': { value, top3 } } }
  const [currentStatus, setCurrentStatus] = useState({}) // { autoKey: 'collecting' | 'not_saving' } (mes en curso)
  const [autoCatalog, setAutoCatalog] = useState([])
  const [autoPicker,  setAutoPicker]  = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [modalMetric, setModalMetric] = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(null)
  const [weekYear,    setWeekYear]    = useState(TODAY_WEEK_YEAR)
  const [monthYear,   setMonthYear]   = useState(TODAY_MONTH_YEAR)
  // Por defecto el panel muestra el período ANTERIOR (semana/mes pasados): son los últimos
  // con datos completos, que normalmente se cargan a posteriori. "Hoy" vuelve al actual.
  const [panelWeek,   setPanelWeek]   = useState(() => shiftWeekPeriod(TODAY_WEEK, -1))
  const [panelMonth,  setPanelMonth]  = useState(() => shiftMonthPeriod(TODAY_MONTH, -1))

  // Años de los que ya cargamos los valores automáticos (para no re-pedir).
  const loadedAutoYears = useRef(new Set())

  // Refs para auto-scroll de tablas
  const weekContainerRef  = useRef(null)
  const weekCurrentThRef  = useRef(null)
  const monthContainerRef = useRef(null)
  const monthCurrentThRef = useRef(null)

  const weeklyPeriods  = useMemo(() => yearWeekPeriods(weekYear),   [weekYear])
  const monthlyPeriods = useMemo(() => yearMonthPeriods(monthYear), [monthYear])

  // El período actual solo se resalta cuando estamos en el año actual
  const curWeek  = weekYear  === TODAY_WEEK_YEAR  ? TODAY_WEEK  : null
  const curMonth = monthYear === TODAY_MONTH_YEAR ? TODAY_MONTH : null

  // Trae los valores automáticos de un año (una sola vez por año).
  const fetchAutoYear = useCallback(async (year) => {
    if (loadedAutoYears.current.has(year)) return
    loadedAutoYears.current.add(year)
    try {
      const res = await api.get(`/eos/scorecard/auto?year=${year}`)
      const data = res.data?.data || {}
      setAutoData(prev => {
        const next = { ...prev }
        for (const k of Object.keys(data)) next[k] = { ...(next[k] || {}), ...data[k] }
        return next
      })
      // El estado del mes en curso solo viene en la respuesta del año actual.
      const status = res.data?.currentStatus
      if (status && Object.keys(status).length) setCurrentStatus(prev => ({ ...prev, ...status }))
    } catch {
      loadedAutoYears.current.delete(year)
    }
  }, [])

  // Reinicia y vuelve a traer los años visibles (tras agregar/quitar un dato automático).
  const reloadAuto = useCallback(() => {
    loadedAutoYears.current = new Set()
    setAutoData({})
    setCurrentStatus({})
    const years = new Set([weekYear, monthYear, parseInt(panelWeek.split('-W')[0]), parseInt(panelMonth.split('-')[0])])
    years.forEach(y => fetchAutoYear(y))
  }, [fetchAutoYear, weekYear, monthYear, panelWeek, panelMonth])

  useEffect(() => {
    api.get('/eos/scorecard')
      .then(res => {
        setMembers(res.data.members)
        setMetrics(res.data.metrics)
        setEntriesMap(res.data.entriesMap)
        setAutoCatalog(res.data.autoCatalog || [])
        if ((res.data.autoCatalog || []).some(c => c.added)) fetchAutoYear(TODAY_WEEK_YEAR)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [fetchAutoYear])

  // Cargar valores automáticos del año de las tablas y los paneles cuando cambian.
  const hasAuto = metrics.some(m => m.autoKey)
  useEffect(() => { if (hasAuto) fetchAutoYear(weekYear) }, [weekYear, hasAuto, fetchAutoYear])
  useEffect(() => { if (hasAuto) fetchAutoYear(monthYear) }, [monthYear, hasAuto, fetchAutoYear])
  useEffect(() => {
    if (hasAuto) fetchAutoYear(parseInt(panelWeek.split('-W')[0]))
  }, [panelWeek, hasAuto, fetchAutoYear])
  useEffect(() => {
    if (hasAuto) fetchAutoYear(parseInt(panelMonth.split('-')[0]))
  }, [panelMonth, hasAuto, fetchAutoYear])

  // Auto-scroll semanal: centra la semana actual al cargar o cambiar de año
  useEffect(() => {
    if (loading) return
    const container = weekContainerRef.current
    if (!container) return

    requestAnimationFrame(() => {
      const curTh = weekCurrentThRef.current
      if (curTh) {
        const cRect  = container.getBoundingClientRect()
        const thRect = curTh.getBoundingClientRect()
        const target = container.scrollLeft + thRect.left - cRect.left - cRect.width / 2 + thRect.width / 2
        container.scrollLeft = Math.max(0, target)
      } else {
        container.scrollLeft = 0
      }
    })
  }, [weekYear, loading])

  // Auto-scroll mensual
  useEffect(() => {
    if (loading) return
    const container = monthContainerRef.current
    if (!container) return

    requestAnimationFrame(() => {
      const curTh = monthCurrentThRef.current
      if (curTh) {
        const cRect  = container.getBoundingClientRect()
        const thRect = curTh.getBoundingClientRect()
        const target = container.scrollLeft + thRect.left - cRect.left - cRect.width / 2 + thRect.width / 2
        container.scrollLeft = Math.max(0, target)
      } else {
        container.scrollLeft = 0
      }
    })
  }, [monthYear, loading])

  // ── Guardar valor de celda
  const handleEntryChange = useCallback(async (metricId, period, value) => {
    await api.put(`/eos/scorecard/${metricId}/entries/${period}`, { value })
    setEntriesMap(prev => {
      const map = { ...prev, [metricId]: { ...prev[metricId] } }
      if (value == null) {
        delete map[metricId][period]
      } else {
        map[metricId][period] = value
      }
      return map
    })
  }, [])

  // ── Crear / editar métrica
  async function handleSaveMetric(data) {
    setSaving(true)
    try {
      if (modalMetric.mode === 'add') {
        const res = await api.post('/eos/scorecard', data)
        setMetrics(prev => [...prev, res.data])
      } else {
        const res = await api.patch(`/eos/scorecard/${modalMetric.metric.id}`, data)
        setMetrics(prev => prev.map(m => m.id === modalMetric.metric.id ? res.data : m))
      }
      setModalMetric(null)
    } finally { setSaving(false) }
  }

  // ── Agregar un dato automático desde el catálogo
  async function handleAddAuto(autoKey, goal) {
    setSaving(true)
    try {
      const res = await api.post('/eos/scorecard', {
        autoKey,
        goal: goal !== '' && goal != null ? Number(goal) : null,
      })
      setMetrics(prev => [...prev, res.data])
      setAutoCatalog(prev => prev.map(c => c.key === autoKey ? { ...c, added: true } : c))
      reloadAuto()
    } finally { setSaving(false) }
  }

  // ── Eliminar métrica
  async function handleDeleteMetric(id) {
    const removed = metrics.find(m => m.id === id)
    await api.delete(`/eos/scorecard/${id}`)
    setMetrics(prev => prev.filter(m => m.id !== id))
    setEntriesMap(prev => { const next = { ...prev }; delete next[id]; return next })
    if (removed?.autoKey) {
      setAutoCatalog(prev => prev.map(c => c.key === removed.autoKey ? { ...c, added: false } : c))
      setAutoData(prev => { const next = { ...prev }; delete next[removed.autoKey]; return next })
    }
    setConfirmDel(null)
  }

  const weeklyMetrics  = metrics.filter(m => m.frequency === 'weekly')
  const monthlyMetrics = metrics.filter(m => m.frequency === 'monthly')

  // Título + subtítulo del panel semanal según el período seleccionado
  const weekPanelTitle = useMemo(() => {
    if (panelWeek === TODAY_WEEK) return `Datos de esta semana (${weekLabel(panelWeek)})`
    return `Datos de ${weekLabel(panelWeek)}`
  }, [panelWeek])

  const weekPanelSubtitle = useMemo(() => {
    const { mon, sun } = weekRange(panelWeek)
    const fmt = d => `${d.getUTCDate()} ${WEEK_MONTHS[d.getUTCMonth()]}`
    const [y] = panelWeek.split('-W')
    const yearLabel = parseInt(y) !== TODAY_WEEK_YEAR ? ` ${y}` : ''
    return `${fmt(mon)} – ${fmt(sun)}${yearLabel}`
  }, [panelWeek])

  const monthPanelTitle = useMemo(() => {
    if (panelMonth === TODAY_MONTH) return 'Datos de este mes'
    const [year, m] = panelMonth.split('-')
    return `Datos de ${MONTH_LONG[parseInt(m, 10) - 1]}${parseInt(year) !== TODAY_MONTH_YEAR ? ` ${year}` : ''}`
  }, [panelMonth])

  const monthPanelSubtitle = useMemo(() => {
    if (panelMonth === TODAY_MONTH) {
      const [year, m] = panelMonth.split('-')
      return `${MONTH_LONG[parseInt(m, 10) - 1]} ${year}`
    }
    return null
  }, [panelMonth])

  const canGoForwardWeek  = panelWeek  < TODAY_WEEK
  const canGoForwardMonth = panelMonth < TODAY_MONTH

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Scorecard</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Métricas clave del negocio con seguimiento por período.
              Verde = cumplió la meta · Rojo = no la cumplió.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {autoCatalog.length > 0 && (
              <button
                onClick={() => setAutoPicker(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-colors"
              >
                ⚡ Dato automático
              </button>
            )}
            <button
              onClick={() => setModalMetric({ mode: 'add' })}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors"
            >
              + Nueva métrica
            </button>
          </div>
        </div>

        {/* Leyenda */}
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="w-8 h-5 rounded bg-green-100 dark:bg-green-900/40 border border-green-200 dark:border-green-800" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Cumplió la meta (≥ o ≤ según dirección)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-8 h-5 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" />
            <span className="text-xs text-gray-500 dark:text-gray-400">No cumplió la meta</span>
          </div>
          <div className="flex items-center gap-2 ml-2 pl-4 border-l border-gray-200 dark:border-gray-700">
            <span className="w-0.5 h-5 bg-primary-400 dark:bg-primary-600 rounded" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Período actual</span>
          </div>
        </div>
      </div>

      {/* Estado vacío */}
      {metrics.length === 0 && (
        <div className="bg-white dark:bg-gray-800 border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sin métricas todavía</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
            Agregá los números que importan: leads, facturación, propuestas enviadas, clientes atendidos…
          </p>
          <button
            onClick={() => setModalMetric({ mode: 'add' })}
            className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors"
          >
            + Agregar primera métrica
          </button>
        </div>
      )}

      {/* ── Sección semanal: panel rápido + histórico ── */}
      {weeklyMetrics.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">Semanales</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">· {weeklyPeriods.length} semanas</span>
            </div>
            <YearNav
              year={weekYear}
              onPrev={() => setWeekYear(y => y - 1)}
              onNext={() => setWeekYear(y => y + 1)}
              isCurrentYear={weekYear === TODAY_WEEK_YEAR}
              onToday={() => setWeekYear(TODAY_WEEK_YEAR)}
            />
          </div>

          <CurrentPeriodPanel
            metrics={weeklyMetrics}
            entriesMap={entriesMap}
            autoData={autoData}
            currentStatus={currentStatus}
            members={members}
            period={panelWeek}
            title={weekPanelTitle}
            subtitle={weekPanelSubtitle}
            onEntryChange={handleEntryChange}
            isCurrent={panelWeek === TODAY_WEEK}
            canGoForward={canGoForwardWeek}
            onPrev={() => setPanelWeek(p => shiftWeekPeriod(p, -1))}
            onNext={() => setPanelWeek(p => shiftWeekPeriod(p, +1))}
            onToday={() => setPanelWeek(TODAY_WEEK)}
          />

          <details className="group" open>
            <summary className="cursor-pointer text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-3 select-none flex items-center gap-1.5">
              <span className="transition-transform group-open:rotate-90 inline-block">›</span>
              Histórico semanal (scroll horizontal)
            </summary>
            <ScorecardTable
              metrics={weeklyMetrics}
              entriesMap={entriesMap}
              autoData={autoData}
              members={members}
              periods={weeklyPeriods}
              currentPeriod={curWeek}
              labelFn={weekLabel}
              tooltipFn={weekTooltip}
              onEntryChange={handleEntryChange}
              onEdit={metric => setModalMetric({ mode: 'edit', metric })}
              onDelete={id => setConfirmDel({ id })}
              containerRef={weekContainerRef}
              currentPeriodRef={weekCurrentThRef}
              isWeekly={true}
            />
          </details>
        </div>
      )}

      {/* ── Sección mensual: panel rápido + histórico ── */}
      {monthlyMetrics.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">Mensuales</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">· Ene – Dic</span>
            </div>
            <YearNav
              year={monthYear}
              onPrev={() => setMonthYear(y => y - 1)}
              onNext={() => setMonthYear(y => y + 1)}
              isCurrentYear={monthYear === TODAY_MONTH_YEAR}
              onToday={() => setMonthYear(TODAY_MONTH_YEAR)}
            />
          </div>

          <CurrentPeriodPanel
            metrics={monthlyMetrics}
            entriesMap={entriesMap}
            autoData={autoData}
            currentStatus={currentStatus}
            members={members}
            period={panelMonth}
            title={monthPanelTitle}
            subtitle={monthPanelSubtitle}
            onEntryChange={handleEntryChange}
            isCurrent={panelMonth === TODAY_MONTH}
            canGoForward={canGoForwardMonth}
            onPrev={() => setPanelMonth(p => shiftMonthPeriod(p, -1))}
            onNext={() => setPanelMonth(p => shiftMonthPeriod(p, +1))}
            onToday={() => setPanelMonth(TODAY_MONTH)}
          />

          <details className="group" open>
            <summary className="cursor-pointer text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-3 select-none flex items-center gap-1.5">
              <span className="transition-transform group-open:rotate-90 inline-block">›</span>
              Histórico mensual (scroll horizontal)
            </summary>
            <ScorecardTable
              metrics={monthlyMetrics}
              entriesMap={entriesMap}
              autoData={autoData}
              members={members}
              periods={monthlyPeriods}
              currentPeriod={curMonth}
              labelFn={monthLabel}
              tooltipFn={monthTooltip}
              onEntryChange={handleEntryChange}
              onEdit={metric => setModalMetric({ mode: 'edit', metric })}
              onDelete={id => setConfirmDel({ id })}
              containerRef={monthContainerRef}
              currentPeriodRef={monthCurrentThRef}
              isWeekly={false}
            />
          </details>
        </div>
      )}

      {/* Modal crear/editar */}
      {modalMetric && (
        <MetricModal
          metric={modalMetric.mode === 'edit' ? modalMetric.metric : null}
          members={members}
          onSave={handleSaveMetric}
          onClose={() => setModalMetric(null)}
          saving={saving}
        />
      )}

      {/* Modal confirmar borrado */}
      {confirmDel && (
        <ConfirmModal
          message="¿Eliminás esta métrica? Se borrarán también todos sus datos históricos."
          onConfirm={() => handleDeleteMetric(confirmDel.id)}
          onCancel={() => setConfirmDel(null)}
        />
      )}

      {/* Modal agregar dato automático */}
      {autoPicker && (
        <AutoMetricPicker
          catalog={autoCatalog}
          onAdd={async (key, goal) => { await handleAddAuto(key, goal) }}
          onClose={() => setAutoPicker(false)}
          saving={saving}
        />
      )}

    </div>
  )
}
