const prisma = require('../lib/prisma')

async function list(req, res, next) {
  try {
    const notifications = await prisma.notification.findMany({
      where:   { userId: req.user.userId, workspaceId: req.workspace.id },
      include: { actor: { select: { id: true, name: true, avatar: true } }, project: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take:    30,
    })
    res.json(notifications)
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

// Marca como leídas solo las notificaciones de los tipos indicados (body: { types: [...] }).
// Se usa para el modelo "marcar leído al ver ese tipo" del panel de notificaciones.
const VALID_TYPES = ['COMPLETED', 'BLOCKED', 'ADDED_TO_PROJECT', 'TASK_COMMENT', 'TASK_MENTION', 'VACATION_REQUEST', 'VACATION_REVIEWED']

async function markRead(req, res, next) {
  try {
    const types = Array.isArray(req.body?.types) ? req.body.types.filter(t => VALID_TYPES.includes(t)) : []
    if (types.length === 0) return res.status(400).json({ error: 'Tipos inválidos' })
    await prisma.notification.updateMany({
      where: { userId: req.user.userId, workspaceId: req.workspace.id, read: false, type: { in: types } },
      data:  { read: true },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { list, markAllRead, markRead }
