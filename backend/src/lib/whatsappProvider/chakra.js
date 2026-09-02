const crypto = require('crypto')
const axios = require('axios')
const FormData = require('form-data')

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

const MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker']

// Base separada de BASE_URL (/v1/ext) — el endpoint de descarga de media de
// Chakra vive bajo /v2/whatsapp, sin pluginId en el path. Confirmado contra
// apidocs.chakrahq.com/api-20534488 el 2026-08-22 (la primera versión de este
// archivo asumía que todo colgaba de /v1/ext/plugin/whatsapp/{pluginId}/api/...,
// que resultó ser el shape correcto SOLO para /messages, no para media).
const MEDIA_SHOW_BASE_URL = 'https://api.chakrahq.com/v2/whatsapp'

/**
 * Descarga un adjunto entrante por su mediaId — `GET /v2/whatsapp/{version}/media/{mediaId}/show`,
 * confirmado contra apidocs.chakrahq.com/api-20534488. A diferencia de la
 * Cloud API real de Meta (metadata con URL temporal + segunda descarga), acá
 * es un solo paso: el endpoint devuelve el binario directo (content-type
 * genérico/wildcard) con el mismo Bearer que el resto de la API. El mimeType
 * real sale del header Content-Type de la respuesta (más confiable que lo que
 * vino en el payload del webhook).
 */
async function downloadMedia({ account, mediaId }) {
  const url = `${MEDIA_SHOW_BASE_URL}/${WHATSAPP_API_VERSION}/media/${mediaId}/show`
  const res = await client(account).get(url, { responseType: 'arraybuffer' })
  const mimeType = res.headers['content-type'] ? String(res.headers['content-type']).split(';')[0].trim() : null
  return { buffer: Buffer.from(res.data), mimeType }
}

/**
 * Sube un archivo para poder referenciarlo en un mensaje saliente —
 * `POST /plugin/whatsapp/{pluginId}/upload-public-media`, confirmado contra
 * apidocs.chakrahq.com/api-11313630. A diferencia de la Cloud API real de
 * Meta (`POST /{phone-number-id}/media` → `media_id` privado), Chakra sube el
 * archivo a un storage público propio y devuelve una URL pública directa —
 * por eso sendMediaMessage manda `link`, no `id` (ver abajo).
 */
function mediaUploadUrl(account) {
  return `/plugin/whatsapp/${account.pluginId}/upload-public-media`
}

async function uploadMedia({ account, buffer, mimeType, fileName }) {
  const form = new FormData()
  form.append('file', buffer, { filename: fileName || 'file', contentType: mimeType })
  if (fileName) form.append('filename', fileName)
  const { data } = await client(account).post(mediaUploadUrl(account), form, { headers: form.getHeaders() })
  return { publicMediaUrl: data?._data?.publicMediaUrl || null }
}

/**
 * Manda un mensaje con adjunto ya subido (uploadMedia) referenciado por su
 * URL pública — mismo endpoint que sendSessionMessage, `type` = kind del
 * media, formato nativo de WhatsApp Cloud API para media por `link` (en vez
 * de `id`, que requeriría el media_id privado de Meta que Chakra no expone).
 * `caption` se omite para audio: el objeto `audio` de la Cloud API de Meta no
 * tiene ese campo documentado (a diferencia de image/video/document).
 */
