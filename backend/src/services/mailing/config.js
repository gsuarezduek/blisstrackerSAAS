// Lectura de la configuración de Mailing de un proyecto: credenciales cifradas,
// forma pública (sin secretos) y helpers de remitente / URLs públicas.
const prisma = require('../../lib/prisma')
const { encrypt, decrypt } = require('../../lib/encryption')

function backendBase() {
  return (process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '')
}

// Páginas públicas de la SPA (baja, confirmación de suscripción): dominio raíz.
// En desarrollo, FRONTEND_URL.
function frontendBase() {
  if (process.env.NODE_ENV !== 'production' && process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/$/, '')
  return `https://${process.env.APP_DOMAIN || 'blisstracker.app'}`
}

function webhookUrlFor(config) {
  return `${backendBase()}/api/mailing/webhook/${config.provider}/${config.webhookToken}`
}

function readCredentials(config) {
  if (!config?.credentials) return null
  try { return JSON.parse(decrypt(config.credentials)) } catch { return null }
}

function writeCredentials(obj) {
  return obj ? encrypt(JSON.stringify(obj)) : null
}

// Lo único que se muestra de una credencial: lo justo para reconocerla.
function credentialsHint(provider, creds) {
  if (!creds) return null
  if (provider === 'resend') return creds.apiKey ? `re_…${String(creds.apiKey).slice(-4)}` : null
  if (provider === 'smtp') return { host: creds.host, port: creds.port, user: creds.user || null }
  if (provider === 'ses') return { region: creds.region, accessKeyId: creds.accessKeyId ? `${String(creds.accessKeyId).slice(0, 4)}…${String(creds.accessKeyId).slice(-4)}` : null, configurationSet: creds.configurationSet || null }
  return null
}

/** Forma pública: NUNCA incluye `credentials` ni `webhookSecret`. */
function publicConfig(config) {
  if (!config) return null
  const creds = readCredentials(config)
  const { credentials, webhookSecret, webhookToken, ...rest } = config
  return {
    ...rest,
    configured: !!creds,
    credentialsHint: credentialsHint(config.provider, creds),
    // Resend: el secreto de firma. SES: el tópico SNS confirmado (no hay secreto, firma AWS).
    webhookConfigured: config.provider === 'ses' ? !!config.webhookId : !!webhookSecret,
    webhookUrl: config.provider === 'smtp' ? null : webhookUrlFor(config),
  }
}

function formatFrom(config) {
  const email = config.fromEmail
  const name = (config.fromName || '').replace(/["<>\r\n]/g, '').trim()
  return name ? `"${name}" <${email}>` : email
}

async function loadConfig(projectId) {
  return prisma.mailingConfig.findUnique({ where: { projectId } })
}

module.exports = {
  backendBase, frontendBase, webhookUrlFor, readCredentials, writeCredentials,
  publicConfig, formatFrom, loadConfig,
}
