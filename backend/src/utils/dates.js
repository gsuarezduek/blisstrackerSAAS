/**
 * Devuelve la fecha de hoy en formato "YYYY-MM-DD" en la timezone dada.
 * Por defecto usa America/Argentina/Buenos_Aires (compatibilidad con código existente).
 */
const DEFAULT_TZ = 'America/Argentina/Buenos_Aires'

function todayString(tz) {
  const safeZone = (tz && typeof tz === 'string' && tz.trim()) ? tz : DEFAULT_TZ
  return new Date().toLocaleDateString('en-CA', { timeZone: safeZone })
}

module.exports = { todayString }
