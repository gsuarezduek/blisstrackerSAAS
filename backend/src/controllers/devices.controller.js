const prisma = require('../lib/prisma')
const { isValidPushToken } = require('../services/pushNotification.service')

const PLATFORMS = ['ios', 'android']

/**
 * POST /api/devices/register
 * Body: { token, platform }
 * Registra (o refresca) el token push de esta instalación de la app mobile
 * para el usuario y workspace actuales. `token` es único por instalación —
 * upsert por token, no por usuario (un usuario puede tener varios dispositivos).
 */
async function register(req, res, next) {
  try {
    const { token, platform } = req.body
    if (!token || !PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: 'token y platform (ios|android) son requeridos' })
    }
    if (!(await isValidPushToken(token))) {
      return res.status(400).json({ error: 'Token de push inválido' })
    }

    await prisma.deviceToken.upsert({
      where: { token },
      update: { userId: req.user.userId, workspaceId: req.workspace.id, platform, lastUsedAt: new Date() },
      create: { userId: req.user.userId, workspaceId: req.workspace.id, token, platform },
    })

    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/devices/register
 * Body: { token }
 * Deja de mandar push a este dispositivo (logout desde la app).
 */
async function unregister(req, res, next) {
  try {
    const { token } = req.body
    if (!token) return res.status(400).json({ error: 'token requerido' })
    await prisma.deviceToken.deleteMany({ where: { token, userId: req.user.userId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { register, unregister }
