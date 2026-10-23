const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')

// Recordatorio de "registrá en qué estás trabajando". BlissTracker no puede
// iniciar una conversación con el agente (MCP va solo del agente hacia acá), así
// que el recordatorio viaja en la respuesta de la próxima tool que use: si el
// agente no tiene ninguna tarea en curso, se suma un bloque de texto al final con
// sus tareas planificadas para hoy (para que arranque una de esas en vez de crear
// otra) y cómo registrarlo en un paso (`task_working_on`).
//
// Como mucho una vez cada `McpToken.workReminderMins` (default 30, 0 = nunca) por
// agente: por token + nombre declarado (varios agentes pueden compartir token).
// El estado vive en memoria del proceso (mismo criterio que las sesiones MCP): un
// deploy lo resetea, lo peor que pasa es un recordatorio antes de tiempo.

const SETTINGS_RECHECK_MS = 10 * 60 * 1000 // con el recordatorio apagado, cada cuánto se relee la config
const PLANNED_LIST = 3
const nextCheckAt = new Map() // `${tokenId}|${agentName}` → timestamp

function reminderKey(identity, agentName) {
  return `${identity.tokenId}|${agentName || ''}`
}

// Tareas del agente: las suyas o las delegadas a "cualquiera de mis agentes"; si
// declaró nombre, las en curso tienen que ser las de ese nombre.
function agentScope(identity) {
  return { userId: identity.userId, isAgentTask: true, workDay: { workspaceId: identity.workspaceId } }
}

async function buildReminder(identity, agentName) {
  const inProgress = await prisma.task.count({
    where: { ...agentScope(identity), agentId: identity.tokenId, status: 'IN_PROGRESS', ...(agentName ? { agentName } : {}) },
  })
  if (inProgress > 0) return null

  const workspace = await prisma.workspace.findUnique({ where: { id: identity.workspaceId }, select: { timezone: true } })
  const today = todayString(workspace?.timezone)
  const plannedWhere = {
    ...agentScope(identity),
    status: { in: ['PENDING', 'PAUSED'] },
    isBacklog: false,
    project: { active: true },
    OR: [{ agentId: identity.tokenId }, { agentId: null }],
    AND: [{ OR: [{ scheduledFor: null }, { scheduledFor: { lte: today } }] }],
  }
  const [planned, plannedCount] = await Promise.all([
    prisma.task.findMany({
      where: plannedWhere,
      orderBy: { createdAt: 'asc' },
      take: PLANNED_LIST,
      select: { id: true, description: true, status: true, project: { select: { name: true } } },
    }),
    prisma.task.count({ where: plannedWhere }),
  ])

  const lines = [
    '--- Recordatorio de BlissTracker ---',
    'No tenés ninguna tarea en curso. Si estás trabajando en algo (no una consulta rápida), registralo ahora con `task_working_on`: así la persona ve qué estás haciendo y el tiempo queda registrado.',
  ]
  if (planned.length) {
    lines.push('Si es una de tus tareas planificadas para hoy, usá su `taskId` (no crees otra):')
    for (const t of planned) {
      lines.push(`- #${t.id} ${t.description}${t.project?.name ? ` (${t.project.name})` : ''}${t.status === 'PAUSED' ? ' — pausada' : ''}`)
    }
    if (plannedCount > planned.length) lines.push(`(y ${plannedCount - planned.length} más en \`tasks_agent_queue\`)`)
    lines.push('Si es algo nuevo: `task_working_on` con `description` y `projectId`.')
  } else {
    lines.push('Si es algo nuevo: `task_working_on` con `description` y `projectId`; si es una tarea planificada para otro día, con su `taskId`.')
  }
  return lines.join('\n')
}

// Devuelve el texto del recordatorio o null. Nunca lanza: un error acá no puede
// romper la respuesta de la tool.
async function maybeWorkReminder(identity, agentName, now = Date.now()) {
  try {
    if (!identity?.tokenId || !identity.workspaceId) return null
    const key = reminderKey(identity, agentName)
    if (now < (nextCheckAt.get(key) ?? 0)) return null

    const token = await prisma.mcpToken.findUnique({ where: { id: identity.tokenId }, select: { workReminderMins: true } })
    const mins = token?.workReminderMins ?? 0
    if (mins <= 0) {
      nextCheckAt.set(key, now + SETTINGS_RECHECK_MS)
      return null
    }
    nextCheckAt.set(key, now + mins * 60 * 1000)
    return await buildReminder(identity, agentName)
  } catch (err) {
    console.error('[mcp] Error armando el recordatorio de tarea en curso:', err.message)
    return null
  }
}

module.exports = { maybeWorkReminder, _nextCheckAt: nextCheckAt }
