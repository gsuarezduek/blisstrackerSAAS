const prisma = require('../lib/prisma')
const { createdNewsWhere, inboxNewsWhere } = require('../lib/agentNews')

// "Tenés novedades" pegado a la respuesta de cualquier tool.
//
// La bandeja (`tasks_agent_updates`) solo sirve si el agente se acuerda de mirarla, y
// acordarse es exactamente lo que no se le puede garantizar: `INSTRUCTIONS` se lo pide,
// pero una conversación que arranca con "completá la tarea 12" no pasa por ahí. Mismo
// mecanismo que `workReminder.js`: BlissTracker no puede iniciar una conversación con el
// agente (MCP va solo del agente hacia acá), así que el aviso viaja de arriba de la
// respuesta de la próxima tool que use.
//
// **No marca nada como visto**: eso lo hace solo `tasks_agent_updates`. Si el agente
// ignora el bloque, el aviso vuelve al próximo intervalo — repetir es preferible a
// perder una novedad porque el modelo no leyó un texto que nadie confirmó.
//
// Throttle fijo en código (no una columna más en McpToken): una conversación normal
// recibe el bloque una vez, y si en 10 minutos el agente sigue sin leer la bandeja,
// vuelve. El estado vive en memoria del proceso, mismo criterio que `workReminder.js` y
// las sesiones de MCP: un deploy lo resetea y lo peor que pasa es un aviso de más.

const NUDGE_EVERY_MS = 10 * 60 * 1000
const LIST_LIMIT = 3
const nextNudgeAt = new Map() // `${tokenId}|${agentName}` → timestamp

// La tool que ya devuelve las novedades no necesita que se las repitamos abajo.
const SKIP_TOOLS = new Set(['tasks_agent_updates'])

function nudgeKey(identity, agentName) {
  return `${identity.tokenId}|${agentName || ''}`
}

function shortDesc(text) {
  const t = (text || '').trim()
  return t.length > 70 ? `${t.slice(0, 67)}...` : t
}

// Último comentario de una persona (no de un agente): en una novedad de desbloqueo o de
// comentario, es la respuesta que el agente estaba esperando.
function lastHumanComment(task) {
  const c = (task.comments || []).find(x => x.agentId == null)
  return c ? shortDesc(c.content) : null
}

function lineFor(task) {
  const where = task.project?.name ? ` (${task.project.name})` : ''
  const head = `- #${task.id} «${shortDesc(task.description)}»${where}`
  if (task.agentUpdateKind === 'unblocked') {
    const reply = lastHumanComment(task)
    return `${head}: la destrabaron, quedó ${task.status === 'PAUSED' ? 'PAUSADA' : task.status}.`
      + (reply ? ` Te respondieron: "${reply}".` : '')
      + ' Retomala con `task_resume`.'
  }
  if (task.agentUpdateKind === 'comment') {
    const reply = lastHumanComment(task)
    return `${head}: te comentaron${reply ? `: "${reply}"` : ''}.`
  }
  // Sin `agentUpdateKind` = novedad de las que creó: alguien la completó.
  return `${head}: la completó ${task.user?.name || 'alguien'}.`
}

const NEWS_INCLUDE = {
  project: { select: { name: true } },
  user: { select: { name: true } },
  comments: {
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { content: true, agentId: true },
  },
}

async function buildNudge(identity, agentName) {
  const base = { agentId: identity.tokenId, declaredName: agentName, userId: identity.userId, workspaceId: identity.workspaceId }
  // Primero lo que la persona le dejó (una pregunta respondida frena trabajo), después
  // lo que se completó de lo que él creó.
  const [inbox, created] = await Promise.all([
    prisma.task.findMany({
      where: inboxNewsWhere(base),
      orderBy: { agentUpdateAt: 'asc' },
      take: LIST_LIMIT + 1,
      include: NEWS_INCLUDE,
    }),
    prisma.task.findMany({
      where: createdNewsWhere(base),
      orderBy: { completedAt: 'asc' },
      take: LIST_LIMIT + 1,
      include: NEWS_INCLUDE,
    }),
  ])
  const total = inbox.length + created.length
  if (total === 0) return null

  const shown = [...inbox, ...created].slice(0, LIST_LIMIT)
  const lines = [
    '--- Novedades de BlissTracker ---',
    'Pasó esto mientras no estabas:',
    ...shown.map(lineFor),
  ]
  if (total > shown.length) lines.push(`(y ${total - shown.length} más)`)
  lines.push('Revisá `tasks_agent_updates` para el detalle completo y para marcarlas como vistas; si no, este aviso vuelve.')
  return lines.join('\n')
}

// Devuelve el texto del aviso o null. Nunca lanza: un error acá no puede romper la
// respuesta de la tool.
async function maybeNewsNudge(identity, agentName, toolName, now = Date.now()) {
  try {
    if (!identity?.tokenId || !identity.workspaceId) return null
    if (SKIP_TOOLS.has(toolName)) return null
    const key = nudgeKey(identity, agentName)
    if (now < (nextNudgeAt.get(key) ?? 0)) return null
    const text = await buildNudge(identity, agentName)
    // Solo arranca el throttle si hubo algo que avisar: si no, cada tool vuelve a
    // chequear (son dos counts indexados) y la novedad llega apenas aparece.
    if (text) nextNudgeAt.set(key, now + NUDGE_EVERY_MS)
    return text
  } catch (err) {
    console.error('[mcp] Error armando el aviso de novedades:', err.message)
    return null
  }
}

module.exports = { maybeNewsNudge, _nextNudgeAt: nextNudgeAt }
