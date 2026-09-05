const prisma = require('../../lib/prisma')
const { todayString } = require('../../utils/dates')

// ─── SEGUIMIENTO DE TAREAS ───────────────────────────────────────────────────

// Verifica que la tarea exista y sea del workspace actual; el usuario puede seguir
// cualquier tarea que pueda ver (modelo de acceso abierto del workspace).
async function findTaskInWorkspace(taskId, workspaceId) {
  return prisma.task.findFirst({
    where: { id: taskId, workDay: { workspaceId } },
    select: { id: true },
  })
}

async function followTask(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const taskId = Number(req.params.id)

    const task = await findTaskInWorkspace(taskId, workspaceId)
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' })

    await prisma.taskFollow.upsert({
      where: { taskId_userId: { taskId, userId } },
      create: { taskId, userId, workspaceId },
      update: {},
    })
    res.json({ following: true })
  } catch (err) { next(err) }
}

async function unfollowTask(req, res, next) {
  try {
    const userId = req.user.userId
    const taskId = Number(req.params.id)
    await prisma.taskFollow.deleteMany({ where: { taskId, userId } })
    res.json({ following: false })
  } catch (err) { next(err) }
}

async function followState(req, res, next) {
  try {
    const userId = req.user.userId
    const taskId = Number(req.params.id)
    const f = await prisma.taskFollow.findUnique({
      where: { taskId_userId: { taskId, userId } },
      select: { id: true },
    })
    res.json({ following: !!f })
  } catch (err) { next(err) }
}

// Tareas que el usuario sigue (las "Seguidas" de la sección Seguimiento).
async function followed(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const today = todayString(req.workspace.timezone)

    const follows = await prisma.taskFollow.findMany({
      where: {
        userId,
        workspaceId,
        task: {
          // Excluir tareas futuras aún no materializadas
          OR: [{ scheduledFor: null }, { scheduledFor: { lte: today } }],
        },
      },
      include: {
        task: {
          include: {
            project: true,
            user: { select: { id: true, name: true, avatar: true } },
            _count: { select: { comments: true } },
            sessions: { select: { startedAt: true, endedAt: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(follows.map(f => f.task))
  } catch (err) { next(err) }
}

// Deja de seguir en bulk (espejo de dismissDelegated para la pestaña Seguidas).
async function unfollowAll(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const { status } = req.query  // opcional: filtra por estado

    const where = { userId, workspaceId }
    if (status) where.task = { status }

    const { count } = await prisma.taskFollow.deleteMany({ where })
    res.json({ unfollowed: count })
  } catch (err) { next(err) }
}

module.exports = { followTask, unfollowTask, unfollowAll, followState, followed }
