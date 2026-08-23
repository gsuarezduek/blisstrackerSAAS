const prisma = require('../lib/prisma')
const { getProvider, decryptAccount } = require('../lib/whatsappProvider')
const { emitTo } = require('../lib/socket')

/** Reemplaza {{1}}, {{2}}… por los valores dados, en orden — para mostrar el
 * texto legible en nuestro propio hilo (Meta solo ve los `parameters`, no el
 * texto renderizado). */
function renderTemplateBody(bodyText, variables = []) {
  if (!bodyText) return ''
  return bodyText.replace(/\{\{(\d+)\}\}/g, (match, n) => variables[Number(n) - 1] ?? match)
}

/**
 * Sincroniza el catálogo de plantillas del WABA (Fase 5 del plan) — solo
 * lectura de nuestro lado, ver WhatsappTemplate en el schema. Upsert por
 * (accountId, externalId) para no duplicar en re-sincronizaciones.
 */
async function syncTemplates(account) {
  const provider = getProvider(account.provider)
  const decrypted = decryptAccount(account)
  const { templates } = await provider.listTemplates({ account: decrypted })

  for (const t of templates) {
    const bodyComponent = (t.components || []).find(c => String(c.type).toUpperCase() === 'BODY')
    const bodyText = bodyComponent?.text || null
    const variableCount = bodyText ? (bodyText.match(/\{\{\d+\}\}/g) || []).length : 0

    await prisma.whatsappTemplate.upsert({
      where: { accountId_externalId: { accountId: account.id, externalId: String(t.id) } },
      update: {
        name: t.name, language: t.language, category: t.category, status: t.status,
        bodyText, variableCount, syncedAt: new Date(),
      },
      create: {
        workspaceId: account.workspaceId, accountId: account.id, externalId: String(t.id),
        name: t.name, language: t.language, category: t.category, status: t.status,
        bodyText, variableCount,
      },
    })
  }

  return templates.length
}

const VALID_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION']
const NAME_RE = /^[a-z0-9_]+$/

// Meta exige minúsculas/números/guión bajo — normaliza en vez de solo
// rechazar, para no obligar al admin a adivinar el formato exacto.
function normalizeTemplateName(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}

/**
 * Crea una plantilla nueva y la manda a revisión de Meta (Fase 5 del plan,
 * antes de solo lectura). v1 solo BODY (ver createTemplate en chakra.js).
 * Queda cacheada en estado PENDING de entrada — "Sincronizar" trae el estado
 * real más adelante (no hay webhook de status de plantillas en esta versión,
 * Meta revisa de forma asíncrona, de minutos a ~1 día).
 */
async function createTemplateForAccount(account, { name, language, category, bodyText, bodyExamples = [] }) {
  const normalizedName = normalizeTemplateName(name)
  if (!normalizedName || !NAME_RE.test(normalizedName)) {
    const err = new Error('El nombre debe tener solo minúsculas, números y guiones bajos')
    err.status = 400
    throw err
  }
  if (!VALID_CATEGORIES.includes(category)) {
    const err = new Error('Categoría inválida')
    err.status = 400
    throw err
  }
  const text = String(bodyText || '').trim()
  if (!text) {
    const err = new Error('El texto del mensaje es obligatorio')
    err.status = 400
    throw err
  }
  const variableCount = (text.match(/\{\{\d+\}\}/g) || []).length
  const examples = (bodyExamples || []).map(v => String(v || '').trim()).filter(Boolean)
  if (variableCount > 0 && examples.length !== variableCount) {
    const err = new Error(`Esta plantilla tiene ${variableCount} variable(s) — hace falta un texto de ejemplo para cada una (Meta lo exige para poder revisarla)`)
    err.status = 400
    throw err
  }

  const provider = getProvider(account.provider)
  const decrypted = decryptAccount(account)
  const result = await provider.createTemplate({
    account: decrypted, name: normalizedName, language, category, bodyText: text,
    bodyExamples: variableCount > 0 ? examples : undefined,
  })
  if (!result.id) throw new Error('Meta no devolvió un id de plantilla')

  return prisma.whatsappTemplate.create({
    data: {
      workspaceId: account.workspaceId, accountId: account.id, externalId: String(result.id),
      name: normalizedName, language, category: result.category || category, status: result.status || 'PENDING',
      bodyText: text, variableCount,
    },
  })
}

/**
 * Manda una plantilla ya aprobada a una conversación y deja el registro
 * (mensaje + estado de la conversación + realtime) — el único código que
 * realmente le pega al BSP para reabrir. Extraído de reopenConversation
 * (whatsapp.controller.js) para que el motor de reglas automáticas
 * (whatsappAutomation.service.js) lo reuse sin duplicar la llamada al
 * proveedor. El caller es responsable de validar `variables.length ===
 * template.variableCount` ANTES de llamar — acá no se vuelve a validar para
 * poder distinguir "plantilla mal configurada" (falla dura para el humano
 * que reabre a mano) de "regla desactualizada" (se loguea y se saltea, sin
 * romper el cron para las demás reglas/leads).
 */
async function sendTemplateToConversation({ workspaceId, conversation, account, template, variables = [], senderUserId = null, senderType = 'user' }) {
  const provider = getProvider(account.provider)
  const decrypted = decryptAccount(account)
  const { waMessageId } = await provider.sendTemplateMessage({
    account: decrypted, to: conversation.phoneE164, templateName: template.name, languageCode: template.language,
    components: variables.length ? [{ type: 'body', parameters: variables.map(v => ({ type: 'text', text: v })) }] : [],
  })

  const content = renderTemplateBody(template.bodyText, variables)
  const message = await prisma.whatsappMessage.create({
    data: {
      workspaceId, conversationId: conversation.id, direction: 'out', content,
      waMessageId: waMessageId || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      senderType, senderUserId, status: 'sent', viaTemplate: true,
    },
    include: { senderUser: { select: { id: true, name: true, avatar: true } } },
  })

  await prisma.whatsappConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } })
  if (senderUserId) {
    await prisma.whatsappConversationRead.upsert({
      where: { conversationId_userId: { conversationId: conversation.id, userId: senderUserId } },
      update: { lastReadMessageId: message.id, lastReadAt: new Date() },
      create: { workspaceId, conversationId: conversation.id, userId: senderUserId, lastReadMessageId: message.id },
    })
  }

  emitTo(`workspace:${workspaceId}`, 'whatsapp:message', { conversationId: conversation.id, message })
  return { message, content }
}

module.exports = { syncTemplates, renderTemplateBody, createTemplateForAccount, sendTemplateToConversation }
