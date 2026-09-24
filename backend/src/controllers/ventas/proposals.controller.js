const { randomUUID } = require('crypto')
const prisma = require('../../lib/prisma')
const { assertTokenBudget } = require('../../lib/tokenBudget')
const { generateProposalDoc, generateProposalBrief } = require('../../services/salesProposal.service')
const { normalizeDoc } = require('../../lib/proposalDoc')
const { htmlToText } = require('../../lib/htmlText')
const { resolveQuality } = require('../../lib/proposalModels')
const { sanitizeBriefing } = require('../../lib/proposalBrief')
const { logLeadEvent } = require('./_shared')

async function findLeadWithCompany(id, workspaceId) {
  return prisma.lead.findFirst({ where: { id: Number(id), workspaceId }, include: { company: true, primaryContact: true } })
}

// Contexto que la IA usa además de los planes/objetivos: notas de reunión, investigación
// ya hecha de la empresa y notas sueltas del seguimiento. Todo best-effort: si no hay, la
// propuesta se arma igual con lo que haya.
async function loadLeadContext(lead, workspaceId) {
  const [research, activities] = await Promise.all([
    prisma.leadResearch.findFirst({
      where: { leadId: lead.id, workspaceId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select: { result: true },
    }),
    prisma.leadActivity.findMany({
      where: { leadId: lead.id, workspaceId, kind: 'note' },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { content: true },
    }),
  ])
  return {
    notesText: htmlToText(lead.notes, 8000),
    activityNotes: activities.map(a => htmlToText(a.content, 600)).filter(Boolean),
    research: research?.result || null,
  }
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

// Valida lead + planes y arma el contexto completo que consumen el briefing y la generación.
// Devuelve { error: { status, body } } si algo no cierra, o { lead, plans, ctx }.
async function prepareGeneration(req) {
  const workspaceId = req.workspace.id
  const { plans: rawPlans = [], objectives, instructions } = req.body

  const lead = await findLeadWithCompany(Number(req.params.id), workspaceId)
  if (!lead) return { error: { status: 404, body: { error: 'Lead no encontrado' } } }
  if (!Array.isArray(rawPlans) || rawPlans.length === 0) return { error: { status: 400, body: { error: 'Se requiere al menos un plan' } } }
  await assertTokenBudget(workspaceId)

  const plans = await resolvePlans(rawPlans, { workspaceId, defaultCurrency: lead.currency })
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { companyName: true, name: true, salesProposalGuidelines: true } })
  const leadContext = await loadLeadContext(lead, workspaceId)

  return {
    lead, plans,
    ctx: {
      agencyName: ws?.companyName || ws?.name,
      company: lead.company,
      lead,
      contact: lead.primaryContact,
      plans,
      objectives: objectives?.trim() || '',
      guidelines: ws?.salesProposalGuidelines || '',
      instructions: instructions?.trim() || '',
      ...leadContext,
    },
  }
}

// POST /api/ventas/leads/:id/proposals/brief  { plans, objectives?, instructions? }
// Paso previo a generar: la IA lee todo el caso y devuelve qué entendió, preguntas con opciones
// sugeridas, datos que faltan y qué secciones conviene incluir. No guarda nada.
async function createBrief(req, res, next) {
  try {
    const prepared = await prepareGeneration(req)
    if (prepared.error) return res.status(prepared.error.status).json(prepared.error.body)
    const { brief } = await generateProposalBrief(prepared.ctx, { workspaceId: req.workspace.id, userId: req.user.userId })
    res.json(brief)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code })
    next(err)
  }
}

