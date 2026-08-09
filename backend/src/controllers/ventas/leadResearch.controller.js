const prisma = require('../../lib/prisma')
const { assertTokenBudget } = require('../../lib/tokenBudget')
const { runLeadResearch } = require('../../services/salesResearch.service')
const { generateDiagnosticReportHtml } = require('../../services/salesDiagnosticReport.service')
const { logLeadEvent } = require('./_shared')

async function leadExists(id, workspaceId) {
  return prisma.lead.findFirst({ where: { id: Number(id), workspaceId }, select: { id: true } })
}

async function findResearch(researchId, leadId, workspaceId) {
  return prisma.leadResearch.findFirst({ where: { id: Number(researchId), leadId: Number(leadId), workspaceId } })
}

// POST /api/ventas/leads/:id/research  — dispara la investigación IA (async).
async function startResearch(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const leadId = Number(req.params.id)

    if (!(await leadExists(leadId, workspaceId))) return res.status(404).json({ error: 'Lead no encontrado' })
    await assertTokenBudget(workspaceId) // 429 TOKEN_BUDGET_EXCEEDED si excedido

    const research = await prisma.leadResearch.create({
      data: { workspaceId, leadId, status: 'pending', createdById: userId },
    })
    setImmediate(() => runLeadResearch(research.id, workspaceId, leadId, userId))
    res.status(201).json({ researchId: research.id, status: 'pending' })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code })
    next(err)
  }
}

// GET /api/ventas/leads/:id/research  — investigación más reciente del lead (para polling).
async function getLatestResearch(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const leadId = Number(req.params.id)
    const research = await prisma.leadResearch.findFirst({
      where: { workspaceId, leadId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true, avatar: true } } },
    })
    res.json(research || null)
  } catch (err) { next(err) }
}

// POST /api/ventas/leads/:id/research/:researchId/report  { instructions? }
// Genera (o regenera) el informe de diagnóstico para el cliente a partir del resultado
// de esa investigación puntual. Síncrono (on-demand), como generateProposalHtml.
async function generateReport(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const leadId = Number(req.params.id)
    const { instructions } = req.body

    const research = await findResearch(req.params.researchId, leadId, workspaceId)
    if (!research) return res.status(404).json({ error: 'Investigación no encontrada' })
    if (research.status !== 'completed') return res.status(409).json({ error: 'La investigación debe estar completa para generar el informe' })

    await assertTokenBudget(workspaceId)

    const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId }, include: { company: true } })
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { companyName: true, name: true } })

    const { html, usage } = await generateDiagnosticReportHtml({
      agencyName: ws?.companyName || ws?.name,
      companyName: lead.company.name,
      industry: lead.company.industry,
      research: research.result,
      instructions: instructions?.trim() || '',
    }, { workspaceId, userId })

    const updated = await prisma.leadResearch.update({
      where: { id: research.id },
      data: { reportHtml: html, reportTitle: research.reportTitle || 'Diagnóstico inicial' },
      include: { createdBy: { select: { id: true, name: true, avatar: true } } },
    })

    await logLeadEvent({
      workspaceId, leadId, userId, type: 'diagnostic_report_created',
      content: 'generó un informe de diagnóstico para el cliente',
      meta: { researchId: research.id, tokensUsed: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) },
    })
    res.json(updated)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code })
    next(err)
  }
}

// PATCH /api/ventas/leads/:id/research/:researchId/report  { title?, html? }
// Edición manual del informe ya generado (sin volver a llamar a la IA).
async function updateReport(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const leadId = Number(req.params.id)
    const research = await findResearch(req.params.researchId, leadId, workspaceId)
    if (!research) return res.status(404).json({ error: 'Investigación no encontrada' })

    const { title, html } = req.body
    const data = {}
    if (title !== undefined) data.reportTitle = title?.trim() || null
    if (html  !== undefined) data.reportHtml  = html

    const updated = await prisma.leadResearch.update({
      where: { id: research.id },
      data,
      include: { createdBy: { select: { id: true, name: true, avatar: true } } },
    })
    res.json(updated)
  } catch (err) { next(err) }
}

module.exports = { startResearch, getLatestResearch, generateReport, updateReport }
