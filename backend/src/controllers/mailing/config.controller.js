// Configuración de envío de un proyecto: proveedor + credenciales del cliente,
// remitente, pie, tope diario y ventana horaria.
const prisma = require('../../lib/prisma')
const { encrypt } = require('../../lib/encryption')
const { normalizeEmail } = require('../../lib/normalizeEmail')
const { getProvider, PROVIDER_KEYS } = require('../../services/mailing/providers')
const { readCredentials, writeCredentials, publicConfig, webhookUrlFor } = require('../../services/mailing/config')
const { isHHMM } = require('../../services/mailing/schedule')
const { resolveCtx, sendError } = require('./_shared')

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/
const HEX_RE = /^#[0-9a-fA-F]{6}$/

const DEFAULTS = {
  provider: 'resend', fromName: null, fromEmail: null, replyTo: null, postalAddress: null,
  brandColor: null, dailyLimit: 500, sendWindowStart: '09:00', sendWindowEnd: '20:00',
  status: 'unverified', configured: false, credentialsHint: null, webhookConfigured: false, webhookUrl: null,
}

/** GET /projects/:id/mailing/config */
async function getConfig(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const config = await prisma.mailingConfig.findUnique({ where: { projectId: ctx.projectId } })
    res.json(config ? publicConfig(config) : { ...DEFAULTS, exists: false })
  } catch (err) { next(err) }
}

function cleanCredentials(provider, raw) {
  if (!raw || typeof raw !== 'object') return null
  if (provider === 'resend') {
    const apiKey = String(raw.apiKey || '').trim()
    if (!/^re_[A-Za-z0-9_]{8,}$/.test(apiKey)) throw Object.assign(new Error('La API key de Resend tiene que empezar con "re_"'), { status: 400 })
    return { apiKey }
  }
  if (provider === 'ses') {
    const accessKeyId = String(raw.accessKeyId || '').trim()
    const region = String(raw.region || '').trim().toLowerCase()
    if (!/^(AKIA|ASIA)[A-Z0-9]{12,}$/.test(accessKeyId)) throw Object.assign(new Error('La access key de AWS no tiene el formato esperado (AKIA…)'), { status: 400 })
    if (!getProvider('ses').REGION_RE.test(region)) throw Object.assign(new Error('Región de AWS inválida (ej. us-east-1)'), { status: 400 })
    const configurationSet = String(raw.configurationSet || '').trim().slice(0, 64) || null
    if (configurationSet && !/^[A-Za-z0-9_-]+$/.test(configurationSet)) throw Object.assign(new Error('Nombre de configuration set inválido'), { status: 400 })
    return { accessKeyId, secretAccessKey: raw.secretAccessKey ? String(raw.secretAccessKey).trim() : null, region, configurationSet }
  }
  if (provider === 'smtp') {
    const host = String(raw.host || '').trim().toLowerCase()
    const port = Number(raw.port) || 587
    if (!host) throw Object.assign(new Error('Falta el servidor SMTP'), { status: 400 })
    return { host, port, user: String(raw.user || '').trim() || null, pass: raw.pass ? String(raw.pass) : null }
  }
  return null
}

/**
 * PUT /projects/:id/mailing/config
 * Una clave ausente del body no se toca. `credentials` ausente conserva las
 * guardadas (así se puede cambiar el remitente sin volver a pegar la key); para
 * SMTP, `credentials` sin `pass` conserva la contraseña anterior.
 * Cambiar proveedor, credenciales o remitente vuelve la config a "sin verificar".
 */
