export const TZ = 'America/Argentina/Buenos_Aires'

export function todayBA() {
  const s = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function todayStr()    { return new Date().toLocaleDateString('en-CA', { timeZone: TZ }) }
export function thirtyDaysAgo() {
  const d = new Date(); d.setDate(d.getDate() - 30)
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}
export function fmtDate(isoDay) {
  return new Date(isoDay + 'T12:00:00').toLocaleDateString('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ,
  })
}
export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
}
export function fmtDateShort(iso) {
  // Usar T12:00:00 para evitar que UTC midnight se desplace al día anterior en UTC-3
  return new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}
export function minutesFromMidnight(iso) {
  const d = new Date(iso)
  const h = Number(d.toLocaleString('en-CA', { hour: 'numeric', hour12: false, timeZone: TZ }))
  const m = Number(d.toLocaleString('en-CA', { minute: 'numeric', timeZone: TZ }))
  return h * 60 + m
}
export function minsToTime(mins) {
  const r = Math.round(mins)              // redondear el total primero evita "08:60" por minutos fraccionarios
  const h = Math.floor(r / 60), m = r % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Días hasta la próxima ocurrencia de un mes/día (sin importar el año)
export function daysUntilNextOccurrence(month0, day) {
  const today = todayBA()
  let next = new Date(today.getFullYear(), month0, day)
  if (next < today) next = new Date(today.getFullYear() + 1, month0, day)
  return Math.round((next - today) / 86400000)
}

export function relativeDay(days) {
  if (days === 0) return 'hoy'
  if (days === 1) return 'mañana'
  return `en ${days} días`
}

// ─── Mini Dashboard ───────────────────────────────────────────────────────────

export function StatCard({ icon, label, value, sub, onClick }) {
  const clickable = typeof onClick === 'function'
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4 ${
        clickable ? 'cursor-pointer hover:border-primary-300 dark:hover:border-primary-600 transition-colors' : ''
      }`}
    >
      <span className="text-2xl flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
          {label}
          {clickable && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-gray-300 dark:text-gray-600">
              <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM9 9a1 1 0 0 0 0 2v3a1 1 0 0 0 1 1h1a1 1 0 1 0 0-2v-3a1 1 0 0 0-1-1H9Zm1-4a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
            </svg>
          )}
        </p>
        {sub && <p className="text-xs text-primary-600 dark:text-primary-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// Banda de color por porcentaje (compartida por People Score y "correctas en el asiento"):
// <40% rojo · 40–70% amarillo · >70% verde. null = sin evaluar (gris).
