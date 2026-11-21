// Helpers puros compartidos por los sub-componentes de la pestaña Web
// (WebAnalyticsTab, WebPerformanceTab, WebAnalyticsBlocks, PageSpeedSection,
// CrossProjectPanels) — extraídos de WebTab.jsx para no repetir fechas/formato
// entre los dos subtabs (Analytics/Performance).
import { Monitor, Smartphone, Tablet } from 'lucide-react'

export const PRESET_RANGES = [
  { value: 'thisMonth',  label: 'Este mes' },
  { value: 'lastMonth',  label: 'Mes anterior' },
  { value: '90daysAgo',  label: 'Últimos 90 días' },
  { value: 'custom',     label: 'Personalizado' },
]

export function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function getDateParams(range, customStart, customEnd) {
  const now       = new Date()
  const year      = now.getFullYear()
  const month     = now.getMonth() // 0-indexed

  if (range === 'thisMonth') {
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`
    return { startDate: start, endDate: todayStr() }
  }
  if (range === 'lastMonth') {
    const lm     = month === 0 ? 11 : month - 1
    const lmYear = month === 0 ? year - 1 : year
    const lastDay = new Date(lmYear, lm + 1, 0).getDate()
    const pad = n => String(n).padStart(2, '0')
    return {
      startDate: `${lmYear}-${pad(lm + 1)}-01`,
      endDate:   `${lmYear}-${pad(lm + 1)}-${pad(lastDay)}`,
    }
  }
  if (range === '90daysAgo') {
    return { startDate: '90daysAgo', endDate: 'today' }
  }
  // custom
  return { startDate: customStart || todayStr(), endDate: customEnd || todayStr() }
}

export function formatDateLabel(range, customStart, customEnd) {
  const { startDate, endDate } = getDateParams(range, customStart, customEnd)
  if (range === 'thisMonth')  return 'Este mes'
  if (range === 'lastMonth')  return 'Mes anterior'
  if (range === '90daysAgo')  return 'Últimos 90 días'
  const fmt = d => {
    if (!d || d === 'today' || d === 'yesterday') return d
    const [y, m, dd] = d.split('-')
    return `${dd}/${m}/${y}`
  }
  return `${fmt(startDate)} → ${fmt(endDate)}`
}

export const DEVICE_ICONS = { desktop: Monitor, mobile: Smartphone, tablet: Tablet }
export const CHANNEL_COLORS = [
  'bg-primary-500', 'bg-blue-500', 'bg-green-500',
  'bg-purple-500',  'bg-yellow-500', 'bg-pink-500',
  'bg-indigo-500',  'bg-teal-500',
]

export function fmt(n, decimals = 0) {
  if (n == null || n === '' || isNaN(n)) return '—'
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: decimals })
}
export function fmtDuration(seconds) {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${String(s).padStart(2, '0')}s`
}
export function pct(value, total) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

export function currentMonthStr() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}
export function prevMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}
// Mes que representa la selección actual (solo para opciones mensuales)
export function getActiveMonth(preset) {
  if (preset === 'thisMonth') return currentMonthStr()
  if (preset === 'lastMonth') return prevMonthStr(currentMonthStr())
  return null
}
export function deltaColor(delta, positivo) {
  if (delta == null) return 'text-gray-400'
  return positivo ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
}
export function deltaIcon(delta, positivo) {
  if (delta == null || delta === 0) return '—'
  const up = delta > 0
  return up ? '▲' : '▼'
}

// ─── Helpers de PageSpeed ─────────────────────────────────────────────────────

export const PS_SCORE_COLOR = score => {
  if (score == null) return 'text-gray-400'
  if (score >= 90)   return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 50)   return 'text-amber-500 dark:text-amber-400'
  return 'text-red-500 dark:text-red-400'
}
export const PS_SCORE_BG = score => {
  if (score == null) return 'bg-gray-100 dark:bg-gray-700'
  if (score >= 90)   return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
  if (score >= 50)   return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
  return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
}
export const RATING_DOT = rating => {
  if (rating === 'good')             return 'bg-emerald-500'
  if (rating === 'needs-improvement') return 'bg-amber-400'
  return 'bg-red-500'
}
export const METRIC_LABELS = {
  lcp:  { label: 'LCP',  title: 'Largest Contentful Paint' },
  fcp:  { label: 'FCP',  title: 'First Contentful Paint' },
  tbt:  { label: 'TBT',  title: 'Total Blocking Time' },
  cls:  { label: 'CLS',  title: 'Cumulative Layout Shift' },
  si:   { label: 'SI',   title: 'Speed Index' },
  ttfb: { label: 'TTFB', title: 'Time to First Byte' },
}

// ─── Qué arreglar: items de PageSpeed ───────────────────────────────

// Datos de campo (CrUX, usuarios reales de los últimos 28 días). Se muestran al lado del
// score de laboratorio porque responden preguntas distintas: el score es una simulación
// con red y CPU fijas, esto es lo que de verdad le pasó a la gente.
export const FIELD_METRIC_LABELS = {
  lcp:  { label: 'LCP',  title: 'Largest Contentful Paint (usuarios reales)',  unit: 'ms' },
  inp:  { label: 'INP',  title: 'Interaction to Next Paint (usuarios reales)', unit: 'ms' },
  cls:  { label: 'CLS',  title: 'Cumulative Layout Shift (usuarios reales)',   unit: '' },
  fcp:  { label: 'FCP',  title: 'First Contentful Paint (usuarios reales)',    unit: 'ms' },
  ttfb: { label: 'TTFB', title: 'Time to First Byte (usuarios reales)',        unit: 'ms' },
}

export function fmtFieldValue(key, value) {
  if (value == null) return '—'
  if (key === 'cls') return value.toFixed(2)
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`
}

export function fmtMs(ms) {
  if (!ms) return null
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`
}

export function fmtBytes(bytes) {
  if (!bytes) return null
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

// Una URL de recurso completa es ilegible en una fila de 3 líneas: lo que importa es el
// archivo y de qué host viene (un script de terceros vs uno propio).
export function shortResource(label) {
  if (!label) return ''
  try {
    const u = new URL(label)
    const file = u.pathname.split('/').filter(Boolean).pop() || u.pathname
    return `${file}  ·  ${u.host}`
  } catch {
    return label.length > 70 ? `${label.slice(0, 70)}…` : label
  }
}

// ─── CrossProject panels ──────────────────────────────────────────────────────

export function fmtK(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('es-AR')
}

export function fmtSnapshotDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

const SOURCE_COLORS = {
  google:    'bg-blue-500',
  facebook:  'bg-blue-700',
  instagram: 'bg-pink-500',
  email:     'bg-orange-500',
  direct:    'bg-gray-400',
  cpc:       'bg-purple-500',
  organic:   'bg-green-500',
}
export function sourceColor(source, medium) {
  if (medium === 'organic' || medium === 'organic search') return SOURCE_COLORS.organic
  if (medium === 'cpc' || medium === 'ppc')                 return SOURCE_COLORS.cpc
  if (medium === 'email')                                   return SOURCE_COLORS.email
  if (source === '(direct)')                                return SOURCE_COLORS.direct
  const key = source?.toLowerCase()
  return SOURCE_COLORS[key] ?? 'bg-indigo-400'
}
