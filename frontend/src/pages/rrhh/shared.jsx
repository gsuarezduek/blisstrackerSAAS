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

// ─── Licencias ────────────────────────────────────────────────────────────────

export const LEAVE_TYPE_LABELS = {
  vacaciones: 'Vacaciones',
  estudio:    'Estudio / examen',
  maternidad: 'Maternidad',
  paternidad: 'Paternidad',
  enfermedad: 'Enfermedad / salud',
  duelo:      'Duelo familiar',
  mudanza:    'Mudanza',
  otro:       'Otro',
}

// Mismo catálogo que LEAVE_TYPE_LABELS, con emoji — para selects (ej. el formulario
// de "Solicitar días" de Mi Perfil). Única fuente: antes MyProfile.jsx mantenía su
// propia copia divergente.
export const LEAVE_TYPES = [
  { value: 'vacaciones',  label: '🏖️ Vacaciones' },
  { value: 'estudio',     label: '📚 Estudio / examen' },
  { value: 'maternidad',  label: '🤱 Maternidad' },
  { value: 'paternidad',  label: '👶 Paternidad' },
  { value: 'enfermedad',  label: '🏥 Enfermedad / salud' },
  { value: 'duelo',       label: '🕯️ Duelo familiar' },
  { value: 'mudanza',     label: '📦 Mudanza' },
  { value: 'otro',        label: '📝 Otro' },
]

// ─── Bancos de beneficios (horas libres / días home) ───────────────────────────
// Espejo del catálogo backend (backend/src/lib/benefitBanks.js). No son licencias
// legales — se otorgan a mano (premio de un juego, cobertura de un evento) y se
// consumen por autoservicio con aprobación (ver concepto "Beneficios" en RRHH).
export const BENEFIT_BANKS = {
  horas_libres: { label: 'Horas libres', unit: 'horas', icon: '⏱️', balanceField: 'freeHoursBalance' },
  dias_home:    { label: 'Días home',    unit: 'días',  icon: '🏠', balanceField: 'homeDaysBalance' },
}

// Cantidad de días de calendario que cubre una licencia (inclusivo de ambos extremos).
export function leaveDayCount(start, end) {
  const a = new Date(start + 'T12:00:00'), b = new Date(end + 'T12:00:00')
  return Math.round((b - a) / 86400000) + 1
}

// Rango de fechas legible: "5 de mar" o "5 – 9 mar 2026".
export function leaveRangeLabel(start, end) {
  const fmt = (d, opts) => new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { timeZone: TZ, ...opts })
  if (start === end) return fmt(start, { day: 'numeric', month: 'short', year: 'numeric' })
  return `${fmt(start, { day: 'numeric', month: 'short' })} – ${fmt(end, { day: 'numeric', month: 'short', year: 'numeric' })}`
}
