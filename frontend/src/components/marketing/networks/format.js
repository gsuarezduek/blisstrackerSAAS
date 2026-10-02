// Formateadores compartidos por las pestañas de redes y anuncios de Marketing
// (Instagram, TikTok, LinkedIn, Facebook, YouTube, Meta Ads, Google Ads).
// Antes cada pestaña tenía su copia; si cambiás un formato, cambia en todas.

export function fmtNum(n) {
  if (n == null) return '—'
  return n.toLocaleString('es-AR')
}

// Igual que fmtNum pero sin decimales (promedios: vistas/likes por video).
export function fmtInt(n) {
  if (n == null) return '—'
  return Math.round(n).toLocaleString('es-AR')
}

export function fmtK(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`
  return Math.round(n).toLocaleString('es-AR')
}

export function fmtUSD(n) {
  if (n == null || n === 0) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
}

export function fmtPct(n) {
  if (n == null) return '—'
  return `${Number(n).toFixed(2)}%`
}

// Umbrales de engagement: la mayoría de las redes usa 5% / 2%; Instagram 3% / 1%.
export const ENG_THRESHOLDS = { default: [5, 2], instagram: [3, 1] }

export function engColor(rate, [good, ok] = ENG_THRESHOLDS.default) {
  if (rate == null) return 'text-gray-400'
  if (rate >= good) return 'text-green-600 dark:text-green-400'
  if (rate >= ok)   return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

export function engLabel(rate, [good, ok] = ENG_THRESHOLDS.default) {
  if (rate == null) return null
  if (rate >= good) return 'Excelente'
  if (rate >= ok)   return 'Promedio'
  return 'Bajo'
}

export function subtractDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export function todayAR() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
    .toISOString().slice(0, 10)
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-')
  const label = new Date(Number(y), Number(m) - 1, 1)
    .toLocaleString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export const FOLLOWER_FILTERS = [
  { key: '7d',   label: '7 días',  days: 7   },
  { key: '30d',  label: '30 días', days: 30  },
  { key: '90d',  label: '3 meses', days: 90  },
  { key: '180d', label: '6 meses', days: 180 },
  { key: 'all',  label: 'Todo',    days: null },
]

// Modo de conexión de una integración, según ProjectIntegration:
// scopes 'scrape' = scraping (Apify); prefijo 'fb_graph' = token de Business
// Manager (Instagram/Facebook); en Meta Ads el token de BM guarda los mismos
// scopes que el login, pero nunca vence (expiresAt null). El resto = login oficial.
export function connectionMode(integration) {
  const s = integration?.scopes ?? ''
  if (s === 'scrape') return 'scrape'
  if (s.startsWith('fb_graph')) return 'token'
  if (integration?.type === 'meta_ads' && integration?.expiresAt === null) return 'token'
  return 'official'
}
