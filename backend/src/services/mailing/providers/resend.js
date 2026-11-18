// Proveedor Resend con la API key DEL CLIENTE (no la de la plataforma, que vive
// en services/email/_shared.js y manda los mails transaccionales de BlissTracker).
const { Resend } = require('resend')

const BATCH_SIZE = 100 // tope de la Batch API de Resend
const BATCH_DELAY_MS = 600 // Resend limita por requests/seg por cuenta (default 2 rps)

const sleep = ms => new Promise(r => setTimeout(r, ms))

function client(creds) {
  if (!creds?.apiKey) throw Object.assign(new Error('Falta la API key de Resend'), { fatal: true })
  return new Resend(creds.apiKey)
}

// Errores de toda la request (no de un mail puntual). Auth/permisos invalidan la
// configuración entera; rate limit y 5xx se reintentan más tarde.
function classify(error) {
  const status = Number(error?.statusCode) || 0
  const name = String(error?.name || '')
  if (status === 401 || status === 403 || /api_key|restricted|unauthorized|forbidden/i.test(name)) {
    return { retryable: false, fatal: true }
  }
  if (status === 429 || status >= 500 || /rate_limit|application_error|internal_server/i.test(name) || !status) {
    return { retryable: true, fatal: false }
  }
  return { retryable: false, fatal: false }
}

/**
 * @param {object} creds    { apiKey }
 * @param {Array}  messages [{ from, replyTo, to, subject, html, text, headers }]
 * @returns {Promise<Array<{ ok, messageId?, error?, retryable?, fatal? }>>} mismo orden que `messages`
 */
async function sendBatch(creds, messages) {
  const resend = client(creds)
  const results = []
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE)
    if (i > 0) await sleep(BATCH_DELAY_MS)
    let res
    try {
      res = await resend.batch.send(
        chunk.map(m => ({
          from: m.from, to: [m.to], subject: m.subject, html: m.html, text: m.text,
          headers: m.headers, ...(m.replyTo ? { replyTo: m.replyTo } : {}),
        })),
        { batchValidation: 'permissive' },
      )
    } catch (err) {
      res = { error: { message: err.message, name: 'network_error' } }
    }
    if (res?.error) {
      const c = classify(res.error)
      for (let k = 0; k < chunk.length; k++) results.push({ ok: false, error: res.error.message || 'Error de Resend', ...c })
      // Una key inválida no se arregla en el próximo chunk.
      if (c.fatal) {
        for (let k = i + BATCH_SIZE; k < messages.length; k++) results.push({ ok: false, error: res.error.message, ...c })
        return results
      }
      continue
    }
    // Modo permissive: los inválidos vuelven en `errors` con su índice y el resto
    // se manda. `data` trae los ids de los enviados, en el orden del lote.
    const failed = new Map((res?.data?.errors || []).map(e => [e.index, e.message]))
    const ids = (res?.data?.data || []).map(d => d.id)
    let idPos = 0
    for (let k = 0; k < chunk.length; k++) {
      if (failed.has(k)) results.push({ ok: false, error: failed.get(k) || 'Rechazado por Resend', retryable: false })
      else results.push({ ok: true, messageId: ids[idPos++] || null })
    }
  }
  return results
}

/**
 * Valida la key y el dominio del remitente. Si la key tiene permisos completos,
 * además crea (una sola vez) el webhook de entregas/rebotes/quejas en la cuenta
 * del cliente — así no tiene que configurarlo a mano.
 */
async function verify(creds, { fromEmail, webhookUrl, webhookId }) {
  const resend = client(creds)
  const warnings = []
  const info = {}

  const { data, error } = await resend.domains.list()
  if (error) {
    const restricted = /restricted/i.test(error.name || '') || /restricted/i.test(error.message || '')
    if (!restricted) throw new Error(`Resend rechazó la API key: ${error.message}`)
    warnings.push('La API key es de solo envío: no pudimos revisar el dominio ni crear el webhook de rebotes. Usá una key con acceso completo o cargá el secreto del webhook a mano.')
    return { warnings, info: { restrictedKey: true } }
  }

  const domain = String(fromEmail || '').split('@')[1]?.toLowerCase()
  const domains = data?.data || []
  const match = domains.find(d => d.name?.toLowerCase() === domain)
  info.domain = match ? { name: match.name, status: match.status } : null
  if (!match) throw new Error(`El dominio "${domain}" no está agregado en esta cuenta de Resend.`)
  if (match.status !== 'verified') throw new Error(`El dominio "${domain}" todavía no está verificado en Resend (estado: ${match.status}).`)
  if (match.open_tracking || match.click_tracking) {
    warnings.push('El dominio tiene activado el tracking propio de Resend. Desactivalo (Domains → Configuration): BlissTracker ya mide aperturas y clics, y con los dos activos los links se reescriben dos veces.')
  }

  let webhook = null
  if (!webhookId && webhookUrl) {
    if (!/^https:\/\//.test(webhookUrl)) {
      warnings.push('No se creó el webhook de rebotes: el backend no tiene una URL pública https (BACKEND_URL).')
    } else {
      const w = await resend.webhooks.create({
        endpoint: webhookUrl,
        events: ['email.delivered', 'email.bounced', 'email.complained'],
      })
      if (w.error) warnings.push(`No se pudo crear el webhook de rebotes en Resend: ${w.error.message}`)
      else webhook = { id: w.data.id, secret: w.data.signing_secret }
    }
  }
  return { warnings, info, webhook }
}

module.exports = { sendBatch, verify, classify, PER_TICK: 200, supportsWebhooks: true }
