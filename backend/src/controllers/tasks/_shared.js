const prisma = require('../../lib/prisma')

const taskInclude = {
  project: true,
  createdBy: { select: { id: true, name: true } },
  _count: { select: { comments: true } },
  sessions: { select: { startedAt: true, endedAt: true } },
  // Pieza de Contenido vinculada (si la tarea vino de "Enviar al dashboard") — alcanza con
  // el id para armar el deep-link a /contenido?projectId=&piece= desde TaskCard.
  contentPiece: { select: { id: true } },
}

async function assertNoActiveTask(userId, currentWorkspaceId) {
  const active = await prisma.task.findFirst({
    where: { userId, status: 'IN_PROGRESS' },
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

module.exports = { taskInclude, assertNoActiveTask, handleActiveTaskConflict }
