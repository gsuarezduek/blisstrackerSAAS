// Endpoints públicos de Mailing (sin auth): pixel de apertura, redirect de clic
// y baja. Los identifica el `token` aleatorio de cada MailingSend (144 bits), que
// no expone ids ni permite enumerar.
const prisma = require('../../lib/prisma')
const events = require('../../services/mailing/events')
const optin = require('../../services/mailing/optin')
const { frontendBase } = require('../../services/mailing/config')

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

// Un form HTML clásico (lo que pega el cliente en su web) espera una redirección;
// un fetch espera JSON. Se decide por lo que pidió el navegador.
function wantsJson(req) {
  return req.is('application/json') || /application\/json/.test(req.get('accept') || '')
}

function thanksUrl(status) {
  return `${frontendBase()}/suscripcion?estado=${status === 'pending' ? 'revisa-tu-mail' : 'listo'}`
}

/**
 * POST /api/public/mailing/subscribe/:formToken
 * Body (JSON o form-urlencoded): email, nombre?, apellido?, website (honeypot).
 */
async function subscribe(req, res) {
  try {
    const r = await optin.subscribe({ formToken: req.params.formToken, body: req.body || {} })
    if (wantsJson(req)) return res.json({ ok: true, status: r.status })
    res.redirect(303, r.redirect || thanksUrl(r.status))
  } catch (err) {
    const status = err.status && err.status < 600 ? err.status : 500
    if (status >= 500 && status !== 503) console.error('[mailing] error en suscripción:', err.message)
    const message = status === 500 ? 'No pudimos procesar la suscripción. Probá de nuevo.' : err.message
    if (wantsJson(req)) return res.status(status).json({ error: message })
    res.redirect(303, `${frontendBase()}/suscripcion?estado=error&mensaje=${encodeURIComponent(message)}`)
  }
}

/** GET /api/public/mailing/confirm/:token — datos para la página de confirmación. */
async function confirmInfo(req, res) {
  try {
    const c = await optin.findByConfirmToken(req.params.token)
    if (!c) return res.status(404).json({ error: 'El link de confirmación no es válido o ya se usó.' })
    const [project, config] = await Promise.all([
      prisma.project.findUnique({ where: { id: c.projectId }, select: { name: true } }),
      prisma.mailingConfig.findUnique({ where: { projectId: c.projectId }, select: { fromName: true } }),
    ])
    res.json({ email: maskEmail(c.email), sender: config?.fromName || project?.name || '', expired: c.expired, confirmed: c.status === 'subscribed' })
  } catch {
    res.status(500).json({ error: 'No pudimos cargar la información.' })
  }
}

/** POST /api/public/mailing/confirm/:token — confirma (con un botón: los antivirus abren los links solos). */
async function confirmPost(req, res) {
  try {
    await optin.confirm(req.params.token)
    res.json({ ok: true })
  } catch (err) {
    res.status(err.status && err.status < 500 ? err.status : 500).json({ error: err.status ? err.message : 'No pudimos confirmar. Probá de nuevo.' })
  }
}

module.exports = { openPixel, clickRedirect, unsubscribeInfo, unsubscribePost, subscribe, confirmInfo, confirmPost, maskEmail }