async function sendMediaMessage({ account, to, mediaUrl, kind, caption, fileName }) {
  const { data } = await client(account).post(messagesUrl(account), {
    messaging_product: 'whatsapp',
    to,
    type: kind,
    [kind]: {
      link: mediaUrl,
      ...(caption && kind !== 'audio' ? { caption } : {}),
      ...(kind === 'document' && fileName ? { filename: fileName } : {}),
    },
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
 * Catálogo de plantillas aprobadas del WABA (Fase 5 del plan). A diferencia
 * de /messages y /media (scoped por pluginId+phoneNumberId), este endpoint
 * cuelga directo del wabaId — confirmado contra apidocs.chakrahq.com/api-17615391,
 * que coincide además con el shape real de la Cloud API de Meta
 * (`GET /{waba-id}/message_templates`), buena señal extra de que el path está
 * bien. Paginado por cursor (`after`); se sigue hasta agotar `paging.next` o
 * un tope duro de páginas (protección ante un catálogo enorme/bucle raro).
 */
function templatesBaseUrl(account) {
  return `/plugin/whatsapp/api/${WHATSAPP_API_VERSION}/${account.wabaId}/message_templates`
}
function templatesListUrl(account, after) {
  const base = `${templatesBaseUrl(account)}?limit=100`
  return after ? `${base}&after=${encodeURIComponent(after)}` : base
}

const MAX_TEMPLATE_PAGES = 10

async function listTemplates({ account }) {
  const templates = []
  let after = null
  for (let page = 0; page < MAX_TEMPLATE_PAGES; page++) {
    const { data } = await client(account).get(templatesListUrl(account, after))
    for (const t of data?.data || []) templates.push(t)
    after = data?.paging?.next ? data.paging.cursors?.after : null
    if (!after) break
  }
  return { templates }
}

/**
 * Crea (envía a revisión de Meta) una plantilla nueva — confirmado contra
 * apidocs.chakrahq.com/api-17615301, mismo path que listTemplates pero POST.
 * v1 solo soporta un componente BODY (sin header/footer/botones, que nada
 * más en el repo lee/renderiza todavía). Si el texto tiene variables
 * `{{n}}`, Meta exige un `example.body_text` con valores de muestra para
 * poder revisarla — sin esto la creación se rechaza.
 */
async function createTemplate({ account, name, language, category, bodyText, bodyExamples }) {
  const bodyComponent = { type: 'BODY', text: bodyText }
  if (bodyExamples?.length) bodyComponent.example = { body_text: [bodyExamples] }
  const { data } = await client(account).post(templatesBaseUrl(account), {
    name, language, category, components: [bodyComponent],
  })
  return { id: data?.id, status: data?.status, category: data?.category }
}

/**
 * Borra una plantilla (aprobada, pendiente o rechazada) — Meta no permite
 * "editar" una plantilla en su lugar, `name`+`language` es la identidad
 * inmutable; la única forma de corregir una rechazada es borrarla y crear
 * otra. Path shape de la Cloud API real: `DELETE /{waba-id}/message_templates
 * ?hsm_id={template_id}&name={name}` borra solo ESE idioma/versión (sin
 * `hsm_id` borraría TODOS los idiomas que compartan el nombre, que no es lo
 * que queremos acá). No confirmado contra la doc pública de Chakra para este
 * verbo en particular (a diferencia de list/create, que sí están linkeadas
 * arriba) — se asume el mismo pass-through 1:1 a la Cloud API que ya se
 * verificó para GET/POST sobre esta misma URL base.
 */
async function deleteTemplate({ account, externalId, name }) {
  await client(account).delete(templatesBaseUrl(account), { params: { hsm_id: externalId, name } })
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
    const media = MEDIA_TYPES.includes(msg.type) ? msg[msg.type] : null
    return {
      kind: 'message',
      wabaId: p.wabaId,
      waMessageId: msg.id || p.messageId,
      from: msg.from || p.contacts?.[0]?.wa_id,
      contactName: p.contacts?.[0]?.profile?.name || null,
      type: msg.type,
      text: msg.type === 'text' ? (msg.text?.body ?? null) : null,
      mediaId: media?.id || null,
      mediaMimeType: media?.mime_type ? String(media.mime_type).split(';')[0].trim() : null,
      mediaCaption: media?.caption || null,
      mediaFileName: media?.filename || null,
      // Reacción del cliente a un mensaje nuestro (👍 etc., ver
      // parseMetaRawFormat para el shape completo). emoji: '' = sacó una
      // reacción que había puesto — el caller lo ignora.
      reactionEmoji: msg.type === 'reaction' ? (msg.reaction?.emoji ?? '') : null,
      reactionToWaMessageId: msg.type === 'reaction' ? (msg.reaction?.message_id || null) : null,
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
 *
 * Coexistence agrega un "change" más con field:"smb_message_echoes" (no
 * "messages") para mensajes salientes mandados a mano desde la app/WhatsApp
 * Web del número, no vía esta API — shape (mismo `entry`/`changes`, otro
 * `value`): { messaging_product, metadata, message_echoes: [{ from, to, id,
 * timestamp, type, text?: { body } }] }. Ver parseMetaRawFormat.
 *
 * Reacciones (el cliente reacciona con 👍 etc. a un mensaje nuestro) llegan
 * como un item más de `messages[]` con `type: "reaction"` y sin `text`:
 * { from, id, timestamp, type: "reaction", reaction: { message_id, emoji } }
 * — `emoji` viene vacío ("") si el cliente SACÓ una reacción que había
 * puesto, `reaction.message_id` es el wamid del mensaje reaccionado (no el
 * id de este evento). Documentado por Meta en la misma URL de arriba.
 */
function parseMetaRawFormat(payload) {
  const entry = payload?.entry?.[0]
  const change = entry?.changes?.[0]
  const value = change?.value
  if (!value) return null
  const wabaId = entry.id

  const message = value.messages?.[0]
  if (message) {
    const contact = value.contacts?.[0]
    const media = MEDIA_TYPES.includes(message.type) ? message[message.type] : null
    return {
      kind: 'message',
      wabaId,
      waMessageId: message.id,
      from: message.from,
      contactName: contact?.profile?.name || null,
      type: message.type,
      text: message.type === 'text' ? (message.text?.body ?? null) : null,
      mediaId: media?.id || null,
      mediaMimeType: media?.mime_type ? String(media.mime_type).split(';')[0].trim() : null,
      mediaCaption: media?.caption || null,
      mediaFileName: media?.filename || null,
      // Reacción del cliente a un mensaje nuestro — shape documentado por
      // Meta: { type: "reaction", reaction: { message_id, emoji } }. emoji
      // vacío ("") = sacó una reacción que había puesto; el caller lo ignora.
      reactionEmoji: message.type === 'reaction' ? (message.reaction?.emoji ?? '') : null,
      reactionToWaMessageId: message.type === 'reaction' ? (message.reaction?.message_id || null) : null,
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

  // Coexistence: eco de un mensaje SALIENTE que alguien del equipo mandó a
  // mano desde la app de WhatsApp Business (o WhatsApp Web vinculado a ese
  // número), no vía esta API — Meta lo entrega en un "change" separado con
  // field:"smb_message_echoes" (confirmado contra la doc pública de Meta:
  // developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_message_echoes).
  // Requiere que el número esté en modo Coexistence Y que el WABA tenga ese
  // campo de webhook suscripto (se activa desde el dashboard del BSP, no acá).
  // `type` puede venir también como "revoke"/"edit" (el remitente borró o
  // editó un mensaje ya ecoado) — no soportado en v1, el caller los ignora.
  const echo = change?.field === 'smb_message_echoes' ? value.message_echoes?.[0] : null
  if (echo) {
    const media = MEDIA_TYPES.includes(echo.type) ? echo[echo.type] : null
    return {
      kind: 'message_echo',
      wabaId,
      waMessageId: echo.id,
      to: echo.to,
      type: echo.type,
      text: echo.type === 'text' ? (echo.text?.body ?? null) : null,
      mediaId: media?.id || null,
      mediaMimeType: media?.mime_type ? String(media.mime_type).split(';')[0].trim() : null,
      mediaCaption: media?.caption || null,
      mediaFileName: media?.filename || null,
      // Alguien del equipo reaccionó a un mensaje del cliente desde la app
      // nativa (mismo shape que una reacción entrante, ver arriba).
      reactionEmoji: echo.type === 'reaction' ? (echo.reaction?.emoji ?? '') : null,
      reactionToWaMessageId: echo.type === 'reaction' ? (echo.reaction?.message_id || null) : null,
      timestamp: echo.timestamp,
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

module.exports = {
  sendSessionMessage, sendTemplateMessage, verifyWebhookSignature, parseInboundEvent,
  downloadMedia, uploadMedia, sendMediaMessage, listTemplates, createTemplate, deleteTemplate,
}
