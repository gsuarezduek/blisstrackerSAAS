const crypto = require('crypto')
const axios = require('axios')

const BASE_URL = 'https://api.chakrahq.com/v1/ext'

// Versión de la WhatsApp Cloud API que Chakra pasa por delante en su proxy
// (path param, no header). Igual criterio que LINKEDIN_API_VERSION en
// linkedin.service.js: constante con override por env var, porque Meta
// deprecia versiones ~cada 12 meses y en algún momento hay que subirla.
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0'

function client(account) {
  return axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${account.accessToken}` },
    timeout: 15000,
  })
}

// Confirmado contra apidocs.chakrahq.com (api-22547477 / api-26944128): tanto
// el mensaje de sesión como el de plantilla van al MISMO endpoint — es el
// pass-through de Chakra a la propia API de mensajes de Meta, diferenciado
// solo por el campo `type` del body. Requiere pluginId (UUID del "plugin" de
// WhatsApp en Chakra) como parte de la URL, no solo el accessToken.
function messagesUrl(account) {
  return `/plugin/whatsapp/${account.pluginId}/api/${WHATSAPP_API_VERSION}/${account.phoneNumberId}/messages`
}

function extractMessageId(data) {
  return data?._data?.whatsappMessageId ?? null
}

/**
 * Manda un mensaje de texto libre (dentro de la ventana de 24hs del último
 * mensaje entrante). Body y respuesta confirmados contra la doc real
 * (apidocs.chakrahq.com/api-22547477) — sigue el formato nativo de WhatsApp
 * Cloud API, no una simplificación propia de Chakra.
 */
async function sendSessionMessage({ account, to, text }) {
  const { data } = await client(account).post(messagesUrl(account), {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  })
  return { waMessageId: extractMessageId(data) }
}

/**
 * Mensaje de plantilla aprobada (para reabrir conversación fuera de la
 * ventana de 24hs — Fase 5 del plan). Confirmado contra
 * apidocs.chakrahq.com/api-26944128 — mismo endpoint que sendSessionMessage,
 * body en formato nativo de WhatsApp Cloud API (`template.name`/`language`/
 * `components`), no el `{templateName, mapping, imageUrl}` que sugería el
 * README del SDK (ese es azúcar sintáctico del lado del SDK, no el body real).
 */
async function sendTemplateMessage({ account, to, templateName, languageCode = 'es_AR', components = [] }) {
  const { data } = await client(account).post(messagesUrl(account), {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { policy: 'deterministic', code: languageCode },
      components,
    },
  })
  return { waMessageId: extractMessageId(data) }
}

/**
 * Confirmado (apidocs.chakrahq.com/doc-919167): HMAC-SHA256 sobre el body RAW
 * (string, no el JSON parseado), con el secret configurado en Admin ▸ Team ▸
 * Secrets del dashboard de Chakra. Header `X-Chakra-Signature-256`, sin
 * prefijo "sha256=". La codificación del hash (hex vs base64) no se pudo
 * confirmar explícitamente en la doc pública — se asume hex por ser la
 * convención estándar de este tipo de firma (mismo criterio que
 * X-Hub-Signature-256 de Meta, que Chakra imita quitando el prefijo).
 * Verificar contra un webhook real antes de confiar en producción.
 */
function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(String(signatureHeader), 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * Formato propio de Chakra (apidocs.chakrahq.com/doc-919167) — solo se recibe
 * si la cuenta tiene configurada la "Chakra webhook url" (no la pass-through).
 * Dos shapes de evento: "message" (entrante) y "status" (delivery status).
 */
function parseChakraFormat(payload) {
  if (payload?.event === 'message') {
    const p = payload.payload || {}
    const msg = p.message || {}
    return {
      kind: 'message',
      wabaId: p.wabaId,
      waMessageId: msg.id || p.messageId,
      from: msg.from || p.contacts?.[0]?.wa_id,
      contactName: p.contacts?.[0]?.profile?.name || null,
      type: msg.type,
      text: msg.type === 'text' ? (msg.text?.body ?? null) : null,
      timestamp: msg.timestamp || p.timestamp,
    }
  }
  if (payload?.event === 'status') {
    const p = payload.payload || {}
    return {
      kind: 'status',
      wabaId: p.wabaId,
      waMessageId: p.id,
      status: p.deliveryStatus, // delivered | read | failed
      timestamp: p.timestamp,
    }
  }
  return null
}

/**
 * Formato crudo de WhatsApp Cloud API (Meta) — CONFIRMADO contra un webhook
 * real el 2026-08-22. Es lo que llega cuando la cuenta tiene configurada la
 * URL de "pass-through" en vez de la "Chakra webhook url" (que nunca llegó a
 * probarse). Shape estándar de Meta, documentado públicamente:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 *
 * {
 *   object: "whatsapp_business_account",
 *   entry: [{ id: "<wabaId>", changes: [{ field: "messages", value: {
 *     metadata: { phone_number_id, display_phone_number },
 *     contacts: [{ profile: { name }, wa_id }],
 *     messages: [{ from, id, timestamp, type, text: { body } }],
 *     statuses: [{ id, status, timestamp, recipient_id }],
 *   }}] }],
 * }
 */
function parseMetaRawFormat(payload) {
  const entry = payload?.entry?.[0]
  const value = entry?.changes?.[0]?.value
  if (!value) return null
  const wabaId = entry.id

  const message = value.messages?.[0]
  if (message) {
    const contact = value.contacts?.[0]
    return {
      kind: 'message',
      wabaId,
      waMessageId: message.id,
      from: message.from,
      contactName: contact?.profile?.name || null,
      type: message.type,
      text: message.type === 'text' ? (message.text?.body ?? null) : null,
      timestamp: message.timestamp,
    }
  }

  const status = value.statuses?.[0]
  if (status) {
    return {
      kind: 'status',
      wabaId,
      waMessageId: status.id,
      status: status.status, // sent | delivered | read | failed
      timestamp: status.timestamp,
    }
  }

  return null
}

/**
 * Acepta cualquiera de los dos shapes (pass-through de Meta o formato propio
 * de Chakra) sin que dependa de cuál URL de webhook terminó configurada en el
 * dashboard — más robusto que forzar una sola. Devuelve null si no matchea
 * ninguna, el caller decide si lo ignora o lo loguea.
 */
function parseInboundEvent(payload) {
  return parseMetaRawFormat(payload) || parseChakraFormat(payload)
}

module.exports = { sendSessionMessage, sendTemplateMessage, verifyWebhookSignature, parseInboundEvent }
