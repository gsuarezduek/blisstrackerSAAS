// Helpers puros (sin JSX) de la pestaña Keywords de Marketing — países,
// formato de números/posiciones, colores del heatmap y export a CSV.
// Compartidos por KeywordsTab y los subcomponentes en components/marketing/keywords/.

// ─── Países disponibles (ISO 3166-1 alpha-3 lowercase) ────────────────────────

export const COUNTRIES = [
  { code: 'arg', label: 'Argentina' },
  { code: 'mex', label: 'México' },
  { code: 'col', label: 'Colombia' },
  { code: 'esp', label: 'España' },
  { code: 'chl', label: 'Chile' },
  { code: 'per', label: 'Perú' },
  { code: 'ury', label: 'Uruguay' },
  { code: 'bra', label: 'Brasil' },
  { code: 'usa', label: 'EE.UU.' },
  { code: 'all', label: 'Global (todos)' },
]

export const countryLabel = code => COUNTRIES.find(c => c.code === code)?.label ?? code.toUpperCase()

// ─── Helpers de formato ───────────────────────────────────────────────────────

export const fmtPos = n => (n != null && n > 0) ? n.toFixed(1) : '—'
export const fmtNum = n => (n ?? 0).toLocaleString('es-AR')
export const fmtPct = n => `${((n ?? 0) * 100).toFixed(1)}%`

export function currentMonthStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ─── SERP Features ────────────────────────────────────────────────────────────

export const SERP_FEATURE_LABELS = {
  featured_snippet: { label: 'Featured Snippet', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  ai_overview:      { label: 'AI Overview',       color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  local_pack:       { label: 'Local Pack',         color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  shopping_results: { label: 'Shopping',           color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  knowledge_graph:  { label: 'Knowledge Graph',   color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300' },
  people_also_ask:  { label: 'People Also Ask',   color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  top_stories:      { label: 'Noticias',           color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  images:           { label: 'Imágenes',           color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300' },
  videos:           { label: 'Videos',             color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300' },
  site_links:       { label: 'Sitelinks',          color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
}

// ─── Heatmap de keywords ──────────────────────────────────────────────────────

const HM_COLORS = {
  top3:   'bg-green-500 text-white',
  top10:  'bg-blue-500 text-white',
  top20:  'bg-yellow-400 text-gray-900',
  below:  'bg-red-400 text-white',
  noData: 'bg-gray-100 dark:bg-gray-700 text-gray-400',
}

export function heatmapColor(position) {
  if (position == null || position <= 0) return HM_COLORS.noData
  if (position <= 3)  return HM_COLORS.top3
  if (position <= 10) return HM_COLORS.top10
  if (position <= 20) return HM_COLORS.top20
  return HM_COLORS.below
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

export function exportCsv(keywords) {
  const header = 'query,posición,delta,clicks,impresiones,CTR'
  const rows   = keywords.map(kw => [
    `"${kw.query}"`,
    kw.currentPosition != null ? kw.currentPosition.toFixed(1) : '',
    kw.delta != null ? kw.delta.toFixed(1) : '',
    kw.clicks ?? 0,
    kw.impressions ?? 0,
    kw.ctr != null ? `${(kw.ctr * 100).toFixed(1)}%` : '',
  ].join(','))
  const csv  = [header, ...rows].join('\n')
  const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `keywords-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
