const prisma = require('../../lib/prisma')
const { todayString } = require('../../utils/dates')
const { materializeForUser } = require('../../services/recurrence.service')
const { taskInclude, requestAgentId, assertOwnAgent } = require('./_shared')

// Agentes IA (MCP) — ver concepto "Agentes IA" en backend/CLAUDE.md.
// Una tarea de agente (Task.isAgentTask) la EJECUTA un agente; userId sigue siendo la
// persona responsable. agentId = qué agente (McpToken); null = "cualquiera de mis
// agentes" (la toma el primero que la inicia, ver startTask).

const OPEN_STATUSES = ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED']

// WorkDay de hoy de la persona, creándolo si falta. A diferencia de getOrCreateToday
// NO reabre una jornada cerrada: que el agente consulte su lista no debe "re-loguear"
// a su dueño.
async function ensureTodayWorkDay(userId, workspaceId, date) {
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

// ─── GET /api/tasks/agent-queue ─────────────────────────────────────────────
// Lista de trabajo de los agentes de la persona: tareas de agente abiertas (no
// programadas a futuro, de proyectos activos). Desde MCP, solo las de ESE agente +
// las delegadas a "cualquiera" (agentId null); desde la UI, las de todos sus agentes.
// Materializa antes las recurrentes/futuras que vencieron, así una serie diaria del
// agente aparece aunque su dueño no haya abierto el dashboard hoy.
async function agentQueue(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const today = todayString(req.workspace.timezone)

    // Solo lo del agente (agentOnly) y sin abrir un WorkDay si no hace falta: un WorkDay
    // vacío creado acá contaría como "la persona estuvo" en Asistencia (ver
    // lib/agentTasks.js PRESENCE_WORKDAY_WHERE). Con algo que materializar, el WorkDay
    // queda solo con tareas de agente y no cuenta como presencia.
    try {
      const [dueAgentTasks, agentRecurrences] = await Promise.all([
        prisma.task.count({ where: { userId, isAgentTask: true, scheduledFor: { not: null, lte: today }, status: { not: 'COMPLETED' }, workDay: { workspaceId } } }),
        prisma.taskRecurrence.count({ where: { userId, workspaceId, active: true, isAgentTask: true } }),
      ])
      if (dueAgentTasks > 0 || agentRecurrences > 0) {
        const workDay = await ensureTodayWorkDay(userId, workspaceId, today)
        if (workDay) await materializeForUser(prisma, { userId, workspaceId, todayWorkDayId: workDay.id, today, agentOnly: true })
      }
    } catch (matErr) {
      console.error('[agent-queue] Error materializando tareas:', matErr.message)
    }

    const agentId = requestAgentId(req)
    const tasks = await prisma.task.findMany({
      where: {
        userId,
        isAgentTask: true,
        status: { in: OPEN_STATUSES },
        workDay: { workspaceId },
        project: { active: true },
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: today } }],
        ...(agentId ? { AND: [{ OR: [{ agentId }, { agentId: null }] }] } : {}),
      },
      include: { ...taskInclude, agent: { select: { id: true, label: true } } },
      orderBy: { createdAt: 'asc' },
    })
    res.json(tasks)
  } catch (err) { next(err) }
}

// ─── PATCH /api/tasks/:id/agent ─────────────────────────────────────────────
// "Delegar a mi agente" (executor:'agent') o devolverla a la persona (executor:'user').
// Solo sobre tareas propias, abiertas y que no estén en curso (cambiar quién la
// ejecuta en plena ejecución movería el lugar de "1 en curso" de la persona).
// agentId opcional: uno de MIS agentes; sin él, desde MCP queda para el agente que
// llama y desde la UI para "cualquiera de mis agentes".
// ?scope=series en una instancia recurrente: también la plantilla + las instancias
// abiertas que no estén en curso (mismo criterio que editar con scope=series).
async function setExecutor(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const { executor } = req.body
    if (!['agent', 'user'].includes(executor)) {
      return res.status(400).json({ error: "executor inválido ('agent' | 'user')" })
    }

    const task = await prisma.task.findFirst({ where: { id, userId, workDay: { workspaceId } } })
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (task.status === 'COMPLETED') return res.status(400).json({ error: 'La tarea ya está completada' })
    if (task.status === 'IN_PROGRESS') return res.status(409).json({ error: 'La tarea está en curso: pausala antes de cambiar quién la ejecuta' })

    let data
    if (executor === 'agent') {
      const agentId = req.body.agentId != null
        ? await assertOwnAgent(req.body.agentId, userId, workspaceId)
        : requestAgentId(req)
      data = { isAgentTask: true, agentId }
    } else {
      data = { isAgentTask: false, agentId: null }
    }

    if (req.query.scope === 'series' && task.recurrenceId) {
      await prisma.$transaction([
        prisma.taskRecurrence.update({ where: { id: task.recurrenceId }, data }),
        prisma.task.updateMany({
          where: { recurrenceId: task.recurrenceId, status: { in: ['PENDING', 'PAUSED', 'BLOCKED'] } },
          data,
        }),
      ])
    } else {
      await prisma.task.update({ where: { id }, data })
    }

    const updated = await prisma.task.findUnique({
      where: { id },
      include: { ...taskInclude, agent: { select: { id: true, label: true } } },
    })
    res.json(updated)
  } catch (err) { next(err) }
}

module.exports = { agentQueue, setExecutor, ensureTodayWorkDay }
