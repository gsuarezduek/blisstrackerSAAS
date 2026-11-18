// Proveedor Amazon SES (API v2) con las credenciales IAM DEL CLIENTE. Es el más
// barato a volumen; los rebotes/quejas llegan por SNS (webhooks/mailingSes.webhook.js).
const {
  SESv2Client, SendEmailCommand, GetAccountCommand, GetEmailIdentityCommand,
} = require('@aws-sdk/client-sesv2')

const REGION_RE = /^[a-z]{2}(-gov)?-[a-z]+-\d$/
const DEFAULT_RATE = 10 // mails/seg si no sabemos la cuota de la cuenta

const sleep = ms => new Promise(r => setTimeout(r, ms))

function client(creds) {
  if (!creds?.accessKeyId || !creds?.secretAccessKey || !REGION_RE.test(creds?.region || '')) {
    throw Object.assign(new Error('Faltan las credenciales de Amazon SES (access key, secret y región)'), { fatal: true })
  }
  return new SESv2Client({
    region: creds.region,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
    maxAttempts: 2,
  })
}

// Errores de SES: credenciales/permisos/cuenta pausada invalidan la config;
// throttling y 5xx se reintentan; un mail rechazado (dirección inválida) es permanente.
function classify(err) {
  const name = String(err?.name || err?.Code || '')
  const status = Number(err?.$metadata?.httpStatusCode) || 0
  if (/AccessDenied|InvalidClientTokenId|SignatureDoesNotMatch|UnrecognizedClient|AccountSuspended|SendingPaused|MailFromDomainNotVerified/i.test(name)) {
    return { retryable: false, fatal: true }
  }
  if (/Throttling|TooManyRequests|LimitExceeded/i.test(name) || status === 429 || status >= 500 || !status) {
    return { retryable: true, fatal: false }
  }
  if (/NotFoundException/.test(name) && /identity/i.test(err?.message || '')) return { retryable: false, fatal: true }
  return { retryable: false, fatal: false }
}

function toSesHeaders(headers = {}) {
  return Object.entries(headers).map(([Name, Value]) => ({ Name, Value: String(Value) }))
}

async function sendBatch(creds, messages) {
  const ses = client(creds)
  const rate = Math.max(1, Math.min(50, Number(creds.maxSendRate) || DEFAULT_RATE))
  const gap = Math.ceil(1000 / rate)
  const results = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    try {
      const out = await ses.send(new SendEmailCommand({
        FromEmailAddress: m.from,
        Destination: { ToAddresses: [m.to] },
        ReplyToAddresses: m.replyTo ? [m.replyTo] : undefined,
        ConfigurationSetName: creds.configurationSet || undefined,
        Content: {
          Simple: {
            Subject: { Data: m.subject, Charset: 'UTF-8' },
            Body: { Html: { Data: m.html, Charset: 'UTF-8' }, Text: { Data: m.text || '', Charset: 'UTF-8' } },
            Headers: m.headers && Object.keys(m.headers).length ? toSesHeaders(m.headers) : undefined,
          },
        },
      }))
      results.push({ ok: true, messageId: out.MessageId || null })
    } catch (err) {
      const c = classify(err)
      results.push({ ok: false, error: err.message || err.name, ...c })
      if (c.fatal) {
        for (let k = i + 1; k < messages.length; k++) results.push({ ok: false, error: err.message, ...c })
        break
      }
    }
    if (i < messages.length - 1) await sleep(gap)
  }
  return results
}

/**
 * Verifica las credenciales, que la cuenta pueda enviar, y que el dominio (o el
 * email) del remitente esté verificado. Devuelve la tasa máxima de la cuenta para
 * que el envío no la supere (`info.maxSendRate`, se guarda en las credenciales).
 */
async function verify(creds, { fromEmail }) {
  const ses = client(creds)
  const warnings = []
  let account
  try {
    account = await ses.send(new GetAccountCommand({}))
  } catch (err) {
    throw new Error(`Amazon SES rechazó las credenciales: ${err.message}`)
  }
  if (account.SendingEnabled === false) throw new Error('La cuenta de SES tiene el envío pausado.')
  if (!account.ProductionAccessEnabled) {
    warnings.push('La cuenta de SES está en modo sandbox: solo puede mandar a direcciones verificadas. Pedí acceso a producción en la consola de AWS antes de lanzar una campaña.')
  }

  const email = String(fromEmail || '').toLowerCase()
  const domain = email.split('@')[1]
  let verified = false
  for (const identity of [domain, email]) {
    try {
      const id = await ses.send(new GetEmailIdentityCommand({ EmailIdentity: identity }))
      if (id.VerifiedForSendingStatus) { verified = true; break }
    } catch (err) {
      if (!/NotFound/.test(err.name || '')) throw new Error(`No se pudo revisar el remitente en SES: ${err.message}`)
    }
  }
  if (!verified) throw new Error(`Ni el dominio "${domain}" ni el email "${email}" están verificados en SES (región ${creds.region}).`)

  warnings.push('Para recibir rebotes y quejas, suscribí la URL del webhook a un tópico SNS que reciba las notificaciones del dominio (ver los pasos en esta pantalla).')
  const maxSendRate = account.SendQuota?.MaxSendRate || null
  return {
    warnings,
    info: { sandbox: !account.ProductionAccessEnabled, maxSendRate, max24HourSend: account.SendQuota?.Max24HourSend ?? null },
  }
}

module.exports = { sendBatch, verify, classify, PER_TICK: 200, supportsWebhooks: true, REGION_RE }
