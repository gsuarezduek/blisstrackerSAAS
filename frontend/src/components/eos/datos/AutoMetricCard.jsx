import { avatarUrl } from '../../../utils/avatarUrl'
import { formatVal, goalStatus, goalDisplay, TODAY_WEEK, TODAY_MONTH } from './scorecardHelpers'
import { AutoBadge } from './ScorecardNav'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Icon } from '../../ui/Icon'

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
    case 'tardanzas':           return 'Nadie llegó tarde'
    case 'ocupacion':
    case 'delta_horas':         return 'Sin personas con horario cargado'
    case 'proyectos_nuevos':    return 'Sin altas este mes'
    case 'proyectos_perdidos':  return 'Sin bajas'
    case 'tareas_completadas':  return 'Sin tareas completadas'
    case 'propuestas_enviadas': return 'Sin propuestas generadas'
    case 'todos_completados':   return 'Sin to-dos completados'
    case 'faltas':              return 'Sin faltas registradas'
    case 'informes_entregados': return 'Sin informes este mes'
    case 'seguidores_nuevos':   return 'Sin datos de redes'
    case 'objetivos_cumplidos': return '¡Todos cumplidos!'
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

export default function AutoMetricCard({ metric, value, detail, period, monthStatus }) {
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
            {hasGoal && <span className="ml-1 inline-flex align-[-2px]">{onTrack ? <Icon as={CircleCheck} size={16} className="text-green-500" /> : <Icon as={CircleAlert} size={16} className="text-red-500" />}</span>}
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
