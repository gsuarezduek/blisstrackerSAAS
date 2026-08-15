/**
 * Devuelve la fecha de hoy en formato "YYYY-MM-DD" en la timezone dada.
 * Por defecto usa America/Argentina/Buenos_Aires (compatibilidad con código existente).
 */
const DEFAULT_TZ = 'America/Argentina/Buenos_Aires'

function todayString(tz) {
  return dateStringInTz(new Date(), tz)
}

/**
 * Convierte un Date (instante UTC) a "YYYY-MM-DD" en la timezone dada.
 * Lo usa el módulo Contenido para denormalizar ContentPiece.scheduledDate y que
 * el calendario agrupe por día sin hacer aritmética de zona horaria en el cliente.
 * Devuelve null si la fecha no es válida.
 */
function dateStringInTz(date, tz) {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return null
  const safeZone = (tz && typeof tz === 'string' && tz.trim()) ? tz : DEFAULT_TZ
  return d.toLocaleDateString('en-CA', { timeZone: safeZone })
}

module.exports = { todayString, dateStringInTz, DEFAULT_TZ }
