const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')
const { materializeForUser } = require('../services/recurrence.service')
const { buildCompletedAtWhere } = require('../lib/timeMetrics')

const taskInclude = {
  project: true,
  createdBy: { select: { id: true, name: true } },
  _count: { select: { comments: true, files: { where: { file: { status: 'ready', deletedAt: null } } } } },
  sessions: { select: { startedAt: true, endedAt: true } },
  // Pieza de Contenido vinculada (si la tarea vino de "Enviar al dashboard") — alcanza con
  // el id para armar el deep-link a /contenido?projectId=&piece= desde TaskCard.
  contentPiece: { select: { id: true } },
  // Agentes IA: quién la ejecuta (tarea de agente) y qué agente la creó, con su nombre.
  agent: { select: { id: true, label: true } },
  createdByAgent: { select: { id: true, label: true } },
}

// Predicado "tarea visible/activa": no programada a futuro. Las tareas con scheduledFor
// posterior a hoy se ocultan del foco/backlog/carry-over hasta que llega su fecha.
const liveWhere = (today) => ({ OR: [{ scheduledFor: null }, { scheduledFor: { lte: today } }] })

// Las tareas de un proyecto desactivado dejan de verse en el dashboard (no se borran ni se
// tocan — reactivar el proyecto las vuelve a mostrar tal cual quedaron).
const activeProjectWhere = { project: { active: true } }

// Las tareas que ejecuta un agente (Task.isAgentTask) no son parte del foco de la
// persona: van aparte, en `agentTasks` (pestaña "Agentes" del Dashboard).
const humanWhere = { isAgentTask: false }

// Tareas de los agentes de la persona: todas las abiertas (incluidas las programadas a
// futuro, que el frontend separa por scheduledFor) + las completadas hoy.
function agentTasksQuery(userId, workspaceId, date, tz) {
  return prisma.task.findMany({
    where: {
      userId,
      isAgentTask: true,
      workDay: { workspaceId },
      ...activeProjectWhere,
      OR: [
        { status: { not: 'COMPLETED' } },
        { status: 'COMPLETED', completedAt: buildCompletedAtWhere(date, date, tz) },
      ],
    },
    include: taskInclude,
    orderBy: { createdAt: 'desc' },
  })
}

