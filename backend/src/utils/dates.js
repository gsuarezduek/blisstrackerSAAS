/**
 * Devuelve la fecha de hoy en formato "YYYY-MM-DD" en la timezone dada.
 * Por defecto usa America/Argentina/Buenos_Aires (compatibilidad con código existente).
 */
function todayString(tz = 'America/Argentina/Buenos_Aires') {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz })
}

module.exports = { todayString }
