const prisma = require('../lib/prisma')
const { assertTokenBudget } = require('../lib/tokenBudget')
const { generateContentBrief } = require('../services/contentBrief.service')

/**
 * GET /api/marketing/projects/:id/content-briefs
 * Lista los content briefs del proyecto (sin el contenido completo).
 */
async function listContentBriefs(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const briefs = await prisma.contentBrief.findMany({
      where:   { projectId, workspaceId },
      orderBy: { updatedAt: 'desc' },
      select:  { id: true, keyword: true, createdAt: true, updatedAt: true },
    })
    res.json({ briefs })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/content-briefs/:briefId
 */
async function getContentBrief(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const briefId     = Number(req.params.briefId)

    const brief = await prisma.contentBrief.findFirst({ where: { id: briefId, projectId, workspaceId } })
    if (!brief) return res.status(404).json({ error: 'Content brief no encontrado' })

    let content = {}
    try { content = JSON.parse(brief.content) } catch {}
    res.json({ id: brief.id, keyword: brief.keyword, content, createdAt: brief.createdAt, updatedAt: brief.updatedAt })
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/content-briefs
 * body: { keyword }
 * Genera (o regenera) el brief de contenido para una keyword.
 */
async function createContentBrief(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const keyword     = String(req.body.keyword || '').trim()

    if (!keyword)            return res.status(400).json({ error: 'Falta la keyword objetivo.' })
    if (keyword.length > 120) return res.status(400).json({ error: 'La keyword es demasiado larga.' })

    // Presupuesto mensual de tokens (lanza 429 con code TOKEN_BUDGET_EXCEEDED si se superó)
    await assertTokenBudget(workspaceId)

    const brief = await generateContentBrief(projectId, workspaceId, keyword, req.user.userId)
    res.json(brief)
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message })
    if (err.status === 429) return res.status(429).json({ error: err.message, code: err.code })
    next(err)
  }
}

/**
 * DELETE /api/marketing/projects/:id/content-briefs/:briefId
 */
async function deleteContentBrief(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const briefId     = Number(req.params.briefId)

    const brief = await prisma.contentBrief.findFirst({ where: { id: briefId, projectId, workspaceId }, select: { id: true } })
    if (!brief) return res.status(404).json({ error: 'Content brief no encontrado' })

    await prisma.contentBrief.delete({ where: { id: briefId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listContentBriefs, getContentBrief, createContentBrief, deleteContentBrief }