// Vista de SOLO LECTURA de la jornada de otra persona (ej. admin/bot consultando el
// día de otro miembro) — a propósito NO reusa el resto de getOrCreateToday: ese flujo
// crea el WorkDay si falta, lo REABRE si ya estaba cerrado (endedAt→null) y materializa
// tareas futuras/recurrentes — efectos secundarios que tienen sentido para el dueño de
// la jornada, pero serían un bug grave si los dispara quien solo está mirando. Acá, si
// no hay WorkDay hoy para esa persona, se devuelve "sin datos" sin crear nada.
async function getForeignToday(workspaceId, date, targetUserId, tz) {
  const workDay = await prisma.workDay.findUnique({
    where: { userId_workspaceId_date: { userId: targetUserId, workspaceId, date } },
  })
  if (!workDay) return { date, startedAt: null, endedAt: null, tasks: [], carryOverTasks: [], futureTasks: [], agentTasks: [] }

  const [tasks, carryOverTasks, futureTasks, agentTasks] = await Promise.all([
    prisma.task.findMany({
      where: { workDayId: workDay.id, ...humanWhere, ...liveWhere(date), ...activeProjectWhere },
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.task.findMany({
      where: {
        userId: targetUserId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] },
        workDay: { date: { lt: date }, workspaceId },
        ...humanWhere,
        ...liveWhere(date),
        ...activeProjectWhere,
      },
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.task.findMany({
      where: {
        userId: targetUserId,
        status: { not: 'COMPLETED' },
        scheduledFor: { gt: date },
        workDay: { workspaceId },
        ...humanWhere,
        ...activeProjectWhere,
      },
      include: taskInclude,
      orderBy: { scheduledFor: 'asc' },
    }),
    agentTasksQuery(targetUserId, workspaceId, date, tz),
  ])

  return { ...workDay, tasks, carryOverTasks, futureTasks, agentTasks }
}

async function getOrCreateToday(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const date = todayString(tz)

    // ?userId= ajeno = vista de solo lectura, admin/owner-only (mismo criterio que
    // Productividad/RRHH: ver la jornada de otra persona es dato sensible).
    const requestedUserId = req.query.userId ? Number(req.query.userId) : null
    if (requestedUserId && requestedUserId !== req.user.userId) {
      const isAdmin = req.workspaceMember.role === 'admin' || req.workspaceMember.role === 'owner'
      if (!isAdmin) return res.status(403).json({ error: 'Se requieren permisos de administrador para ver la jornada de otra persona' })
      const target = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: requestedUserId } },
      })
      if (!target) return res.status(404).json({ error: 'Usuario no encontrado en este workspace' })
      const view = await getForeignToday(workspaceId, date, requestedUserId, tz)
      return res.json(view)
    }

    const userId = req.user.userId
    const whereKey = { userId_workspaceId_date: { userId, workspaceId, date } }

    let workDay = await prisma.workDay.findUnique({ where: whereKey })
    // Vía MCP (el agente consultando la jornada): solo lectura, sin crear un WorkDay que
    // contaría como día presente en Asistencia ni materializar nada a nombre de la persona.
    if (!workDay && req.user.mcpTokenId) {
      return res.json(await getForeignToday(workspaceId, date, userId, tz))
    }
    if (!workDay) {
      try {
        workDay = await prisma.workDay.create({ data: { userId, workspaceId, date } })
      } catch (createErr) {
        if (createErr.code === 'P2002') {
          // Condición de carrera: otro request creó el registro entre el findUnique y el create.
          workDay = await prisma.workDay.findUnique({ where: whereKey })
        } else {
          throw createErr
        }
      }
    }

    // Reabrir la jornada cerrada solo si la abre la persona: que su agente (MCP,
    // req.user.mcpTokenId) consulte tasks_today no debe "re-loguearla".
    if (workDay?.endedAt && !req.user.mcpTokenId) {
      workDay = await prisma.workDay.update({
        where: whereKey,
        data: { endedAt: null, startedAt: new Date() },
      })
    }

    // Materializar tareas futuras/recurrentes: activar las que ya vencieron (enganchándolas
    // al workday de hoy) y generar la próxima ocurrencia de cada recurrencia. Aislado en su
    // propio try: un error de recurrencia no debe romper el dashboard.
    try {
      await materializeForUser(prisma, { userId, workspaceId, todayWorkDayId: workDay.id, today: date })
    } catch (matErr) {
      console.error('[Recurrence] Error materializando tareas:', matErr.message)
    }

    // Tareas de hoy (excluye futuras programadas y proyectos desactivados)
    const tasks = await prisma.task.findMany({
      where: { workDayId: workDay.id, ...humanWhere, ...liveWhere(date), ...activeProjectWhere },
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    })

    // Tareas de días anteriores aún activas en este workspace (excluye futuras y proyectos desactivados)
    const carryOverTasks = await prisma.task.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] },
        workDay: { date: { lt: date }, workspaceId },
        ...humanWhere,
        ...liveWhere(date),
        ...activeProjectWhere,
      },
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    })

    // Tareas futuras (programadas para más adelante) — sección "Futuras" del dashboard
    const futureTasks = await prisma.task.findMany({
      where: {
        userId,
        status: { not: 'COMPLETED' },
        scheduledFor: { gt: date },
        workDay: { workspaceId },
        ...humanWhere,
        ...activeProjectWhere,
      },
      include: taskInclude,
      orderBy: { scheduledFor: 'asc' },
    })

    const agentTasks = await agentTasksQuery(userId, workspaceId, date, tz)

    res.json({ ...workDay, tasks, carryOverTasks, futureTasks, agentTasks })
  } catch (err) { next(err) }
}

async function finish(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const date = todayString(tz)
    const now = new Date()

    // Auto-pausar la tarea IN_PROGRESS antes de cerrar la jornada — solo la humana:
    // cerrar el día de la persona no frena lo que están haciendo sus agentes.
    const activeTask = await prisma.task.findFirst({
      where: { userId, status: 'IN_PROGRESS', isAgentTask: false, workDay: { workspaceId } },
    })
    if (activeTask) {
      await prisma.$transaction([
        prisma.task.update({
          where: { id: activeTask.id },
          data: { status: 'PAUSED', pausedAt: now },
        }),
        prisma.taskSession.updateMany({
          where: { taskId: activeTask.id, endedAt: null },
          data: { endedAt: now },
        }),
      ])
    }

    const workDay = await prisma.workDay.update({
      where: { userId_workspaceId_date: { userId, workspaceId, date } },
      data: { endedAt: now },
    })
    res.json(workDay)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Jornada no encontrada' })
    next(err)
  }
}

module.exports = { getOrCreateToday, finish, agentTasksQuery }
