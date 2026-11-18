// Registro de proveedores de Mailing. Cada uno expone la misma interfaz:
//   sendBatch(creds, messages) → [{ ok, messageId?, error?, retryable?, fatal? }]
//   verify(creds, ctx)         → { warnings, info, webhook? }  (lanza si no sirve)
//   PER_TICK                   → cuántos mails toma por tick del dispatcher
//   supportsWebhooks           → si avisa entregas/rebotes/quejas
const resend = require('./resend')
const smtp = require('./smtp')
const ses = require('./ses')

const PROVIDERS = { resend, smtp, ses }
const PROVIDER_KEYS = Object.keys(PROVIDERS)

function getProvider(key) {
  const p = PROVIDERS[key]
  if (!p) throw new Error(`Proveedor de mail desconocido: ${key}`)
  return p
}

module.exports = { getProvider, PROVIDER_KEYS }
