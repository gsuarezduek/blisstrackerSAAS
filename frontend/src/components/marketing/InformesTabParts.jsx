// ─── Helpers de mes ─────────────────────────────────────────────────────────

export function currentMonthStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function prevMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}

export function nextMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const nm = m === 12 ? 1 : m + 1
  const ny = m === 12 ? y + 1 : y
  return `${ny}-${String(nm).padStart(2, '0')}`
}

export function monthLabel(month) {
  if (!month) return ''
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

// ─── Helpers de rango de fechas (selector de período del informe) ──────────────
export const pad2 = n => String(n).padStart(2, '0')
export function monthFirstDay(month) { return `${month}-01` }
export function monthLastDay(month) {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${pad2(new Date(y, m, 0).getDate())}`
}
export function todayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
export function dmy(ymd) {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

// Banda de color del % de cumplimiento de objetivos (mismo criterio de 3 bandas
// usado en otros lados de Marketing: ≥80 bien, ≥50 parcial, <50 mal).
export function objPctBand(pct) {
  if (pct == null) return 'text-gray-300 dark:text-gray-600'
  if (pct >= 80) return 'text-emerald-600 dark:text-emerald-400'
  if (pct >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

// Catálogo de secciones (las claves coinciden con sections del backend / ReportViewer)
export const SECTION_CATALOG = [
  { key: 'objectives',      label: 'Objetivos',             icon: '🎯' },
  { key: 'analytics',       label: 'Analítica web (GA4)',  icon: '📊' },
  { key: 'performance',     label: 'Performance web',       icon: '⚡' },
  { key: 'geo',             label: 'Presencia en IA (GEO)', icon: '🤖' },
  { key: 'seo',             label: 'Rendimiento del sitio (Search Console)', icon: '🔍' },
  { key: 'keywords',        label: 'Posicionamiento SEO (keywords)',         icon: '🔑' },
  { key: 'instagram',       label: 'Instagram',             icon: '📸' },
  { key: 'tiktok',          label: 'TikTok',                icon: '🎵' },
  { key: 'youtube',         label: 'YouTube',               icon: '▶️' },
  { key: 'linkedin',        label: 'LinkedIn',              icon: '💼' },
  { key: 'facebook',        label: 'Facebook',              icon: '👍' },
  { key: 'metaAds',         label: 'Meta Ads',              icon: '📣' },
  { key: 'googleAds',       label: 'Google Ads',            icon: '🔎' },
  { key: 'competitors',     label: 'Competidores',          icon: '🏁' },
  { key: 'tasks',           label: 'Trabajo realizado',     icon: '✅' },
]

// Chip de estado de conexión de la integración de una sección
export function IntegrationChip({ integration }) {
  if (!integration) return null
  if (integration === 'active') {
    return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">● Conectado</span>
  }
  if (integration === 'expired') {
    return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">● Desconectado</span>
  }
  // missing: no hay integración pero existen datos históricos guardados
  return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Datos guardados</span>
}

export function StatCard({ icon, label, value, sub, accent = 'text-gray-900 dark:text-white' }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <p className={`mt-1.5 text-2xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Helpers de UI compartidos: buscador con lupa + insignia de destacado ──────

export function SearchIcon({ className = 'w-4 h-4' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Buscar proyecto…', className = 'w-52' }) {
  return (
    <div className={`relative ${className}`}>
      <SearchIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </div>
  )
}

// Estrella llena — mismo ícono/color que "Mis Proyectos" (favoritos), solo lectura acá.
export function StarBadge({ className = 'w-4 h-4' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" title="Proyecto destacado" className={`${className} text-yellow-400 flex-shrink-0`}>
      <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L10 18.354 5.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.005z" clipRule="evenodd" />
    </svg>
  )
}

export function StarRow({ value, size = 14 }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map(n => {
        const on = n <= Math.round(value)
        return (
          <svg key={n} width={size} height={size} viewBox="0 0 24 24" fill={on ? '#f59e0b' : 'none'} stroke={on ? '#f59e0b' : '#cbd5e1'} strokeWidth="1.6" strokeLinejoin="round">
            <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.9l-5.8 3.06 1.1-6.47L2.6 9.35l6.5-.95L12 2.5z" />
          </svg>
        )
      })}
    </span>
  )
}
