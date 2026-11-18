// Webhook de Resend para Mailing (entregas, rebotes, quejas) de la cuenta de UN
// cliente. El `token` de la URL identifica el proyecto; la firma Svix se valida
// con el secreto de ESE proyecto. Montado con express.raw() en app.js: la firma
// es sobre el body crudo.
const { Webhook } = require('svix')
const prisma = require('../lib/prisma')
const { decrypt } = require('../lib/encryption')
const { applyProviderEvent } = require('../services/mailing/events')

const TYPE_MAP = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
}

async function handleResendMailingWebhook(req, res) {
  try {
    const config = await prisma.mailingConfig.findUnique({
      where: { webhookToken: String(req.params.token || '') },
      select: { projectId: true, webhookSecret: true, provider: true },
    })
    if (!config || config.provider !== 'resend' || !config.webhookSecret) return res.status(404).end()

    const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '')
    let event
    try {
      event = new Webhook(decrypt(config.webhookSecret)).verify(payload, {
        'svix-id': req.get('svix-id'),
        'svix-timestamp': req.get('svix-timestamp'),
        'svix-signature': req.get('svix-signature'),
      })
    } catch {
      return res.status(401).json({ error: 'Firma inválida' })
    }

    const type = TYPE_MAP[event?.type]
    if (type) {
      await applyProviderEvent({
        projectId: config.projectId,
        messageId: event.data?.email_id,
        type,
        bounceType: event.data?.bounce?.type || event.data?.bounce?.subType || null,
      })
    }
    // 200 también para eventos que no usamos: si no, Resend los reintenta.
    res.json({ ok: true })
  } catch (err) {
    console.error('[mailing] error en webhook de Resend:', err.message)
    res.status(500).end()
  }
}

module.exports = { handleResendMailingWebhook }
