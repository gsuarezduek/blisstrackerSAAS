export function fmtMins(mins) {
  if (!mins || mins === 0) return '0m'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

const MAX_ACTIVE_MINS = 12 * 60  // cota de seguridad: 12h máximo para tareas en curso

// Active minutes worked on a task, excluding paused time
export function activeMinutes(task) {
  if (!task.startedAt) return 0
  const base = task.status === 'PAUSED' && task.pausedAt
    ? new Date(task.pausedAt) - new Date(task.startedAt)
    : Date.now()              - new Date(task.startedAt)
  const result = Math.max(0, Math.round(base / 60000) - (task.pausedMinutes || 0))
  // Si la tarea sigue EN CURSO y supera el máximo, es un zombie — cap para evitar valores absurdos
  return task.status === 'IN_PROGRESS' ? Math.min(result, MAX_ACTIVE_MINS) : result
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
