import { useState } from 'react'

function fmtK(n) {
  if (n == null) return '—'
  const neg = n < 0
  const abs = Math.abs(n)
  let s
  if (abs >= 1_000_000) s = `${(abs / 1_000_000).toFixed(1)}M`
  else if (abs >= 10_000) s = `${(abs / 1_000).toFixed(1)}K`
  else s = abs.toLocaleString('es-AR')
  return neg ? `-${s}` : s
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-').map(Number)
  if (!day) return d.slice(0, 7)
  return `${day} ${MONTHS_SHORT[m - 1]}`
}

// Opciones de orden, compartidas entre Instagram y TikTok.
const SORTS = [
  { key: 'newFollowers',   label: 'Nuevos del mes',        get: p => p.newFollowers,                  fmt: v => v == null ? '—' : `${v >= 0 ? '+' : ''}${fmtK(v)}` },
  { key: 'followers',      label: 'Seguidores totales',    get: p => p.followersCount,                fmt: v => fmtK(v) },
  { key: 'interactions',   label: 'Interacción del mes',   get: p => p.interactions,                  fmt: v => v == null ? '—' : fmtK(v) },
  { key: 'objSeguidores',  label: 'Objetivo · seguidores', get: p => p.objectives?.seguidores?.pct,   fmt: v => v == null ? 'Sin objetivo' : `${v}%`, pct: true },
  { key: 'objInteraccion', label: 'Objetivo · interacción',get: p => p.objectives?.interaccion?.pct,  fmt: v => v == null ? 'Sin objetivo' : `${v}%`, pct: true },
]

function sortRows(rows, sort) {
  return [...rows].sort((a, b) => {
    const va = sort.get(a), vb = sort.get(b)
    if (va == null && vb == null) return (b.followersCount ?? 0) - (a.followersCount ?? 0)
    if (va == null) return 1   // sin dato → al fondo
    if (vb == null) return -1
    return vb - va
  })
}

function pctBarColor(v) {
  if (v == null) return 'bg-gray-300 dark:bg-gray-600'
  if (v >= 100)  return 'bg-green-500'
  if (v >= 70)   return 'bg-yellow-500'
  return 'bg-red-500'
}

/**
 * Panel cross-proyecto de una red (Instagram / TikTok) con orden configurable.
 * @param {object[]} data         filas del endpoint /summary/<red>
 * @param {string}   gradient     CSS background del relleno de barra para órdenes no-%
 * @param {string}   accentColor  color del spinner / acentos
 * @param {function} renderSecondary  (p) => JSX con stats secundarias de la fila
 * @param {string}   title        encabezado del panel
 * @param {function} onSelectProject
 */
export default function CrossProjectRRSSPanel({ data, gradient, renderSecondary, title, onSelectProject }) {
  const [sortKey, setSortKey] = useState('newFollowers')
  const sort = SORTS.find(s => s.key === sortKey) || SORTS[0]

  const rows = sortRows(data, sort)
  const isPct = !!sort.pct
  const maxVal = isPct ? 100 : Math.max(1, ...data.map(p => sort.get(p) ?? 0))

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {title} ({data.length})
        </h3>
        <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          Ordenar por
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <div className="space-y-3">
        {rows.map(p => {
          const val   = sort.get(p)
          const width = isPct
            ? (val == null ? 0 : Math.max(0, Math.min(100, val)))
            : (val != null && val > 0 ? Math.round((val / maxVal) * 100) : 0)
          return (
            <div key={p.projectId} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <button
                    onClick={() => onSelectProject?.(String(p.projectId))}
                    className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                  >
                    {p.projectName}
                  </button>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    <span className="text-xs text-gray-400">{fmtDate(p.lastDataDate)}</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{sort.fmt(val)}</span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                  {isPct
                    ? <div className={`h-1.5 rounded-full ${pctBarColor(val)}`} style={{ width: `${width}%` }} />
                    : <div className="h-1.5 rounded-full" style={{ width: `${width}%`, background: gradient }} />}
                </div>
                <div className="flex gap-3 mt-1 text-xs flex-wrap">
                  {renderSecondary(p)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
