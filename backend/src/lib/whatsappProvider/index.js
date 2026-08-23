/**
 * Adaptador de proveedor de WhatsApp — contrato común para no atar el resto del
 * código a la API de un BSP en particular (Fase 0 del plan de WhatsApp en Ventas).
 * Hoy solo hay una implementación (Chakra); si se cambia de BSP más adelante, el
 * cambio queda contenido en el archivo del adaptador nuevo + esta tabla.
 *
 * Cada adaptador expone:
 *   sendSessionMessage({ account, to, text })                        → { waMessageId }
 *   sendTemplateMessage({ account, to, templateName, mapping, ... }) → { waMessageId }
 *   verifyWebhookSignature(rawBody, signatureHeader, secret)         → boolean
 *   parseInboundEvent(payload)                                       → evento normalizado | null
 *   downloadMedia({ account, mediaId })                              → { buffer, mimeType } (Fase 3)
 *   uploadMedia({ account, buffer, mimeType, fileName })             → { publicMediaUrl } (Fase 3)
 *   sendMediaMessage({ account, to, mediaUrl, kind, caption, fileName }) → { waMessageId } (Fase 3)
 *   listTemplates({ account })                                       → { templates: [...] } (Fase 5, raw shape de Meta)
 *
 * `account` es siempre una fila de WhatsappAccount con accessToken ya
 * descifrado (ver decryptAccount en este mismo archivo) — ningún adaptador
 * conoce el formato de cifrado, eso es responsabilidad del caller.
 */
const { decrypt } = require('../encryption')

const PROVIDERS = {
  chakra: require('./chakra'),
}

function getProvider(key) {
  const provider = PROVIDERS[key]
  if (!provider) throw new Error(`Proveedor de WhatsApp desconocido: "${key}"`)
  return provider
}

/** Devuelve la cuenta con accessToken/webhookSecret descifrados, lista para pasarle a un adaptador. */
function decryptAccount(account) {
  return {
    ...account,
    accessToken: decrypt(account.accessToken),
    webhookSecret: decrypt(account.webhookSecret),
  }
}

module.exports = { getProvider, decryptAccount }
