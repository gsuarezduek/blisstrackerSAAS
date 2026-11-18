// Lectura de la configuración de Mailing de un proyecto: credenciales cifradas,
// forma pública (sin secretos) y helpers de remitente / URLs públicas.
const prisma = require('../../lib/prisma')
const { encrypt, decrypt } = require('../../lib/encryption')

function backendBase() {
  return (process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '')
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
    webhookConfigured: !!webhookSecret,
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
  backendBase, webhookUrlFor, readCredentials, writeCredentials,
  publicConfig, formatFrom, loadConfig,
}
