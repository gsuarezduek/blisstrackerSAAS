// Gestión (admin-only) del token de intake público de Leads — ver
// publicLeadIntake.controller.js. `req.workspace.leadWebhookToken` no está
// disponible (excluido del `omit` de resolveWorkspace a propósito), así que cada
// handler hace su propio select puntual, igual que logo/banner.
const crypto = require('crypto')
const prisma = require('../../lib/prisma')

function buildUrl(token) {
  if (!token) return null
  const base = (process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '')
  return `${base}/api/public/leads/${token}`
}

// GET /api/ventas/lead-webhook
async function getStatus(req, res, next) {
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: req.workspace.id },
      select: { leadWebhookToken: true },
    })
    res.json({ token: ws?.leadWebhookToken || null, url: buildUrl(ws?.leadWebhookToken) })
  } catch (err) { next(err) }
}

// POST /api/ventas/lead-webhook/regenerate
async function regenerate(req, res, next) {
  try {
    const token = crypto.randomUUID()
    await prisma.workspace.update({ where: { id: req.workspace.id }, data: { leadWebhookToken: token } })
    res.json({ token, url: buildUrl(token) })
  } catch (err) { next(err) }
}

// DELETE /api/ventas/lead-webhook
async function revoke(req, res, next) {
  try {
    await prisma.workspace.update({ where: { id: req.workspace.id }, data: { leadWebhookToken: null } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { getStatus, regenerate, revoke }
