const prisma = require('../../lib/prisma')
const { assertTokenBudget } = require('../../lib/tokenBudget')
const { runLeadResearch } = require('../../services/salesResearch.service')

async function leadExists(id, workspaceId) {
  return prisma.lead.findFirst({ where: { id: Number(id), workspaceId }, select: { id: true } })
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

module.exports = { startResearch, getLatestResearch }
