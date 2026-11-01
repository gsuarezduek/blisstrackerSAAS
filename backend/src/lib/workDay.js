// Jornada laboral (WorkDay) — un solo lugar para "conseguir la jornada de una fecha" y
// para "re-alojar una tarea arrastrada en la jornada de hoy". Ver conceptos "WorkDay" y
// "Dashboard" en CLAUDE.md.

const { todayString } = require('../utils/dates')

// WorkDay de una persona en una fecha ("YYYY-MM-DD"), creándolo si falta. Tolera la
// condición de carrera de dos requests simultáneos (P2002 → se queda con el que ganó).
// Devuelve null solo si ni el create ni el findUnique posterior consiguieron la fila.
async function getOrCreateWorkDay(prisma, { userId, workspaceId, date }) {
  const key = { userId_workspaceId_date: { userId, workspaceId, date } }
  const existing = await prisma.workDay.findUnique({ where: key })
  if (existing) return existing
  try {
    return await prisma.workDay.create({ data: { userId, workspaceId, date } })
  } catch (err) {
    if (err.code === 'P2002') return prisma.workDay.findUnique({ where: key })
    throw err
  }
}

// Una tarea que se arrastró de días anteriores sigue colgada del WorkDay del día en que
// se creó, y las consultas de "hoy" del Dashboard filtran por workDayId: `tasks` trae las
// de la jornada de hoy y `carryOverTasks` solo las ABIERTAS de días previos. Sin re-alojar,
// una tarea de ayer que la persona trabaja y completa hoy se cae de las dos listas (ya no
// está abierta, y su workDay es el de ayer) y no suma al "N completadas · Xh registradas"
// del día ni aparece en la pestaña Completadas — aunque Reportes/Productividad sí la
// cuenten hoy, porque bucketean por completedAt. Así que cada vez que la persona vuelve a
// poner manos sobre una tarea arrastrada (iniciar / retomar / desbloquear / completar), la
// tarea pasa a la jornada de HOY: el día en que se trabajó es el día que la cuenta.
//
// Devuelve `{ workDayId }` para mezclar en el `data` del update, o `{}` si no hay nada que
// mover (ya está en hoy, o no se pudo conseguir la jornada — en ese caso se deja como está
// antes que frenar la acción del usuario).
//
// Las tareas de agente quedan afuera a propósito: su panel no filtra por fecha de jornada
// (agentTasksQuery scopea solo por workspace) y crear el WorkDay de hoy a nombre de la
// persona desde una tool de MCP abriría una jornada que no abrió ella — justo lo que evita
// la regla de presencia de `lib/agentTasks.js`.
async function rehomeToTodayData(prisma, task, { workspaceId, tz }) {
  if (task.isAgentTask) return {}
  const date = todayString(tz)
  if (!task.workDay?.date || task.workDay.date >= date) return {}
  const workDay = await getOrCreateWorkDay(prisma, { userId: task.userId, workspaceId, date })
  return workDay ? { workDayId: workDay.id } : {}
}

module.exports = { getOrCreateWorkDay, rehomeToTodayData }
