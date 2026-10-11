const prisma = require('./prisma')
const { todayString } = require('../utils/dates')
const { ensureWorkDay } = require('./projectMeetingLifecycle')

async function isActiveMember(workspaceId, userId) {
  const m = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId, active: true }, select: { userId: true } })
  return !!m
}

function taskDescription(task) {
  return task.detail ? `${task.title} (${task.detail})` : task.title
}

// Crea la Task en el dashboard del responsable de un FinanceTask y la vincula. No
// valida nada (el caller ya se aseguró de que el task tiene responsable, no tiene
// Task todavía, y el responsable es miembro activo del workspace) — mismo patrón
// que createDashboardTaskForTodo (ver projectMeetingLifecycle.js).
async function createDashboardTaskForFinanceTask(task, { projectId, workspaceId, tz, requesterId = null }) {
  const today = todayString(tz)
  const workDay = await ensureWorkDay(task.responsibleId, workspaceId, today)
  const created = await prisma.task.create({
    data: {
      description: taskDescription(task),
      projectId,
      userId: task.responsibleId,
      workDayId: workDay.id,
      createdById: requesterId && requesterId !== task.responsibleId ? requesterId : null,
    },
  })
  await prisma.financeTask.update({ where: { id: task.id }, data: { taskId: created.id } })
  if (requesterId !== task.responsibleId) {
    const desc = task.title.length > 60 ? task.title.slice(0, 57) + '...' : task.title
    await prisma.notification.create({
      data: {
        userId: task.responsibleId, actorId: requesterId, taskId: created.id, projectId, workspaceId,
        type: 'TASK_MENTION', message: `tenés una nueva tarea de Finanzas: "${desc}"`,
      },
    })
  }
  return created
}

// Mantiene la tarea del dashboard sincronizada cuando cambia el responsable de un
// FinanceTask (sección Pendientes): mismo criterio que syncDashboardOnOwnerChange de
// Reuniones, salvo que acá no hay "cierre" que dispare el primer envío — se manda
// apenas se asigna un responsable.
// - Sin Task todavía + nuevo responsable → la crea.
// - Con Task vinculada aún PENDING + cambia de responsable → la mueve al dashboard del nuevo.
// - Con Task vinculada aún PENDING + se le saca el responsable → se descarta (vuelve a "sin enviar").
// - Task ya iniciada/completada → no se toca (no se pierde lo ya trabajado).
async function syncDashboardOnResponsibleChange(task, { projectId, workspaceId, tz, requesterId }) {
  if (!task.taskId) {
    if (!task.responsibleId || !(await isActiveMember(workspaceId, task.responsibleId))) return task
    await createDashboardTaskForFinanceTask(task, { projectId, workspaceId, tz, requesterId })
    return prisma.financeTask.findUnique({ where: { id: task.id } })
  }

  const dashboardTask = await prisma.task.findUnique({ where: { id: task.taskId }, select: { id: true, status: true } })
  if (!dashboardTask || dashboardTask.status !== 'PENDING') return task

  if (!task.responsibleId) {
    await prisma.task.delete({ where: { id: dashboardTask.id } })
    return prisma.financeTask.findUnique({ where: { id: task.id } })
  }

  if (!(await isActiveMember(workspaceId, task.responsibleId))) return task

  const workDay = await ensureWorkDay(task.responsibleId, workspaceId, todayString(tz))
  await prisma.task.update({ where: { id: dashboardTask.id }, data: { userId: task.responsibleId, workDayId: workDay.id } })
  if (task.responsibleId !== requesterId) {
    const desc = task.title.length > 60 ? task.title.slice(0, 57) + '...' : task.title
    await prisma.notification.create({
      data: {
        userId: task.responsibleId, actorId: requesterId, taskId: dashboardTask.id, projectId, workspaceId,
        type: 'TASK_MENTION', message: `te asignaron una tarea de Finanzas: "${desc}"`,
      },
    })
  }
  return task
}

module.exports = { createDashboardTaskForFinanceTask, syncDashboardOnResponsibleChange, isActiveMember }
