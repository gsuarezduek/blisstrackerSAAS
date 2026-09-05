const prisma = require('../../lib/prisma')
const { ACTIVE_LEAD_STATUS_KEYS } = require('../../lib/salesCatalog')
const { logLeadEvent } = require('../ventas/_shared')
const { syncTemplates: syncTemplatesFromProvider, createTemplateForAccount, sendTemplateToConversation, deleteTemplateForAccount } = require('../../services/whatsappTemplates.service')
const { assertConversation } = require('./_shared')

/**
 * GET /api/whatsapp/templates  ?status=APPROVED
 * Catálogo cacheado (Fase 5 del plan) — cualquier miembro del equipo
 * comercial. El picker de reapertura filtra por `status=APPROVED`; sin
 * filtro devuelve todo (útil para que un admin vea qué quedó pendiente/
 * rechazado en Meta sin tener que entrar al dashboard de Chakra).
 */
async function listTemplates(req, res, next) {
  try {
    const templates = await prisma.whatsappTemplate.findMany({
      where: { workspaceId: req.workspace.id, ...(req.query.status ? { status: req.query.status } : {}) },
      orderBy: { name: 'asc' },
    })
    res.json(templates)
  } catch (err) { next(err) }
}

/**
 * POST /api/whatsapp/templates/sync
 * Abierto al equipo comercial (salesGuard) — trae el catálogo real desde
 * Chakra y lo cachea. Nunca crea/edita plantillas (eso se sigue haciendo
 * desde el dashboard del BSP, ver "Abierto" de la Fase 5 del plan).
 */
async function syncTemplates(req, res, next) {
  try {
    const account = await prisma.whatsappAccount.findFirst({ where: { workspaceId: req.workspace.id } })
    if (!account) return res.status(400).json({ error: 'No hay ninguna cuenta de WhatsApp conectada', code: 'WHATSAPP_NOT_CONNECTED' })
    if (!account.wabaId) return res.status(400).json({ error: 'A la cuenta le falta el WABA ID — completalo desde "Editar".', code: 'WHATSAPP_MISSING_WABA_ID' })

    let count
    try {
      count = await syncTemplatesFromProvider(account)
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 300) : err.message
      console.error('[WhatsApp] Error sincronizando plantillas vía', account.provider, ':', detail)
      return res.status(502).json({ error: `No se pudieron sincronizar las plantillas: ${detail}` })
    }

    const templates = await prisma.whatsappTemplate.findMany({ where: { workspaceId: req.workspace.id }, orderBy: { name: 'asc' } })
    res.json({ synced: count, templates })
  } catch (err) { next(err) }
}

/**
 * POST /api/whatsapp/templates  { name, language, category, bodyText, bodyExamples? }
 * Crea una plantilla nueva y la manda a revisión de Meta — abierto al equipo
 * comercial (mismo criterio que sync: es operativo, aunque tenga
 * implicancias de aprobación/costo reales detrás). Queda en PENDING hasta
 * que Meta la revise (de minutos a ~1 día);
 * "Sincronizar" trae el estado actualizado más adelante.
 */
async function createTemplate(req, res, next) {
  try {
    const account = await prisma.whatsappAccount.findFirst({ where: { workspaceId: req.workspace.id } })
    if (!account) return res.status(400).json({ error: 'No hay ninguna cuenta de WhatsApp conectada', code: 'WHATSAPP_NOT_CONNECTED' })
    if (!account.wabaId) return res.status(400).json({ error: 'A la cuenta le falta el WABA ID — completalo desde "Editar".', code: 'WHATSAPP_MISSING_WABA_ID' })

    let template
    try {
      template = await createTemplateForAccount(account, req.body)
    } catch (err) {
      if (err.status === 400) return res.status(400).json({ error: err.message })
      const detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 400) : err.message
      console.error('[WhatsApp] Error creando plantilla vía', account.provider, ':', detail)
      return res.status(502).json({ error: `No se pudo crear la plantilla: ${detail}` })
    }

    res.status(201).json(template)
  } catch (err) { next(err) }
}

/**
 * DELETE /api/whatsapp/templates/:id — abierto al equipo comercial (mismo
 * criterio que crear/sincronizar). Meta no permite editar una plantilla
 * rechazada in situ (name+language es su identidad inmutable) — borrar y
 * crear de nuevo es el único camino, así que esto es lo que le falta al
 * flujo para no dejar
 * plantillas rechazadas atascadas para siempre en la lista.
 */
