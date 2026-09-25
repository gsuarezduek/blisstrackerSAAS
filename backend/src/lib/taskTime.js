// Tiempo trabajado real de una tarea, en minutos, sumando los intervalos de TaskSession.
// Fuente de verdad única: las sesiones cerradas aportan (endedAt - startedAt); la sesión
// abierta cuenta hasta `now` solo si la tarea está EN CURSO. Inmune al drift de startedAt
// y a pausas/cron no registrados. Si la tarea no trae `sessions` (datos legacy), cae al
// cálculo viejo por startedAt/completedAt/pausedMinutes.
//
// Si la tarea está completada y se editó la duración a mano (`minutesOverride`), esa edición
// manda sobre las sesiones — igual que en Reportes/Productividad (`taskMins`).
//
// La query debe incluir `sessions: { select: { startedAt: true, endedAt: true } }`
// y `minutesOverride` para que respete la edición manual.
function taskWorkedMinutes(task, now = Date.now()) {
  if (task.status === 'COMPLETED' && task.minutesOverride != null) return task.minutesOverride

  const sessions = task.sessions
  if (Array.isArray(sessions) && sessions.length > 0) {
    let ms = 0
    for (const s of sessions) {
      const start = new Date(s.startedAt).getTime()
      let end
      if (s.endedAt) end = new Date(s.endedAt).getTime()
      else if (task.status === 'IN_PROGRESS') end = now
      else continue  // sesión abierta huérfana en tarea no activa: ignorar
      ms += Math.max(0, end - start)
    }
    return Math.round(ms / 60000)
  }

  // Fallback legacy
  if (!task.startedAt) return 0
  const endRef = task.completedAt
    ? new Date(task.completedAt).getTime()
    : (task.status === 'PAUSED' || task.status === 'BLOCKED') && task.pausedAt
      ? new Date(task.pausedAt).getTime()
      : now
  return Math.max(0, Math.round((endRef - new Date(task.startedAt).getTime()) / 60000) - (task.pausedMinutes || 0))
}

module.exports = { taskWorkedMinutes }
