import { useState, useEffect } from 'react'
import api from '../../api/client'

// Panel cross-proyecto de inversión publicitaria, compartido por GoogleAdsTab y
// MetaAdsTab (antes duplicado casi entero entre los dos) — se usa cuando no hay un
// proyecto seleccionado, para ver todas las cuentas conectadas juntas.
//
// Suma sobre la versión original:
//  - "Ordenar por" (gasto/clics/impresiones/conversiones/CTR/% de objetivo/nombre) +
//    dirección (menor→mayor / mayor→menor / A-Z).
//  - Colores rojo/verde en cada métrica según `prev` (mismo tramo del período
//    INMEDIATO ANTERIOR, calculado en el backend — ver `previousRangeFor` en
//    adsSummary.controller.js) para detectar de un vistazo qué proyecto empeoró.
//  - Destacados (`starred`, mismo ProjectStar de "Mis Proyectos") agrupados aparte y
//    arriba, ordenados con el MISMO criterio que el resto — nunca se mezclan entre sí.

function fmtK(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('es-AR')
}

function fmtUSD(n) {
  if (n == null || n === 0) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
}

function fmtPct(n) {
  if (n == null) return '—'
  return `${Number(n).toFixed(2)}%`
}

const CROSS_PERIODS = [
  { key: 'today',      label: 'Hoy' },
  { key: 'this_week',  label: 'Esta semana' },
  { key: 'this_month', label: 'Este mes' },
  { key: 'last_month', label: 'Mes anterior' },
]

const SORT_OPTIONS = [
  { key: 'spend',        label: 'Presupuesto gastado' },
  { key: 'clicks',       label: 'Clics' },
  { key: 'impressions',  label: 'Impresiones' },
  { key: 'conversions',  label: 'Conversiones' },
  { key: 'ctr',          label: 'CTR' },
  { key: 'objectivePct', label: '% de crédito gastado' },
  { key: 'name',         label: 'Nombre' },
]

function objectiveBarCls(pct) {
  if (pct == null) return 'bg-indigo-400'
  return pct > 100 ? 'bg-amber-500' : 'bg-indigo-400'
}

