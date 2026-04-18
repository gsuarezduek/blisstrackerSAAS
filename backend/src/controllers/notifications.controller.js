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

module.exports = { list, markAllRead }
