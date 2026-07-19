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

// POST /api/ventas/leads/:id/proposals  { serviceIds?, serviceNames?, objectives, title? }
// Genera la propuesta con IA y la guarda como nueva versión.
async function createProposal(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const leadId = Number(req.params.id)
    const { serviceIds = [], serviceNames = [], objectives, title, instructions } = req.body

    const lead = await findLeadWithCompany(leadId, workspaceId)
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })
    await assertTokenBudget(workspaceId)

    // Resolver nombres de servicios (por id del catálogo del workspace + libres).
    let names = [...serviceNames.filter(s => typeof s === 'string' && s.trim())]
    if (serviceIds.length) {
      const rows = await prisma.service.findMany({
        where: { id: { in: serviceIds.map(Number) }, workspaceId },
        select: { name: true },
      })
      names = [...new Set([...names, ...rows.map(r => r.name)])]
    }

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { companyName: true, name: true, salesProposalGuidelines: true } })

    const { html, usage } = await generateProposalHtml({
      agencyName: ws?.companyName || ws?.name,
      companyName: lead.company.name,
      industry: lead.company.industry,
      leadTitle: lead.title,
      serviceNames: names,
      objectives: objectives?.trim() || '',
      estimatedValue: lead.estimatedValue,
      currency: lead.currency,
      guidelines: ws?.salesProposalGuidelines || '',
      instructions: instructions?.trim() || '',
    }, { workspaceId, userId })

    const last = await prisma.proposal.findFirst({ where: { workspaceId, leadId }, orderBy: { version: 'desc' }, select: { version: true } })
    const version = (last?.version ?? 0) + 1

    const proposal = await prisma.proposal.create({
      data: {
        workspaceId, leadId, version,
        title: title?.trim() || `Propuesta v${version}`,
        services: names,
        objectives: objectives?.trim() || null,
        content: html,
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

// PATCH /api/ventas/leads/:id/proposals/:pid  { content?, title?, status? }
async function updateProposal(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const pid = Number(req.params.pid)
    const existing = await prisma.proposal.findFirst({ where: { id: pid, workspaceId, leadId: Number(req.params.id) }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Propuesta no encontrada' })

    const { content, title, status } = req.body
    const data = {}
    if (content !== undefined) data.content = content
    if (title   !== undefined) data.title = title?.trim() || null
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
