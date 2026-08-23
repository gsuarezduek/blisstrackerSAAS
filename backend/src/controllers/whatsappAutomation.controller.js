const prisma = require('../lib/prisma')
const { LEAD_STATUS_KEYS, LEAD_ORIGIN_KEYS } = require('../lib/salesCatalog')
const { TRIGGER_TYPES, TRIGGER_TYPE_KEYS, MERGE_TOKENS } = require('../lib/whatsappAutomationCatalog')
const { runRule } = require('../services/whatsappAutomation.service')

const RULE_SELECT = {
  id: true, name: true, active: true, triggerType: true, triggerDays: true,
  statusFilter: true, originFilter: true, cooldownDays: true, variableMapping: true,
  createdAt: true, updatedAt: true,
  templateId: true,
  template: { select: { id: true, name: true, status: true, category: true, language: true, bodyText: true, variableCount: true } },
  createdBy: { select: { id: true, name: true } },
}

function parseJsonArrayField(raw, validKeys, label) {
  if (raw == null || raw === '') return []
  if (!Array.isArray(raw)) { const err = new Error(`${label} debe ser un array`); err.status = 400; throw err }
  const invalid = raw.filter(k => !validKeys.includes(k))
  if (invalid.length) { const err = new Error(`${label} tiene valores inválidos: ${invalid.join(', ')}`); err.status = 400; throw err }
  return raw
}

// GET /api/whatsapp/automation-rules — catálogo + reglas del workspace.
async function listRules(req, res, next) {
  try {
    const rules = await prisma.whatsappAutomationRule.findMany({
      where: { workspaceId: req.workspace.id },
      select: RULE_SELECT,
      orderBy: { createdAt: 'desc' },
    })
    res.json({
      rules: rules.map(r => ({ ...r, statusFilter: JSON.parse(r.statusFilter || '[]'), originFilter: JSON.parse(r.originFilter || '[]'), variableMapping: JSON.parse(r.variableMapping || '[]') })),
      catalog: { triggerTypes: TRIGGER_TYPES, mergeTokens: MERGE_TOKENS },
    })
  } catch (err) { next(err) }
}

function buildRuleData(body, template) {
  const { name, active, triggerType, triggerDays, statusFilter, originFilter, cooldownDays, variableMapping } = body

  if (!name?.trim()) { const err = new Error('El nombre es obligatorio'); err.status = 400; throw err }
  if (!TRIGGER_TYPE_KEYS.includes(triggerType)) { const err = new Error('Trigger inválido'); err.status = 400; throw err }
  const days = Number(triggerDays)
  if (!Number.isInteger(days) || days < 1) { const err = new Error('Los días del trigger deben ser un entero ≥ 1'); err.status = 400; throw err }
  const cooldown = cooldownDays === undefined ? 14 : Number(cooldownDays)
  if (!Number.isInteger(cooldown) || cooldown < 0) { const err = new Error('El cooldown debe ser un entero ≥ 0'); err.status = 400; throw err }

  const mapping = Array.isArray(variableMapping) ? variableMapping.map(v => String(v ?? '')) : []
  if (mapping.length !== template.variableCount) {
    const err = new Error(`Esta plantilla necesita ${template.variableCount} variable(s), llegaron ${mapping.length}.`)
    err.status = 400
    throw err
  }

  return {
    name: name.trim(),
    active: active === undefined ? true : !!active,
    triggerType,
    triggerDays: days,
    statusFilter: JSON.stringify(parseJsonArrayField(statusFilter, LEAD_STATUS_KEYS, 'statusFilter')),
    originFilter: JSON.stringify(parseJsonArrayField(originFilter, LEAD_ORIGIN_KEYS, 'originFilter')),
    cooldownDays: cooldown,
    variableMapping: JSON.stringify(mapping),
  }
}

