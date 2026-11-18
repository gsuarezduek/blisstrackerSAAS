// Endpoints públicos de Mailing (sin auth): pixel de apertura, redirect de clic
// y baja. Los identifica el `token` aleatorio de cada MailingSend (144 bits), que
// no expone ids ni permite enumerar.
const prisma = require('../../lib/prisma')
const events = require('../../services/mailing/events')

// GIF transparente 1×1.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

function noStore(res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.set('Pragma', 'no-cache')
}

/** GET /api/public/mailing/o/:token(.gif) — siempre responde el pixel. */
async function openPixel(req, res) {
  const token = String(req.params.token || '').replace(/\.gif$/, '')
  // El pixel se responde antes de registrar: el tracking nunca demora el render del mail.
  noStore(res)
  res.set('Content-Type', 'image/gif')
  res.send(PIXEL)
  events.recordOpen(token).catch(err => console.error('[mailing] error registrando apertura:', err.message))
}

/** GET /api/public/mailing/c/:token/:idx — 302 a la URL guardada de la campaña. */
async function clickRedirect(req, res) {
  noStore(res)
  try {
    const url = await events.recordClick(req.params.token, req.params.idx)
    if (!url) return res.status(404).type('text/plain').send('Este enlace no existe o venció.')
    res.redirect(302, url)
  } catch {
    res.status(500).type('text/plain').send('No pudimos abrir el enlace. Probá de nuevo.')
  }
}

function maskEmail(email) {
  const [user, domain] = String(email).split('@')
  if (!domain) return email
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`
}

/** GET /api/public/mailing/u/:token — datos para la página de baja. */
async function unsubscribeInfo(req, res) {
  try {
    const send = await events.findSendByToken(req.params.token)
    if (!send) return res.status(404).json({ error: 'El enlace de baja no es válido.' })
    const [s, project, config] = await Promise.all([
      prisma.mailingSend.findUnique({ where: { id: send.id }, select: { email: true, contact: { select: { status: true } } } }),
      prisma.project.findUnique({ where: { id: send.projectId }, select: { name: true } }),
      prisma.mailingConfig.findUnique({ where: { projectId: send.projectId }, select: { fromName: true } }),
    ])
    res.json({
      sender: config?.fromName || project?.name || '',
      email: maskEmail(s.email),
      unsubscribed: ['unsubscribed', 'bounced', 'complained'].includes(s.contact?.status),
    })
  } catch {
    res.status(500).json({ error: 'No pudimos cargar la información.' })
  }
}

/**
 * POST /api/public/mailing/u/:token
 * Sirve para la página de baja (JSON `{ reason }`) y para el one-click de RFC 8058
 * que mandan Gmail/Yahoo desde su propio botón (form-urlencoded
 * `List-Unsubscribe=One-Click`): en los dos casos cualquier POST da de baja.
 */
async function unsubscribePost(req, res) {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : null
    const send = await events.unsubscribe(req.params.token, { reason })
    if (!send) return res.status(404).json({ error: 'El enlace de baja no es válido.' })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'No pudimos procesar la baja. Probá de nuevo.' })
  }
}

module.exports = { openPixel, clickRedirect, unsubscribeInfo, unsubscribePost, maskEmail }
