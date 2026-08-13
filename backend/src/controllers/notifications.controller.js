const prisma = require('../lib/prisma')

async function list(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const notifications = await prisma.notification.findMany({
      where:   { userId, workspaceId },
      include: {
        actor:   { select: { id: true, name: true, avatar: true } },
        project: { select: { id: true, name: true } },
        channel: { select: { slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      // Suben a 80 para que el buscador por proyecto en "Completadas" tenga material
      take:    80,
    })

    // Enriquecer las COMPLETED con la relación del usuario con la tarea: 'delegated'
    // (la creó él), 'followed' (la sigue) o 'member' (solo por ser del proyecto).
    // Permite destacar en un filtro aparte las completadas que le importan.
    const taskIds = [...new Set(notifications.filter(n => n.type === 'COMPLETED' && n.taskId).map(n => n.taskId))]
    let followSet = new Set()
    const creatorMap = new Map()
    if (taskIds.length) {
      const [follows, tasks] = await Promise.all([
        prisma.taskFollow.findMany({ where: { userId, taskId: { in: taskIds } }, select: { taskId: true } }),
        prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, createdById: true } }),
      ])
      followSet = new Set(follows.map(f => f.taskId))
      for (const t of tasks) creatorMap.set(t.id, t.createdById)
    }

    const enriched = notifications.map(n => {
      if (n.type !== 'COMPLETED') return n
      let relation = 'member'
      if (creatorMap.get(n.taskId) === userId) relation = 'delegated'
      else if (followSet.has(n.taskId)) relation = 'followed'
      return { ...n, relation }
    })

    res.json(enriched)
  } catch (err) { next(err) }
}

async function markAllRead(req, res, next) {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.userId, workspaceId: req.workspace.id, read: false },
      data:  { read: true },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// Marca como leídas notificaciones puntuales. Acepta `ids` (preferido — un filtro del
// panel puede agrupar por relación, no solo por tipo) o `types` (compat). Se usa para el
// modelo "marcar leído al ver ese filtro" del panel de notificaciones.
const VALID_TYPES = ['COMPLETED', 'BLOCKED', 'UNBLOCKED', 'ADDED_TO_PROJECT', 'TASK_COMMENT', 'TASK_MENTION', 'VACATION_REQUEST', 'VACATION_REVIEWED', 'LEAD_ASSIGNED', 'GAME_LAUNCHED', 'CHAT_MENTION']

async function markRead(req, res, next) {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Number.isInteger) : []
    const types = Array.isArray(req.body?.types) ? req.body.types.filter(t => VALID_TYPES.includes(t)) : []
    const where = { userId: req.user.userId, workspaceId: req.workspace.id, read: false }
    if (ids.length) where.id = { in: ids }
    else if (types.length) where.type = { in: types }
    else return res.status(400).json({ error: 'Falta ids o types' })
    await prisma.notification.updateMany({ where, data: { read: true } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { list, markAllRead, markRead }
