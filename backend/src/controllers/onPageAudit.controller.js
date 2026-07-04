const prisma = require('../lib/prisma')
const { runOnPageAnalysis } = require('../services/onPageAudit.service')

/**
 * POST /api/marketing/projects/:id/onpage/audit
 * Crea un OnPageAudit y dispara el crawler de forma async (patrón GEO).
 */
async function runAudit(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId      = req.user.userId
    const projectId   = Number(req.params.id)

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true, name: true, websiteUrl: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!project.websiteUrl) return res.status(400).json({ error: 'El proyecto no tiene una URL configurada', code: 'NO_SITE_URL' })

    let url
    try {
      const raw = /^https?:\/\//i.test(project.websiteUrl) ? project.websiteUrl : 'https://' + project.websiteUrl
      url = new URL(raw).href
    } catch { return res.status(400).json({ error: 'La URL del proyecto no es válida' }) }

    const audit = await prisma.onPageAudit.create({ data: { workspaceId, projectId: project.id, status: 'pending' } })
    setImmediate(() => runOnPageAnalysis(audit.id, workspaceId, project.id, url, userId))

    res.status(201).json({ auditId: audit.id, ...audit })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/onpage/audits?limit=10
 */
async function listAudits(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId   = Number(req.params.id)
    const limit       = Math.min(Number(req.query.limit) || 10, 50)

    const audits = await prisma.onPageAudit.findMany({
      where:   { workspaceId, projectId },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      select:  { id: true, status: true, score: true, pagesCrawled: true, errorMsg: true, createdAt: true, updatedAt: true },
    })
    res.json(audits)
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/onpage/audits/:auditId
 */
async function getAudit(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId   = Number(req.params.id)
    const auditId     = Number(req.params.auditId)

    const audit = await prisma.onPageAudit.findFirst({ where: { id: auditId, projectId, workspaceId } })
    if (!audit) return res.status(404).json({ error: 'Auditoría no encontrada' })

    const parse = (v) => { try { return JSON.parse(v) } catch { return [] } }
    res.json({
      ...audit,
      findings:        parse(audit.findings),
      pages:           parse(audit.pages),
      linkSuggestions: parse(audit.linkSuggestions),
    })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/marketing/projects/:id/onpage/audits/:auditId
 */
async function deleteAudit(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId   = Number(req.params.id)
    const auditId     = Number(req.params.auditId)

    const audit = await prisma.onPageAudit.findFirst({ where: { id: auditId, projectId, workspaceId }, select: { id: true } })
    if (!audit) return res.status(404).json({ error: 'Auditoría no encontrada' })

    await prisma.onPageAudit.delete({ where: { id: auditId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { runAudit, listAudits, getAudit, deleteAudit }
