// Webhook de Amazon SES (vía SNS) para Mailing. El `token` de la URL identifica el
// proyecto; la firma de SNS prueba que el mensaje viene de AWS; y el primer tópico
// que se confirma queda fijado (MailingConfig.webhookId): un tópico de OTRA cuenta
// de AWS suscripto a esta URL se rechaza.
//
// Acepta los dos formatos de SES: notificaciones de identidad (`notificationType`)
// y event publishing de un configuration set (`eventType`).
const axios = require('axios')
const prisma = require('../lib/prisma')
const { verifySnsMessage, isSnsUrl } = require('../lib/snsVerify')
const { applyProviderEvent } = require('../services/mailing/events')

const TYPE_MAP = { Delivery: 'delivered', Bounce: 'bounced', Complaint: 'complained' }

function parseBody(body) {
  try {
    return JSON.parse(Buffer.isBuffer(body) ? body.toString('utf8') : String(body || ''))
  } catch { return null }
}

async function handleSesMailingWebhook(req, res) {
  try {
    const config = await prisma.mailingConfig.findUnique({
      where: { webhookToken: String(req.params.token || '') },
      select: { id: true, projectId: true, provider: true, webhookId: true },
    })
    if (!config || config.provider !== 'ses') return res.status(404).end()

    const msg = parseBody(req.body)
    if (!msg || !(await verifySnsMessage(msg))) return res.status(401).json({ error: 'Firma inválida' })
    if (config.webhookId && msg.TopicArn !== config.webhookId) return res.status(403).json({ error: 'Tópico no autorizado' })

    if (msg.Type === 'SubscriptionConfirmation') {
      if (!isSnsUrl(msg.SubscribeURL)) return res.status(400).end()
      await axios.get(msg.SubscribeURL, { timeout: 5000, maxRedirects: 0 })
      await prisma.mailingConfig.update({ where: { id: config.id }, data: { webhookId: msg.TopicArn } })
      return res.json({ ok: true, subscribed: true })
    }
    if (msg.Type !== 'Notification') return res.json({ ok: true })

    let event
    try { event = JSON.parse(msg.Message) } catch { return res.json({ ok: true }) }
    const type = TYPE_MAP[event?.notificationType || event?.eventType]
    if (type) {
      await applyProviderEvent({
        projectId: config.projectId,
        messageId: event.mail?.messageId,
        type,
        bounceType: event.bounce?.bounceType || null,
      })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[mailing] error en webhook de SES:', err.message)
    res.status(500).end()
  }
}

module.exports = { handleSesMailingWebhook }
