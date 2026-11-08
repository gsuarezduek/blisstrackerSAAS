// ═══════════════════════════════════════════════════════════════════════════════
// SEO — helpers compartidos
// ═══════════════════════════════════════════════════════════════════════════════

export const fmtNum = n => (n ?? 0).toLocaleString('es-AR')
export const fmtPct = n => `${((n ?? 0) * 100).toFixed(1)}%`
export const fmtPos = n => n != null ? parseFloat(n).toFixed(1) : '—'

export function currentMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
export function prevMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}
export function nextMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const nm = m === 12 ? 1  : m + 1
  const ny = m === 12 ? y + 1 : y
  return `${ny}-${String(nm).padStart(2, '0')}`
}
export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${names[m - 1]} ${y}`
}

// ─── Domain Rating (Ahrefs) ───────────────────────────────────────────────────
// Banda de color por valor: ≥60 fuerte, ≥30 medio, <30 débil
export function drBand(dr) {
  if (dr == null)  return { text: 'text-gray-400',                    bg: 'bg-gray-300 dark:bg-gray-600',   label: 'Sin datos' }
  if (dr >= 60)    return { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500', label: 'Fuerte' }
  if (dr >= 30)    return { text: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-400',   label: 'Medio'  }
  return                  { text: 'text-red-600 dark:text-red-400',         bg: 'bg-red-500',     label: 'Débil'  }
}

// Pastilla del historial. Mismas bandas que drBand, con el fondo claro de las
// pastillas de Web → Performance (PS_SCORE_BG).
export function drPill(dr) {
  if (dr == null) return { text: 'text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600' }
  if (dr >= 60)   return { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' }
  if (dr >= 30)   return { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' }
  return                 { text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' }
}

export function fmtDateShort(d) {
  if (!d) return null
  try { return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return null }
}