async function saveConfig(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const b = req.body || {}
    const existing = await prisma.mailingConfig.findUnique({ where: { projectId: ctx.projectId } })
    const data = {}

    const provider = b.provider ?? existing?.provider ?? 'resend'
    if (!PROVIDER_KEYS.includes(provider)) return res.status(400).json({ error: 'Proveedor no soportado' })
    const providerChanged = provider !== (existing?.provider ?? null)
    data.provider = provider

    if (b.credentials !== undefined) {
      let creds = cleanCredentials(provider, b.credentials)
      if (creds && provider === 'smtp' && !creds.pass && !providerChanged) {
        creds.pass = readCredentials(existing)?.pass ?? null
      }
      // SES: el secret vacío conserva el guardado (igual que la contraseña SMTP).
      if (creds && provider === 'ses' && !creds.secretAccessKey && !providerChanged) {
        creds.secretAccessKey = readCredentials(existing)?.secretAccessKey ?? null
      }
      if (creds && provider === 'ses' && !creds.secretAccessKey) throw Object.assign(new Error('Falta la secret access key de AWS'), { status: 400 })
      if (creds && provider === 'smtp') await getProvider('smtp').assertPublicSmtpHost(creds.host, creds.port).catch(e => { throw Object.assign(e, { status: 400 }) })
      data.credentials = writeCredentials(creds)
    } else if (providerChanged && existing) {
      data.credentials = null
    }

    for (const field of ['fromEmail', 'replyTo']) {
      if (b[field] === undefined) continue
      const v = b[field] ? normalizeEmail(String(b[field])) : null
      if (v && !EMAIL_RE.test(v)) return res.status(400).json({ error: `Email inválido en ${field === 'fromEmail' ? 'remitente' : 'responder a'}` })
      data[field] = v
    }
    if (b.fromName !== undefined) data.fromName = String(b.fromName || '').trim().slice(0, 80) || null
    if (b.postalAddress !== undefined) data.postalAddress = String(b.postalAddress || '').trim().slice(0, 300) || null
    if (b.brandColor !== undefined) {
      if (b.brandColor && !HEX_RE.test(b.brandColor)) return res.status(400).json({ error: 'Color inválido (formato #RRGGBB)' })
      data.brandColor = b.brandColor || null
    }
    if (b.dailyLimit !== undefined) {
      const n = Number(b.dailyLimit)
      if (!Number.isInteger(n) || n < 1 || n > 1000000) return res.status(400).json({ error: 'El tope diario tiene que ser un número entre 1 y 1.000.000' })
      data.dailyLimit = n
    }
    for (const field of ['sendWindowStart', 'sendWindowEnd']) {
      if (b[field] === undefined) continue
      if (!isHHMM(b[field])) return res.status(400).json({ error: 'Horario inválido (formato HH:MM)' })
      data[field] = b[field]
    }

    const needsReverify = providerChanged || data.credentials !== undefined ||
      (data.fromEmail !== undefined && data.fromEmail !== existing?.fromEmail)
    if (needsReverify) {
      data.status = 'unverified'
      data.lastError = null
    }
    // Otro proveedor u otra cuenta = otro webhook (el viejo era de la cuenta anterior).
    if (providerChanged || (data.credentials !== undefined && provider !== 'smtp')) {
      data.webhookSecret = null
      data.webhookId = null
    }

    const saved = existing
      ? await prisma.mailingConfig.update({ where: { id: existing.id }, data })
      : await prisma.mailingConfig.create({ data: { ...data, workspaceId: ctx.workspaceId, projectId: ctx.projectId } })
    res.json(publicConfig(saved))
  } catch (err) { sendError(res, next, err) }
}

/** POST /projects/:id/mailing/config/verify */
async function verifyConfig(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const config = await prisma.mailingConfig.findUnique({ where: { projectId: ctx.projectId } })
    const creds = readCredentials(config)
    if (!config || !creds) return res.status(400).json({ error: 'Primero cargá las credenciales del proveedor.' })
    if (!config.fromEmail) return res.status(400).json({ error: 'Falta el email del remitente.' })

    const provider = getProvider(config.provider)
    let result
    try {
      result = await provider.verify(creds, {
        fromEmail: config.fromEmail,
        webhookUrl: provider.supportsWebhooks ? webhookUrlFor(config) : null,
        webhookId: config.webhookId,
      })
    } catch (err) {
      const updated = await prisma.mailingConfig.update({
        where: { id: config.id },
        data: { status: 'invalid', lastError: String(err.message).slice(0, 500), lastVerifiedAt: new Date() },
      })
      return res.status(400).json({ error: err.message, config: publicConfig(updated) })
    }

    const data = { status: 'active', lastError: null, lastVerifiedAt: new Date() }
    // SES: la tasa máxima de la cuenta queda junto a la credencial para que el
    // envío no la supere, y se avisa si el tope diario pasa la cuota de 24 h.
    if (config.provider === 'ses' && result.info?.maxSendRate) {
      data.credentials = writeCredentials({ ...creds, maxSendRate: result.info.maxSendRate })
      const quota = result.info.max24HourSend
      if (quota && quota > 0 && config.dailyLimit > quota) {
        result.warnings = [...(result.warnings || []), `El tope diario (${config.dailyLimit}) supera la cuota de 24 h de la cuenta de SES (${quota}): bajalo o pedí más cuota a AWS.`]
      }
    }
    if (result.webhook) {
      data.webhookId = result.webhook.id
      data.webhookSecret = encrypt(result.webhook.secret)
    }
    const updated = await prisma.mailingConfig.update({ where: { id: config.id }, data })
    res.json({ config: publicConfig(updated), warnings: result.warnings || [], info: result.info || {} })
  } catch (err) { sendError(res, next, err) }
}

/**
 * PUT /projects/:id/mailing/config/webhook-secret
 * Para cuando la key es de solo envío y el webhook se creó a mano en Resend.
 */
async function saveWebhookSecret(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const secret = String(req.body?.secret || '').trim()
    if (!/^whsec_[A-Za-z0-9+/=]{10,}$/.test(secret)) return res.status(400).json({ error: 'El secreto del webhook tiene que empezar con "whsec_"' })
    const config = await prisma.mailingConfig.findUnique({ where: { projectId: ctx.projectId } })
    if (!config) return res.status(400).json({ error: 'Primero guardá la configuración' })
    const updated = await prisma.mailingConfig.update({ where: { id: config.id }, data: { webhookSecret: encrypt(secret) } })
    res.json(publicConfig(updated))
  } catch (err) { next(err) }
}

module.exports = { getConfig, saveConfig, verifyConfig, saveWebhookSecret }
