const prisma = require('../lib/prisma')
const { sendPlatformNotification, platformCard } = require('../services/email.service')

async function create(req, res, next) {
  try {
    const { type, message } = req.body
    if (!type || !message?.trim()) {
      return res.status(400).json({ error: 'Tipo y mensaje requeridos' })
    }
    if (!['SUGGESTION', 'BUG'].includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido' })
    }
    const feedback = await prisma.feedback.create({
      data: {
        userId: req.user.userId,
        workspaceId: req.workspace?.id ?? null,
        type,
        message: message.trim(),
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    })

    // Aviso interno al equipo BlissTracker (no-op si la casilla no está configurada).
    const isBug = type === 'BUG'
    const typeLabel = isBug ? '🐞 Reporte de error' : '💡 Sugerencia'
    sendPlatformNotification('feedback', {
      workspaceId: req.workspace?.id ?? null,
      subject: `${typeLabel} de ${feedback.user.name} — ${req.workspace?.name ?? 'Sin workspace'}`,
      bodyHtml: platformCard(typeLabel, [
        ['Usuario',   `${feedback.user.name} (${feedback.user.email})`],
        ['Workspace', req.workspace?.name ?? '—'],
        ['Tipo',      isBug ? 'Bug' : 'Sugerencia'],
        ['Mensaje',   feedback.message.replace(/\n/g, '<br>')],
      ], isBug ? '#dc2626' : '#E67A1F'),
    })

    res.status(201).json(feedback)
  } catch (err) { next(err) }
}

async function list(req, res, next) {
  try {
    const where = req.workspace ? { workspaceId: req.workspace.id } : {}
    const feedbacks = await prisma.feedback.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(feedbacks)
  } catch (err) { next(err) }
}

async function markRead(req, res, next) {
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

module.exports = { create, list, markRead }
