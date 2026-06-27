// Helpers compartidos de asistencia: ventana de llegada (±2h) y días laborables (regla del 50%).
// Usados por el controller de RRHH, el servicio de productividad y los snapshots mensuales,
// para que el criterio de "qué cuenta como un día de trabajo / una llegada" sea uno solo.

// Minutos desde medianoche de un ISO en la timezone dada.
function loginMinsFromMidnight(iso, tz) {
  const d = new Date(iso)
  const h = Number(d.toLocaleString('en-CA', { hour: 'numeric', hour12: false, timeZone: tz }))
  const m = Number(d.toLocaleString('en-CA', { minute: 'numeric', timeZone: tz }))
  return h * 60 + m
}

// Ventana de llegada alrededor del horario de inicio: ±2 horas.
// Un login fuera de [inicio−2h, inicio+2h] NO se considera "llegada" del día (es ruido: una
// conexión de domingo a la tarde, un chequeo nocturno, etc.) y se ignora por completo para el
// promedio de ingreso, la puntualidad y las tardanzas. Esto evita que esas conexiones sueltas
// distorsionen el horario promedio del equipo.
const ARRIVAL_WINDOW_MINS = 120

// ¿El login (en minutos desde medianoche) cae dentro de la ventana de llegada?
// startMins == null (persona sin horario configurado) → no hay referencia: devuelve true,
// no se filtra a quien no tiene horario (se conserva el comportamiento previo para freelancers).
function inArrivalWindow(loginMins, startMins, windowMins = ARRIVAL_WINDOW_MINS) {
  if (startMins == null) return true
  return loginMins >= startMins - windowMins && loginMins <= startMins + windowMins
}

// Map<day('YYYY-MM-DD'), Set<userId>> de quién se logueó cada día (en la TZ del workspace).
function loginsByDay(logins, tz) {
  const map = new Map()
  for (const l of logins) {
    const day = new Date(l.loginAt).toLocaleDateString('en-CA', { timeZone: tz })
    if (!map.has(day)) map.set(day, new Set())
    map.get(day).add(l.userId)
  }
  return map
}

// Días laborables del período: un día cuenta solo si MÁS del 50% del equipo activo se logueó
// ese día. Excluye fines de semana y feriados sin necesidad de un calendario, y normaliza la
// cantidad de días para todo el equipo (todos miden contra la misma base de días). Devuelve Set<day>.
// `logins` debe contener solo logins de miembros activos; `activeMemberCount` es el denominador.
function laborableDays(logins, activeMemberCount, tz, threshold = 0.5) {
  const set = new Set()
  if (!activeMemberCount) return set
  for (const [day, users] of loginsByDay(logins, tz)) {
    if (users.size / activeMemberCount > threshold) set.add(day)
  }
  return set
}

module.exports = { loginMinsFromMidnight, ARRIVAL_WINDOW_MINS, inArrivalWindow, loginsByDay, laborableDays }
