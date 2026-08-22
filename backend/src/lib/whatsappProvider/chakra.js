const crypto = require('crypto')
const axios = require('axios')

const BASE_URL = 'https://api.chakrahq.com/v1/ext'

function client(account) {
  return axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${account.accessToken}` },
    timeout: 15000,
  })
}

/**
 * Manda un mensaje de texto libre (dentro de la ventana de 24hs del último
 * mensaje entrante).
 *
 * ⚠️ Path NO confirmado contra documentación pública de Chakra — solo se pudo
 * verificar el endpoint de plantillas (ver sendTemplateMessage, tomado del SDK
 * oficial). La doc pública de apidocs.chakrahq.com no expone el endpoint de
 * mensaje de sesión en lo que se pudo relevar sin una cuenta real. Confirmar
 * el path exacto contra el dashboard/docs de la cuenta de Chakra antes de
 * depender de esto — ver Fase 1 del plan de WhatsApp, sección "Abierto".
 */
async function sendSessionMessage({ account, to, text }) {
  const { data } = await client(account).post('/whatsapp/session-messages/send', {
    whatsappPhoneNumberId: account.phoneNumberId,
    toPhoneNumber: to,
    text,
  })
  return { waMessageId: data?.messageId ?? data?.id }
}

/**
 * Mensaje de plantilla aprobada (para reabrir conversación fuera de la ventana
 * de 24hs — Fase 5 del plan). Shape confirmado por el SDK oficial de Chakra
 * (github.com/chakrahq/chakra-chat-sdk):
 *   client.whatsapp.templateMessages.send({ pluginId, toPhoneNumber, whatsappPhoneNumberId, templateName, mapping, imageUrl })
 * Acá se replica la misma llamada por REST directo (mismo base URL/auth que el
 * resto del adaptador) en vez de sumar el SDK como dependencia — el path REST
 * exacto (a diferencia del método del SDK) tampoco está confirmado en docs
 * públicas; mismo caveat que sendSessionMessage.
 */
async function sendTemplateMessage({ account, to, templateName, mapping = [], imageUrl }) {
  const { data } = await client(account).post('/whatsapp/template-messages/send', {
    pluginId: account.pluginId,
    whatsappPhoneNumberId: account.phoneNumberId,
    toPhoneNumber: to,
    templateName,
    mapping,
    imageUrl,
  })
  return { waMessageId: data?.messageId ?? data?.id }
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
 * Confirmado (apidocs.chakrahq.com/doc-919167). Dos shapes de evento:
 * "message" (entrante) y "status" (delivery status). Devuelve null si el
 * evento no es reconocido — el caller decide si lo ignora o lo loguea.
 */
function parseInboundEvent(payload) {
  if (payload?.event === 'message') {
    const p = payload.payload || {}
    const msg = p.message || {}
    return {
      kind: 'message',
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
      waMessageId: p.id,
      status: p.deliveryStatus, // delivered | read | failed
      timestamp: p.timestamp,
    }
  }
  return null
}

module.exports = { sendSessionMessage, sendTemplateMessage, verifyWebhookSignature, parseInboundEvent }