async function deleteTemplate(req, res, next) {
  try {
    const template = await prisma.whatsappTemplate.findFirst({
      where: { id: Number(req.params.id), workspaceId: req.workspace.id },
      include: { account: true },
    })
    if (!template) return res.status(404).json({ error: 'Plantilla no encontrada' })

    const rulesUsingIt = await prisma.whatsappAutomationRule.count({ where: { templateId: template.id } })
    if (rulesUsingIt > 0) {
      return res.status(409).json({
        error: `Esta plantilla está en uso por ${rulesUsingIt} regla${rulesUsingIt > 1 ? 's' : ''} de automatización — borrá o reasigná ${rulesUsingIt > 1 ? 'esas reglas' : 'esa regla'} primero.`,
      })
    }

    try {
      await deleteTemplateForAccount(template.account, template)
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 300) : err.message
      console.error('[WhatsApp] Error borrando plantilla vía', template.account.provider, ':', detail)
      return res.status(502).json({ error: `No se pudo borrar la plantilla en Meta: ${detail}` })
    }

    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * POST /api/whatsapp/conversations/:id/reopen  { templateId, variables? }
 * Único caso en el que se puede mandar algo con la ventana de 24hs vencida
 * (Fase 5 del plan) — manda la plantilla elegida con sus variables, sin
 * tocar `lastInboundAt` (eso solo lo actualiza una respuesta real del
 * contacto, vía el webhook — cuando conteste, la ventana se reabre sola a
 * texto libre, no hace falta ningún estado extra de "reabierta").
 */
async function reopenConversation(req, res, next) {
  try {
    const { templateId, variables } = req.body
    if (!templateId) return res.status(400).json({ error: 'templateId es obligatorio' })

    const conversation = await assertConversation(req)
    const template = await prisma.whatsappTemplate.findFirst({ where: { id: Number(templateId), workspaceId: req.workspace.id } })
    if (!template) return res.status(404).json({ error: 'Plantilla no encontrada' })
    if (template.status !== 'APPROVED') return res.status(400).json({ error: 'Esta plantilla no está aprobada por Meta.' })

    const account = await prisma.whatsappAccount.findFirst({ where: { workspaceId: req.workspace.id } })
    if (!account) return res.status(400).json({ error: 'No hay ninguna cuenta de WhatsApp conectada', code: 'WHATSAPP_NOT_CONNECTED' })
    if (!account.pluginId) {
      return res.status(400).json({ error: 'A la cuenta le falta el Plugin ID — completalo desde "Editar" antes de responder.', code: 'WHATSAPP_MISSING_PLUGIN_ID' })
    }

    const vars = Array.isArray(variables) ? variables.map(v => String(v ?? '')) : []
    if (vars.length !== template.variableCount) {
      return res.status(400).json({ error: `Esta plantilla necesita ${template.variableCount} variable(s), llegaron ${vars.length}.` })
    }

    let message, content
    try {
      ;({ message, content } = await sendTemplateToConversation({
        workspaceId: req.workspace.id, conversation, account, template, variables: vars,
        senderUserId: req.user.userId, senderType: 'user',
      }))
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 300) : err.message
      console.error('[WhatsApp] Error reabriendo conversación vía', account.provider, ':', detail)
      return res.status(502).json({ error: `No se pudo mandar la plantilla: ${detail}`, code: 'WHATSAPP_SEND_FAILED' })
    }

    if (conversation.contactId) {
      const lead = await prisma.lead.findFirst({
        where: { workspaceId: req.workspace.id, primaryContactId: conversation.contactId, status: { in: ACTIVE_LEAD_STATUS_KEYS } },
        select: { id: true },
      })
      if (lead) {
        await logLeadEvent({
          workspaceId: req.workspace.id, leadId: lead.id, userId: req.user.userId, type: 'whatsapp_message',
          content: `reabrió la conversación con la plantilla "${template.name}": "${content.slice(0, 120)}"`,
        })
      }
    }

    res.status(201).json(message)
  } catch (err) { next(err) }
}

module.exports = { listTemplates, syncTemplates, createTemplate, deleteTemplate, reopenConversation }
