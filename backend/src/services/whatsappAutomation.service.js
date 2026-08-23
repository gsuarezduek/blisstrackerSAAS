const prisma = require('../lib/prisma')
const { enabledWorkspaceIds } = require('../lib/featureFlags')
const { ACTIVE_LEAD_STATUS_KEYS } = require('../lib/salesCatalog')
const { MERGE_TOKENS } = require('../lib/whatsappAutomationCatalog')
const { sendTemplateToConversation } = require('./whatsappTemplates.service')
const { logLeadEvent } = require('../controllers/ventas/_shared')

// Tope duro por regla y corrida (no configurable en v1) — protege la calidad
// del número: aunque una regla mal configurada matchee cientos de leads, esta
// corrida manda como mucho esto y retoma el resto al día siguiente.
const MAX_SENDS_PER_RULE_PER_RUN = 30
const SEND_DELAY_MS = 400 // entre envíos, para no ráfaguear al BSP/Meta
const DAY_MS = 24 * 60 * 60 * 1000

function daysSince(date) {
  return (Date.now() - new Date(date).getTime()) / DAY_MS
}

function safeJsonArray(raw) {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// Resuelve WhatsappAutomationRule.variableMapping (JSON array de strings, uno
// por {{n}} del template) contra un lead puntual — reemplaza los merge tags
// reconocidos (whatsappAutomationCatalog.js), deja el resto del texto tal cual.
function resolveVariableMapping(mappingJson, ctx) {
  const values = { '{{contact_name}}': ctx.contactName, '{{company_name}}': ctx.companyName, '{{lead_title}}': ctx.leadTitle, '{{owner_name}}': ctx.ownerName }
  return safeJsonArray(mappingJson).map(entry => {
    let out = String(entry ?? '')
    for (const { key } of MERGE_TOKENS) out = out.split(key).join(values[key] || '')
    return out
  })
}

async function findCandidateLeads(rule, workspaceId) {
  const statusFilter = safeJsonArray(rule.statusFilter)
  const originFilter = safeJsonArray(rule.originFilter)
  return prisma.lead.findMany({
    where: {
      workspaceId,
      archived: false,
      status: { in: statusFilter.length ? statusFilter : ACTIVE_LEAD_STATUS_KEYS },
      ...(originFilter.length ? { origin: { in: originFilter } } : {}),
      primaryContactId: { not: null },
    },
    select: {
      id: true, title: true, primaryContactId: true,
      primaryContact: { select: { name: true } },
      company: { select: { name: true } },
      owner: { select: { name: true } },
      ...(rule.triggerType === 'action_overdue_days' ? {
        actions: { where: { status: 'pending', dueAt: { not: null } }, orderBy: { dueAt: 'asc' }, take: 1, select: { dueAt: true } },
      } : {}),
    },
  })
}

function qualifies(rule, lead, conversation) {
  if (rule.triggerType === 'no_reply_days') {
    return daysSince(conversation.lastInboundAt || conversation.createdAt) >= rule.triggerDays
  }
  // action_overdue_days
  const oldest = lead.actions?.[0]
  return !!oldest && daysSince(oldest.dueAt) >= rule.triggerDays
}

async function runRule(rule, workspaceId, account) {
  let sent = 0, failed = 0
  if (rule.template.status !== 'APPROVED') return { sent, failed }

  const leads = await findCandidateLeads(rule, workspaceId)
  if (leads.length === 0) return { sent, failed }

  const contactIds = leads.map(l => l.primaryContactId)
  const conversations = await prisma.whatsappConversation.findMany({ where: { workspaceId, contactId: { in: contactIds } } })
  const conversationByContact = new Map(conversations.map(c => [c.contactId, c]))

  let processed = 0
  for (const lead of leads) {
    if (processed >= MAX_SENDS_PER_RULE_PER_RUN) {
      console.warn(`[WhatsappAutomation] Regla "${rule.name}" alcanzó el tope de ${MAX_SENDS_PER_RULE_PER_RUN} envíos en esta corrida — retoma el resto mañana.`)
      break
    }
    // Sin conversación de WhatsApp todavía (el contacto nunca escribió y
    // nadie le mandó nada) no hay a dónde reabrir — se salta en silencio, no
    // es un error de configuración.
    const conversation = conversationByContact.get(lead.primaryContactId)
    if (!conversation || !qualifies(rule, lead, conversation)) continue

    const lastSent = await prisma.whatsappAutomationLog.findFirst({
      where: { ruleId: rule.id, leadId: lead.id, status: 'sent' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    if (lastSent && daysSince(lastSent.createdAt) < rule.cooldownDays) continue

    processed++
    const variables = resolveVariableMapping(rule.variableMapping, {
      contactName: lead.primaryContact?.name, companyName: lead.company?.name,
      leadTitle: lead.title, ownerName: lead.owner?.name,
    })
    if (variables.length !== rule.template.variableCount) {
      await prisma.whatsappAutomationLog.create({
        data: { workspaceId, ruleId: rule.id, leadId: lead.id, status: 'failed', errorMsg: 'La plantilla cambió su cantidad de variables — revisá el mapeo de la regla.' },
      })
      failed++
      continue
    }

    try {
      const { content } = await sendTemplateToConversation({
        workspaceId, conversation, account, template: rule.template, variables,
        senderUserId: null, senderType: 'system',
      })
      await prisma.whatsappAutomationLog.create({ data: { workspaceId, ruleId: rule.id, leadId: lead.id, status: 'sent' } })
      await logLeadEvent({
        workspaceId, leadId: lead.id, userId: null, type: 'whatsapp_message',
        content: `reabrió automáticamente la conversación con la plantilla "${rule.template.name}" (regla "${rule.name}"): "${content.slice(0, 120)}"`,
      })
      sent++
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 300) : err.message
      await prisma.whatsappAutomationLog.create({ data: { workspaceId, ruleId: rule.id, leadId: lead.id, status: 'failed', errorMsg: detail } })
      console.error(`[WhatsappAutomation] Regla "${rule.name}" lead #${lead.id}:`, detail)
      failed++
    }
    await new Promise(r => setTimeout(r, SEND_DELAY_MS))
  }
  return { sent, failed }
}

async function runWorkspaceAutomations(workspaceId) {
  const rules = await prisma.whatsappAutomationRule.findMany({ where: { workspaceId, active: true }, include: { template: true } })
  if (rules.length === 0) return { sent: 0, failed: 0 }

  const account = await prisma.whatsappAccount.findFirst({ where: { workspaceId } })
  if (!account || !account.pluginId) return { sent: 0, failed: 0 } // sin cuenta operativa, ningún envío puede salir

  let sent = 0, failed = 0
  for (const rule of rules) {
    const r = await runRule(rule, workspaceId, account)
    sent += r.sent
    failed += r.failed
  }
  return { sent, failed }
}

/**
 * Entrada del cron diario (whatsappAutomation.service.js, mismo horario que
 * salesReminders — 08:00 ART, ver index.js). Requiere AMBOS flags: `ventas`
 * (es una automatización del CRM) y `whatsapp` (costo operativo real del
 * BSP), respetando el opt-out de cada workspace.
 */
async function runAllWhatsappAutomations() {
  const [ventasIds, whatsappIds] = await Promise.all([enabledWorkspaceIds('ventas'), enabledWorkspaceIds('whatsapp')])
  const ids = [...ventasIds].filter(id => whatsappIds.has(id))
  if (ids.length === 0) return { workspaces: 0, sent: 0 }

  let totalSent = 0
  for (const workspaceId of ids) {
    try {
      const { sent } = await runWorkspaceAutomations(workspaceId)
      if (sent) { totalSent += sent; console.log(`[WhatsappAutomation] ✓ workspace ${workspaceId}: ${sent} plantilla(s) enviada(s)`) }
    } catch (err) {
      console.error(`[WhatsappAutomation] Error en workspace ${workspaceId}:`, err.message)
    }
    await new Promise(r => setTimeout(r, 500))
  }
  console.log(`[WhatsappAutomation] Completado. ${totalSent} plantilla(s) enviada(s).`)
  return { workspaces: ids.length, sent: totalSent }
}

module.exports = { runAllWhatsappAutomations, runWorkspaceAutomations, runRule, resolveVariableMapping }
