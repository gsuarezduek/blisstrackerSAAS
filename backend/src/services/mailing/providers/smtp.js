// Proveedor SMTP genérico (Google Workspace, hosting del cliente, etc.) con
// nodemailer. A diferencia de Resend/SES no hay webhooks: solo nos enteramos de
// los rechazos sincrónicos del servidor. Un rebote que llega después por mail al
// buzón del remitente no se ve acá — la UI lo avisa.
const nodemailer = require('nodemailer')
const dns = require('dns').promises
const net = require('net')
const { isPrivateIp } = require('../../../lib/safeUrl')

const ALLOWED_PORTS = [25, 465, 587, 2525]
const SEND_DELAY_MS = 150

const sleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * El host lo escribe un usuario del workspace y la conexión sale desde nuestro
 * servidor: sin esto se podría usar el "Verificar" como escáner de la red interna
 * (SSRF). Se valida al guardar y antes de cada envío (un DNS puede cambiar de IP).
 */
async function assertPublicSmtpHost(host, port) {
  if (!ALLOWED_PORTS.includes(Number(port))) throw new Error(`Puerto SMTP no permitido (usá ${ALLOWED_PORTS.join(', ')})`)
  const h = String(host || '').trim().toLowerCase()
  if (!h) throw new Error('Falta el servidor SMTP')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    throw new Error('No se permite un servidor SMTP local')
  }
  if (net.isIP(h)) {
    if (isPrivateIp(h)) throw new Error('No se permite un servidor SMTP en una IP privada')
    return
  }
  const addrs = await dns.lookup(h, { all: true })
  if (!addrs.length) throw new Error('No se pudo resolver el servidor SMTP')
  if (addrs.some(a => isPrivateIp(a.address))) throw new Error('El servidor SMTP resuelve a una IP privada')
}

function transport(creds) {
  const port = Number(creds.port) || 587
  return nodemailer.createTransport({
    host: creds.host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: creds.user ? { user: creds.user, pass: creds.pass } : undefined,
    pool: true,
    maxConnections: 2,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  })
}

// Códigos SMTP: 4xx = temporal (reintentar), 5xx = permanente. Los errores sin
// código son de conexión/autenticación.
function classify(err) {
  const code = Number(err?.responseCode) || 0
  if (err?.code === 'EAUTH') return { retryable: false, fatal: true }
  if (code >= 500) return { retryable: false, fatal: false }
  if (code >= 400) return { retryable: true, fatal: false }
  // ECONNECTION, ETIMEDOUT, ESOCKET, EDNS…: el servidor no responde, el resto del
  // lote va a fallar igual.
  return { retryable: true, fatal: false, abort: true }
}

async function sendBatch(creds, messages) {
  await assertPublicSmtpHost(creds.host, creds.port)
  const t = transport(creds)
  const results = []
  try {
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]
      try {
        const info = await t.sendMail({
          from: m.from, to: m.to, replyTo: m.replyTo || undefined,
          subject: m.subject, html: m.html, text: m.text, headers: m.headers,
        })
        results.push({ ok: true, messageId: info.messageId || null })
      } catch (err) {
        const c = classify(err)
        results.push({ ok: false, error: err.response || err.message, retryable: c.retryable, fatal: c.fatal })
        if (c.fatal || c.abort) {
          for (let k = i + 1; k < messages.length; k++) {
            results.push({ ok: false, error: err.message, retryable: c.retryable, fatal: c.fatal })
          }
          break
        }
      }
      if (i < messages.length - 1) await sleep(SEND_DELAY_MS)
    }
  } finally {
    t.close()
  }
  return results
}

async function verify(creds) {
  await assertPublicSmtpHost(creds.host, creds.port)
  const t = transport({ ...creds, pool: false })
  try {
    await t.verify()
  } catch (err) {
    throw new Error(`El servidor SMTP rechazó la conexión: ${err.response || err.message}`)
  } finally {
    t.close()
  }
  return {
    warnings: ['Con SMTP no recibimos los rebotes ni las quejas de spam: solo los rechazos inmediatos del servidor. Revisá el buzón del remitente y depurá la base a mano.'],
    info: {},
  }
}

module.exports = { sendBatch, verify, classify, assertPublicSmtpHost, PER_TICK: 30, supportsWebhooks: false }
