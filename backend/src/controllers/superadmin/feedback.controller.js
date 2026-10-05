const prisma = require('../../lib/prisma')

/**
 * GET /api/superadmin/feedback
 * Lista todos los feedbacks de todos los workspaces.
 */
async function listFeedback(req, res, next) {
  try {
    const feedbacks = await prisma.feedback.findMany({
      include: {
        user:      { select: { id: true, name: true, avatar: true } },
        workspace: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(feedbacks)
  } catch (err) { next(err) }
}

/**
 * PUT /api/superadmin/feedback/:id/read
 * Marcar feedback como leído.
 */
async function markFeedbackRead(req, res, next) {
  try {
    const feedback = await prisma.feedback.update({
      where: { id: Number(req.params.id) },
      data: { read: true },
    })
    res.json(feedback)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'No encontrado' })
    next(err)
  }
}

/**
 * GET /api/superadmin/email-logs
 * Lista todos los logs de emails enviados. Soporta filtros ?status=&type=&limit=&offset=
 */
async function listEmailLogs(req, res, next) {
  try {
    const { status, type, limit = 50, offset = 0 } = req.query
    const where = {}
    if (status) where.status = status
    if (type)   where.type   = type

    const [logs, total] = await Promise.all([
      prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
        include: {
          workspace: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.emailLog.count({ where }),
    ])

    res.json({ logs, total })
  } catch (err) { next(err) }
}

module.exports = { listFeedback, markFeedbackRead, listEmailLogs }