// POST /api/whatsapp/automation-rules
async function createRule(req, res, next) {
  try {
    const { templateId } = req.body
    const template = await prisma.whatsappTemplate.findFirst({ where: { id: Number(templateId), workspaceId: req.workspace.id } })
    if (!template) return res.status(404).json({ error: 'Plantilla no encontrada' })

    const data = buildRuleData(req.body, template)
    const rule = await prisma.whatsappAutomationRule.create({
      data: { ...data, workspaceId: req.workspace.id, templateId: template.id, createdById: req.user.userId },
      select: RULE_SELECT,
    })
    res.status(201).json({ ...rule, statusFilter: JSON.parse(rule.statusFilter || '[]'), originFilter: JSON.parse(rule.originFilter || '[]'), variableMapping: JSON.parse(rule.variableMapping || '[]') })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
}

// PATCH /api/whatsapp/automation-rules/:id
async function updateRule(req, res, next) {
  try {
    const existing = await prisma.whatsappAutomationRule.findFirst({ where: { id: Number(req.params.id), workspaceId: req.workspace.id } })
    if (!existing) return res.status(404).json({ error: 'Regla no encontrada' })

    // Toggle rápido de "active" sin tener que reenviar el resto de los campos.
    if (Object.keys(req.body).length === 1 && 'active' in req.body) {
      const rule = await prisma.whatsappAutomationRule.update({ where: { id: existing.id }, data: { active: !!req.body.active }, select: RULE_SELECT })
      return res.json({ ...rule, statusFilter: JSON.parse(rule.statusFilter || '[]'), originFilter: JSON.parse(rule.originFilter || '[]'), variableMapping: JSON.parse(rule.variableMapping || '[]') })
    }

    const templateId = req.body.templateId ?? existing.templateId
    const template = await prisma.whatsappTemplate.findFirst({ where: { id: Number(templateId), workspaceId: req.workspace.id } })
    if (!template) return res.status(404).json({ error: 'Plantilla no encontrada' })

    const data = buildRuleData(req.body, template)
    const rule = await prisma.whatsappAutomationRule.update({
      where: { id: existing.id },
      data: { ...data, templateId: template.id },
      select: RULE_SELECT,
    })
    res.json({ ...rule, statusFilter: JSON.parse(rule.statusFilter || '[]'), originFilter: JSON.parse(rule.originFilter || '[]'), variableMapping: JSON.parse(rule.variableMapping || '[]') })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
}

// DELETE /api/whatsapp/automation-rules/:id
async function deleteRule(req, res, next) {
  try {
    const existing = await prisma.whatsappAutomationRule.findFirst({ where: { id: Number(req.params.id), workspaceId: req.workspace.id } })
    if (!existing) return res.status(404).json({ error: 'Regla no encontrada' })
    await prisma.whatsappAutomationRule.delete({ where: { id: existing.id } })
    res.status(204).end()
  } catch (err) { next(err) }
}

// POST /api/whatsapp/automation-rules/:id/run-now — corre la regla ya mismo
// (mismo código que el cron diario) para poder probarla sin esperar a las
// 08:05 ART. Sigue respetando cooldown/tope por corrida — no es un "modo
// prueba" que ignore las salvaguardas, es la corrida real adelantada.
async function runRuleNow(req, res, next) {
  try {
    const rule = await prisma.whatsappAutomationRule.findFirst({
      where: { id: Number(req.params.id), workspaceId: req.workspace.id },
      include: { template: true },
    })
    if (!rule) return res.status(404).json({ error: 'Regla no encontrada' })
    if (!rule.active) return res.status(400).json({ error: 'La regla está desactivada' })

    const account = await prisma.whatsappAccount.findFirst({ where: { workspaceId: req.workspace.id } })
    if (!account) return res.status(400).json({ error: 'No hay ninguna cuenta de WhatsApp conectada', code: 'WHATSAPP_NOT_CONNECTED' })
    if (!account.pluginId) return res.status(400).json({ error: 'A la cuenta le falta el Plugin ID — completalo desde "Editar".', code: 'WHATSAPP_MISSING_PLUGIN_ID' })

    const result = await runRule(rule, req.workspace.id, account)
    res.json(result)
  } catch (err) { next(err) }
}

module.exports = { listRules, createRule, updateRule, deleteRule, runRuleNow }
