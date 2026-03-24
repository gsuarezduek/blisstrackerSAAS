const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// List the last 30 notifications for the current user
async function list(req, res, next) {
  try {
    const notifications = await prisma.notification.findMany({
      where:   { userId: req.user.id },
      include: { actor: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take:    30,
    })
    res.json(notifications)
  } catch (err) { next(err) }
}

// Mark all unread notifications as read for the current user
async function markAllRead(req, res, next) {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false },
      data:  { read: true },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { list, markAllRead }
