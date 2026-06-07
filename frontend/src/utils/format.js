export function fmtMins(mins) {
  if (!mins || mins === 0) return '0m'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

const MAX_ACTIVE_MINS = 12 * 60  // cota de seguridad: 12h máximo para tareas en curso

// Tiempo activo de una tarea en SEGUNDOS — fuente de verdad única para todas las vistas.
// Suma los intervalos reales de trabajo registrados en TaskSession: las sesiones cerradas
// aportan (endedAt - startedAt); la sesión abierta tickea hasta `now` solo si la tarea está
// EN CURSO. Esto es inmune al drift de startedAt y a pausas/cron no registrados.
// Si la tarea no trae `sessions` (datos legacy), cae al cálculo viejo por startedAt/pausedMinutes.
export function activeSeconds(task, now = Date.now()) {
  if (Array.isArray(task.sessions) && task.sessions.length > 0) {
    let secs = 0
    for (const s of task.sessions) {
      const start = new Date(s.startedAt).getTime()
      let end
      if (s.endedAt) end = new Date(s.endedAt).getTime()
      else if (task.status === 'IN_PROGRESS') end = now
      else continue  // sesión abierta huérfana en tarea no activa: ignorar (evita runaway)
      secs += Math.max(0, (end - start) / 1000)
    }
    return task.status === 'IN_PROGRESS' ? Math.min(secs, MAX_ACTIVE_MINS * 60) : secs
  }
  return legacyActiveSeconds(task, now)
}

// Cálculo legacy (tareas sin sesiones registradas): ahora − startedAt − pausedMinutes.
function legacyActiveSeconds(task, now) {
  if (!task.startedAt) return 0
  const base = task.status === 'PAUSED' && task.pausedAt
    ? new Date(task.pausedAt).getTime() - new Date(task.startedAt).getTime()
    : now                               - new Date(task.startedAt).getTime()
  const secs = Math.max(0, base / 1000 - (task.pausedMinutes || 0) * 60)
  return task.status === 'IN_PROGRESS' ? Math.min(secs, MAX_ACTIVE_MINS * 60) : secs
}

// Minutos activos de una tarea (excluye tiempo pausado). Derivado de activeSeconds.
export function activeMinutes(task, now = Date.now()) {
  return Math.round(activeSeconds(task, now) / 60)
}

// Formatea una duración en segundos como "Xh Ym" / "Xm Ys" / "Xs" (ticker en vivo).
export function fmtDuration(secs) {
  const total = Math.max(0, Math.floor(secs))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// Minutos efectivos de una tarea completada (usa minutesOverride si fue editado manualmente)
export function completedMinutes(task) {
  if (task.minutesOverride != null) return task.minutesOverride
  if (!task.startedAt || !task.completedAt) return null
  return Math.max(0, Math.round((new Date(task.completedAt) - new Date(task.startedAt)) / 60000) - (task.pausedMinutes || 0))
}

// Duration of a completed task as formatted string, or null
export function completedDuration(task) {
  const mins = completedMinutes(task)
  if (mins == null) return null
  return fmtMins(mins)
}

// Fracción de meses entre dos fechas "YYYY-MM-DD" (inclusive ambos extremos).
// Usa 30.4375 días/mes (365.25 / 12) para que la proporción sea estable.
export function monthsInRange(from, to) {
  if (!from || !to) return 1
  const d1 = new Date(`${from}T00:00:00Z`)
  const d2 = new Date(`${to}T00:00:00Z`)
  const days = Math.max(1, Math.round((d2 - d1) / 86400000) + 1)
  return days / 30.4375
}
