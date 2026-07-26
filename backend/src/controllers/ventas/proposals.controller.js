const prisma = require('../../lib/prisma')
const { assertTokenBudget } = require('../../lib/tokenBudget')
const { generateProposalHtml } = require('../../services/salesProposal.service')
const { logLeadEvent } = require('./_shared')

async function findLeadWithCompany(id, workspaceId) {
  return prisma.lead.findFirst({ where: { id: Number(id), workspaceId }, include: { company: true } })
}

// GET /api/ventas/leads/:id/proposals
async function listProposals(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const leadId = Number(req.params.id)
    const proposals = await prisma.proposal.findMany({
      where: { workspaceId, leadId },
      orderBy: [{ version: 'desc' }],
      include: { createdBy: { select: { id: true, name: true, avatar: true } } },
    })
    res.json(proposals)
  } catch (err) { next(err) }
}

// Arma los planes de precio resolviendo serviceIds del catálogo (con su description) + serviceNames libres.
// Una sola query para todos los planes. Precio y moneda son definidos a mano por quien genera la propuesta.
async function resolvePlans(rawPlans, { workspaceId, defaultCurrency }) {
  const allServiceIds = [...new Set(rawPlans.flatMap(p => Array.isArray(p.serviceIds) ? p.serviceIds.map(Number) : []))]
  const catalogRows = allServiceIds.length
    ? await prisma.service.findMany({ where: { id: { in: allServiceIds }, workspaceId }, select: { id: true, name: true, description: true } })
    : []
  const catalogById = new Map(catalogRows.map(r => [r.id, r]))

  return rawPlans.map((p, i) => {
    const fromCatalog = (Array.isArray(p.serviceIds) ? p.serviceIds : [])
      .map(id => catalogById.get(Number(id)))
      .filter(Boolean)
      .map(r => ({ name: r.name, description: r.description || null }))
    const free = (Array.isArray(p.serviceNames) ? p.serviceNames : [])
      .filter(n => typeof n === 'string' && n.trim())
      .map(n => ({ name: n.trim(), description: null }))
    const seen = new Set()
    const services = [...fromCatalog, ...free].filter(s => (seen.has(s.name) ? false : (seen.add(s.name), true)))
    const priceNum = p.price === '' || p.price == null ? null : Number(p.price)
    return {
      label: typeof p.label === 'string' && p.label.trim() ? p.label.trim() : `Plan ${i + 1}`,
      price: Number.isFinite(priceNum) ? priceNum : null,
      currency: typeof p.currency === 'string' && p.currency.trim() ? p.currency.trim() : (defaultCurrency || 'ARS'),
      services,
    }
  })
}

// POST /api/ventas/leads/:id/proposals  { plans: [{ label?, price?, currency?, serviceIds?, serviceNames? }], objectives, title?, signatureId? }
// Genera la propuesta con IA y la guarda como nueva versión. Cada plan es una opción de precio
// (ej. Básico/Completo) con su propio set de servicios y precio mensual definido a mano.
async function createProposal(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const leadId = Number(req.params.id)
    const { plans: rawPlans = [], objectives, title, instructions, signatureId } = req.body

    const lead = await findLeadWithCompany(leadId, workspaceId)
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })
    if (!Array.isArray(rawPlans) || rawPlans.length === 0) return res.status(400).json({ error: 'Se requiere al menos un plan' })
    await assertTokenBudget(workspaceId)

    const plans = await resolvePlans(rawPlans, { workspaceId, defaultCurrency: lead.currency })
    const allServiceNames = [...new Set(plans.flatMap(p => p.services.map(s => s.name)))]

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { companyName: true, name: true, salesProposalGuidelines: true } })

    const { html, usage } = await generateProposalHtml({
      agencyName: ws?.companyName || ws?.name,
      companyName: lead.company.name,
      industry: lead.company.industry,
      leadTitle: lead.title,
      plans,
      objectives: objectives?.trim() || '',
      guidelines: ws?.salesProposalGuidelines || '',
      instructions: instructions?.trim() || '',
    }, { workspaceId, userId })

    const last = await prisma.proposal.findFirst({ where: { workspaceId, leadId }, orderBy: { version: 'desc' }, select: { version: true } })
    const version = (last?.version ?? 0) + 1

    const proposal = await prisma.proposal.create({
      data: {
        workspaceId, leadId, version,
        title: title?.trim() || `Propuesta v${version}`,
        services: allServiceNames,
        plans,
        objectives: objectives?.trim() || null,
        content: html,
        signatureId: typeof signatureId === 'string' && signatureId.trim() ? signatureId.trim() : null,
        status: 'draft',
        createdById: userId,
      },
      include: { createdBy: { select: { id: true, name: true, avatar: true } } },
    })

    await logLeadEvent({
      workspaceId, leadId, userId, type: 'proposal_created',
      content: `generó una propuesta (v${version})`, meta: { proposalId: proposal.id, tokensUsed: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) },
    })
    res.status(201).json(proposal)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code })
    next(err)
  }
}

// PATCH /api/ventas/leads/:id/proposals/:pid  { content?, title?, status?, signatureId? }
async function updateProposal(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const pid = Number(req.params.pid)
    const existing = await prisma.proposal.findFirst({ where: { id: pid, workspaceId, leadId: Number(req.params.id) }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Propuesta no encontrada' })

    const { content, title, status, signatureId } = req.body
    const data = {}
    if (content !== undefined) data.content = content
    if (title   !== undefined) data.title = title?.trim() || null
    if (signatureId !== undefined) data.signatureId = typeof signatureId === 'string' && signatureId.trim() ? signatureId.trim() : null
    if (status  !== undefined) {
      if (!['draft', 'confirmed'].includes(status)) return res.status(400).json({ error: 'Estado de propuesta inválido' })
      data.status = status
    }
    const proposal = await prisma.proposal.update({ where: { id: pid }, data, include: { createdBy: { select: { id: true, name: true, avatar: true } } } })
    res.json(proposal)
  } catch (err) { next(err) }
}

// DELETE /api/ventas/leads/:id/proposals/:pid
async function deleteProposal(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const pid = Number(req.params.pid)
    const existing = await prisma.proposal.findFirst({ where: { id: pid, workspaceId, leadId: Number(req.params.id) }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Propuesta no encontrada' })
    await prisma.proposal.delete({ where: { id: pid } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listProposals, createProposal, updateProposal, deleteProposal }
