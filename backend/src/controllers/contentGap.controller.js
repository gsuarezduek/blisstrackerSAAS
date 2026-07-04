const prisma = require('../lib/prisma')
const { runContentGapAnalysis } = require('../services/contentGap.service')

/**
 * POST /api/marketing/projects/:id/content-gap  body: { keyword }
 * Crea un ContentGap y dispara el análisis async.
 */
async function runGap(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId      = req.user.userId
    const projectId   = Number(req.params.id)
    const keyword     = String(req.body.keyword || '').trim()

    if (!keyword)             return res.status(400).json({ error: 'Falta la keyword.' })
    if (keyword.length > 120) return res.status(400).json({ error: 'La keyword es demasiado larga.' })

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const gap = await prisma.contentGap.create({ data: { workspaceId, projectId, keyword, status: 'pending' } })
    setImmediate(() => runContentGapAnalysis(gap.id, workspaceId, projectId, keyword, userId))

    res.status(201).json({ gapId: gap.id, ...gap })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/content-gaps
 */
async function listGaps(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId   = Number(req.params.id)
    const gaps = await prisma.contentGap.findMany({
      where:   { workspaceId, projectId },
      orderBy: { createdAt: 'desc' },
      take:    20,
      select:  { id: true, keyword: true, status: true, errorMsg: true, createdAt: true, updatedAt: true },
    })
    res.json(gaps)
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/content-gaps/:gapId
 */
async function getGap(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId   = Number(req.params.id)
    const gapId       = Number(req.params.gapId)

    const gap = await prisma.contentGap.findFirst({ where: { id: gapId, projectId, workspaceId } })
    if (!gap) return res.status(404).json({ error: 'Análisis no encontrado' })

    const parse = (v) => { try { return JSON.parse(v) } catch { return [] } }
    res.json({
      ...gap,
      competitors:       parse(gap.competitors),
      gaps:              parse(gap.gaps),
      headingsSuggested: parse(gap.headingsSuggested),
    })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/marketing/projects/:id/content-gaps/:gapId
 */
async function deleteGap(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId   = Number(req.params.id)
    const gapId       = Number(req.params.gapId)

    const gap = await prisma.contentGap.findFirst({ where: { id: gapId, projectId, workspaceId }, select: { id: true } })
    if (!gap) return res.status(404).json({ error: 'Análisis no encontrado' })

    await prisma.contentGap.delete({ where: { id: gapId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { runGap, listGaps, getGap, deleteGap }