// Badge de progreso del objetivo de inversión configurado (independiente del filtro de
// período elegido arriba — siempre representa el mes/trimestre/año actual).
function ObjectiveBadge({ objective }) {
  if (!objective || objective.pct == null) return null
  const barPct = Math.max(0, Math.min(100, objective.pct))
  return (
    <div
      className="mt-1.5 flex items-center gap-2"
      title={`Objetivo de inversión (${objective.periodLabel}): ${fmtUSD(objective.actual)} de ${fmtUSD(objective.target)}`}
    >
      <span className="text-[10px] text-gray-400 flex-shrink-0">🎯 objetivo</span>
      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1">
        <div className={`h-1 rounded-full ${objectiveBarCls(objective.pct)}`} style={{ width: `${barPct}%` }} />
      </div>
      <span className={`text-[10px] font-semibold tabular-nums flex-shrink-0 ${objective.pct > 100 ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
        {objective.pct}%
      </span>
    </div>
  )
}

// Clase de color según si `cur` subió/bajó respecto a `prev` — sin juicio de si "más" es
// bueno o malo (para gasto no siempre lo es), es simplemente una señal de cambio para
// que el equipo lo revise, tal como se pidió.
function trendCls(cur, prev) {
  if (cur == null || prev == null) return ''
  if (cur > prev) return 'text-green-600 dark:text-green-400'
  if (cur < prev) return 'text-red-600 dark:text-red-400'
  return ''
}

function trendArrow(cur, prev) {
  if (cur == null || prev == null) return ''
  if (cur > prev) return '▲'
  if (cur < prev) return '▼'
  return ''
}

function TrendChip({ value, prevValue, fmt }) {
  const arrow = trendArrow(value, prevValue)
  return (
    <span className={trendCls(value, prevValue)}>
      {fmt(value)}{arrow && <span className="ml-0.5">{arrow}</span>}
    </span>
  )
}

function metricValue(row, sortKey) {
  if (sortKey === 'name') return (row.projectName || '').toLowerCase()
  if (sortKey === 'objectivePct') return row.objective?.pct ?? null
  const v = row[sortKey]
  return v == null ? null : v
}

// Las filas "caídas" (desconectadas/con error) no tienen métricas comparables — quedan
// siempre al final de su grupo (destacados o resto), sin importar el criterio de orden.
function compareRows(a, b, sortKey, sortDir) {
  const aDown = a.status && a.status !== 'ok'
  const bDown = b.status && b.status !== 'ok'
  if (aDown !== bDown) return aDown ? 1 : -1

  const av = metricValue(a, sortKey)
  const bv = metricValue(b, sortKey)
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1

  if (sortKey === 'name') {
    return sortDir === 'asc' ? av.localeCompare(bv, 'es') : bv.localeCompare(av, 'es')
  }
  return sortDir === 'asc' ? av - bv : bv - av
}

function ProjectRow({ p, onSelectProject, maxSpend, down }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={() => onSelectProject?.(String(p.projectId))}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 truncate hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
          >
            {p.starred && <span className="text-amber-400 flex-shrink-0">★</span>}
            <span className="truncate">{p.projectName}</span>
          </button>
          <div className="flex items-center gap-3 flex-shrink-0 ml-2">
            {down ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" title={p.status === 'error' ? p.error : 'La integración se desconectó o venció. Reconectala desde el proyecto.'}>
                ⚠ {p.status === 'error' ? 'Error' : 'Desconectado'}
              </span>
            ) : (
              <>
                {p.month && <span className="text-xs text-gray-400">{p.month}</span>}
                <span className={`text-sm font-bold tabular-nums ${trendCls(p.spend, p.prev?.spend) || 'text-gray-900 dark:text-white'}`}>
                  {fmtUSD(p.spend)}{trendArrow(p.spend, p.prev?.spend) && <span className="ml-0.5 text-xs">{trendArrow(p.spend, p.prev?.spend)}</span>}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
          <div className={`h-1.5 rounded-full ${down ? 'bg-red-300 dark:bg-red-800' : 'bg-primary-400'}`} style={{ width: down ? '100%' : `${Math.round((p.spend / maxSpend) * 100)}%` }} />
        </div>
        {!down && (
          <div className="flex gap-3 mt-1 text-xs text-gray-400 dark:text-gray-500">
            {p.impressions > 0 && <span><TrendChip value={p.impressions} prevValue={p.prev?.impressions} fmt={v => `${fmtK(v)} imp.`} /></span>}
            {p.clicks > 0 && <span><TrendChip value={p.clicks} prevValue={p.prev?.clicks} fmt={v => `${fmtK(v)} clics`} /></span>}
            {p.conversions > 0 && <span><TrendChip value={p.conversions} prevValue={p.prev?.conversions} fmt={v => `${Number(v).toFixed(1)} conv.`} /></span>}
            {p.ctr > 0 && <span><TrendChip value={p.ctr} prevValue={p.prev?.ctr} fmt={fmtPct} /></span>}
            {p.reach > 0 && <span>{fmtK(p.reach)} alcance</span>}
          </div>
        )}
        {!down && <ObjectiveBadge objective={p.objective} />}
      </div>
    </div>
  )
}

function ProjectGroup({ title, rows, onSelectProject, maxSpend, isLive }) {
  if (!rows.length) return null
  return (
    <section>
      {title && (
        <h4 className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">{title}</h4>
      )}
      <div className="space-y-3">
        {rows.map(p => (
          <ProjectRow key={p.projectId} p={p} onSelectProject={onSelectProject} maxSpend={maxSpend} down={isLive && p.status !== 'ok'} />
        ))}
      </div>
    </section>
  )
}

export default function CrossProjectAdsPanel({ type, label, icon, emptyIcon, activeBtnClass, spinnerBorderClass, onSelectProject }) {
  const [period,  setPeriod]  = useState('this_month')
  const [sortKey, setSortKey] = useState('spend')
  const [sortDir, setSortDir] = useState('desc')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const isLive = period !== 'last_month'

  useEffect(() => {
    setLoading(true)
    const req = isLive
      ? api.get(`/marketing/summary/ads-live?type=${type}&period=${period}`).then(r => r.data.results)
      : api.get(`/marketing/summary/ads?type=${type}`).then(r => r.data)
    req.then(rows => setData(rows)).catch(() => setData([])).finally(() => setLoading(false))
  }, [type, period, isLive])

  const rows = data || []
  const okRows = isLive ? rows.filter(p => p.status === 'ok') : rows
  const periodDesc = { today: 'hoy, en vivo', this_week: 'esta semana, en vivo', this_month: 'este mes, en vivo', last_month: 'último snapshot cerrado' }[period]

  function toggleSortDir() {
    setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
  }

  const dirLabel = sortKey === 'name'
    ? (sortDir === 'asc' ? 'A → Z' : 'Z → A')
    : (sortDir === 'asc' ? '↑ Menor a mayor' : '↓ Mayor a menor')

  const starredRows = rows.filter(p => p.starred).sort((a, b) => compareRows(a, b, sortKey, sortDir))
  const restRows    = rows.filter(p => !p.starred).sort((a, b) => compareRows(a, b, sortKey, sortDir))
  const maxSpend    = Math.max(...okRows.map(p => p.spend), 1)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {icon} {label} por proyecto {data && `(${rows.length})`} <span className="font-normal text-gray-400">· {periodDesc}</span>
        </h3>
        <div className="flex text-xs rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden flex-shrink-0">
          {CROSS_PERIODS.map(o => (
            <button
              key={o.key}
              onClick={() => setPeriod(o.key)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                period === o.key
                  ? activeBtnClass
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap text-xs">
        <span className="text-gray-500 dark:text-gray-400">Ordenar por:</span>
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value)}
          className="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"
        >
          {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <button
          onClick={toggleSortDir}
          className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
        >
          {dirLabel}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className={`w-6 h-6 border-2 ${spinnerBorderClass} border-t-transparent rounded-full animate-spin`} /></div>
      ) : !rows.length ? (
        <div className="text-center py-10">
          <div className="text-4xl mb-3">{emptyIcon}</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isLive
              ? `Todavía no hay proyectos con ${label} conectado.`
              : `Todavía no hay snapshots de ${label}. Los snapshots se guardan el primer día de cada mes, o podés guardar uno manualmente desde dentro del proyecto.`}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <ProjectGroup title={starredRows.length ? '★ Destacados' : null} rows={starredRows} onSelectProject={onSelectProject} maxSpend={maxSpend} isLive={isLive} />
          <ProjectGroup title={starredRows.length ? 'Resto de los proyectos' : null} rows={restRows} onSelectProject={onSelectProject} maxSpend={maxSpend} isLive={isLive} />
        </div>
      )}
    </div>
  )
}