// POST /api/ventas/leads/:id/proposals  { plans: [{ label?, price?, currency?, serviceIds?, serviceNames? }], objectives, title?, signatureId? }
// Genera la propuesta con IA y la guarda como nueva versión. Cada plan es una opción de precio
// (ej. Básico/Completo) con su propio set de servicios y precio mensual definido a mano.
async function createProposal(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const leadId = Number(req.params.id)
    const { objectives, title, signatureId, quality: rawQuality, briefing: rawBriefing } = req.body
    const { quality, model } = resolveQuality(rawQuality)

    const prepared = await prepareGeneration(req)
    if (prepared.error) return res.status(prepared.error.status).json(prepared.error.body)
    const { plans, ctx } = prepared
    const allServiceNames = [...new Set(plans.flatMap(p => p.services.map(s => s.name)))]

    const { doc, usage } = await generateProposalDoc({ ...ctx, briefing: sanitizeBriefing(rawBriefing) }, { workspaceId, userId, model })

    const last = await prisma.proposal.findFirst({ where: { workspaceId, leadId }, orderBy: { version: 'desc' }, select: { version: true } })
    const version = (last?.version ?? 0) + 1

    const proposal = await prisma.proposal.create({
      data: {
        workspaceId, leadId, version,
        title: title?.trim() || doc.title || `Propuesta v${version}`,
        services: allServiceNames,
        plans,
        objectives: objectives?.trim() || null,
        doc,
        signatureId: typeof signatureId === 'string' && signatureId.trim() ? signatureId.trim() : null,
        status: 'draft',
        publicToken: randomUUID(),
        createdById: userId,
      },
      include: { createdBy: { select: { id: true, name: true, avatar: true } } },
    })

    await logLeadEvent({
      workspaceId, leadId, userId, type: 'proposal_created',
      content: `generó una propuesta (v${version})`, meta: { proposalId: proposal.id, quality, model, tokensUsed: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) },
    })
    res.status(201).json(proposal)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code })
    next(err)
  }
}

// PATCH /api/ventas/leads/:id/proposals/:pid  { content?, doc?, title?, status?, signatureId? }
// `content` = HTML de propuestas legacy; `doc` = documento estructurado (se normaliza sin resucitar bloques borrados).
async function updateProposal(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const pid = Number(req.params.pid)
    const existing = await prisma.proposal.findFirst({ where: { id: pid, workspaceId, leadId: Number(req.params.id) }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Propuesta no encontrada' })

    const { content, doc, title, status, signatureId } = req.body
    const data = {}
    if (content !== undefined) data.content = content
    if (doc !== undefined) {
      if (!doc || typeof doc !== 'object') return res.status(400).json({ error: 'Documento de propuesta inválido' })
      data.doc = normalizeDoc(doc)
    }
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

// GET /api/public/proposal/:token — sin auth. Solo sirve propuestas
// status:'confirmed' (mismo gate draft/published que los Informes de
// Marketing) y expone únicamente lo necesario para renderizar la vista del
// cliente: nunca leadId/workspaceId/createdById/objectives (instrucciones
// internas de generación, no contenido para el cliente).
async function getPublicProposal(req, res, next) {
  try {
    const proposal = await prisma.proposal.findUnique({
      where: { publicToken: req.params.token },
      select: {
        title: true, content: true, doc: true, plans: true, version: true, signatureId: true, createdAt: true, status: true,
        workspaceId: true,
        lead: { select: { company: { select: { name: true } } } },
      },
    })
    if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada' })
    if (proposal.status !== 'confirmed') {
      return res.status(404).json({ error: 'Esta propuesta todavía no está confirmada.', code: 'PROPOSAL_DRAFT' })
    }

    const ws = await prisma.workspace.findUnique({
      where: { id: proposal.workspaceId },
      select: { slug: true, name: true, companyName: true, logoData: true, brandColors: true, salesSignatures: true },
    })

    // Misma resolución de firma que exportProposalPdf: la elegida por
    // signatureId, o si nunca se eligió una (propuestas de antes de soportar
    // múltiples firmas) la única/primera configurada.
    const allSignatures = Array.isArray(ws?.salesSignatures) ? ws.salesSignatures : []
    const signature = allSignatures.find(s => s.id === proposal.signatureId)
      || (proposal.signatureId == null ? allSignatures[0] : null)
      || null

    let brandColors = []
    try { brandColors = JSON.parse(ws?.brandColors || '[]') } catch { /* deja [] */ }

    res.json({
      title: proposal.title,
      content: proposal.content,
      doc: proposal.doc || null,
      plans: Array.isArray(proposal.plans) ? proposal.plans : [],
      version: proposal.version,
      createdAt: proposal.createdAt,
      signatureId: proposal.signatureId, // para pasarle a exportProposalPdf, que resuelve la firma él mismo contra workspace.salesSignatures
      companyName: proposal.lead?.company?.name || null,
      workspace: {
        slug: ws?.slug,
        name: ws?.companyName || ws?.name || '',
        hasLogo: !!ws?.logoData,
        brandColors,
        salesSignatures: allSignatures,
      },
      signature, // ya resuelta, para el bloque de contacto de esta misma página
    })
  } catch (err) { next(err) }
}

module.exports = { listProposals, createBrief, createProposal, updateProposal, deleteProposal, getPublicProposal }
