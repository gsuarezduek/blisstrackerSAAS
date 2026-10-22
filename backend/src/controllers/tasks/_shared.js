const prisma = require('../../lib/prisma')

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

// "Una sola tarea en curso por persona" aplica solo a tareas HUMANAS: las que ejecuta
// un agente (Task.isAgentTask) no ocupan el lugar de su dueño, y un agente puede tener
// varias en curso (mismo criterio que el índice parcial one_active_task_per_user).
async function assertNoActiveTask(userId, currentWorkspaceId) {
  const active = await prisma.task.findFirst({
    where: { userId, status: 'IN_PROGRESS', isAgentTask: false },
    include: { workDay: { select: { workspaceId: true } } },
  })
  if (!active) return

  const activeWorkspaceId = active.workDay?.workspaceId
  const isSameWorkspace = !currentWorkspaceId || activeWorkspaceId === currentWorkspaceId

  const msg = isSameWorkspace
    ? 'Ya tenés una tarea en curso. Pausala o completala primero.'
    : 'Tenés una tarea activa en otro workspace. Pausala o completala antes de iniciar una nueva.'

  throw Object.assign(new Error(msg), { status: 409, isOperational: true })
}

function handleActiveTaskConflict(err) {
  if (err.code === 'P2002' && err.meta?.target?.includes?.('one_active_task_per_user')) {
    return Object.assign(
      new Error('Ya tenés una tarea en curso. Pausala o completala primero.'),
      { status: 409, isOperational: true }
    )
  }
  return err
}

// Agente (McpToken) que hace esta request, si viene por MCP — claim interno que solo
// firma mcp/apiBridge.js. null = request normal del frontend/app.
function requestAgentId(req) {
  return Number.isInteger(req.user?.mcpTokenId) ? req.user.mcpTokenId : null
}

// Nombre que declaró el agente en la tool (claim interno `mcpAgentName`, ver
// mcp/apiBridge.js): distingue varios agentes que comparten un token. Solo
// cuenta si la request viene de un agente; null si no declaró ninguno.
function requestAgentName(req) {
  if (requestAgentId(req) === null) return null
  const name = req.user?.mcpAgentName
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : null
}

// Valida que `agentId` sea un agente (McpToken no revocado) de ESA persona en ese
// workspace: una persona solo puede delegar en sus propios agentes. Devuelve el id o
// lanza 400 (isOperational) si no corresponde.
async function assertOwnAgent(agentId, userId, workspaceId) {
  const id = Number(agentId)
  const row = Number.isInteger(id)
    ? await prisma.mcpToken.findFirst({ where: { id, userId, workspaceId, revokedAt: null }, select: { id: true } })
    : null
  if (!row) throw Object.assign(new Error('Agente inválido: tiene que ser uno de tus agentes activos'), { status: 400, isOperational: true })
  return row.id
}

module.exports = { taskInclude, assertNoActiveTask, handleActiveTaskConflict, requestAgentId, requestAgentName, assertOwnAgent }
