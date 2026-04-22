const prisma = require('../lib/prisma')
const { runGeoAnalysis } = require('../services/geoAudit.service')

/**
 * POST /api/marketing/geo/audit
 * Body: { projectId }
 * Crea un GeoAudit en estado "running" y dispara el análisis de forma async.
 */
async function runAudit(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId      = req.user.userId
    const { projectId } = req.body

    if (!projectId) return res.status(400).json({ error: 'projectId es requerido' })

    // Verificar que el proyecto pertenece al workspace y tiene URL
    const project = await prisma.project.findFirst({
      where: { id: Number(projectId), workspaceId },
      select: { id: true, name: true, websiteUrl: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!project.websiteUrl) return res.status(400).json({ error: 'El proyecto no tiene una URL configurada' })

    // Validar URL
    let url
    try { url = new URL(project.websiteUrl).href }
    catch { return res.status(400).json({ error: 'La URL del proyecto no es válida' }) }

    // Crear el registro de audit
    const audit = await prisma.geoAudit.create({
      data: { workspaceId, projectId: project.id, url, status: 'pending' },
    })

    // Correr el análisis de forma async (no bloquea el response)
    setImmediate(() => runGeoAnalysis(audit.id, workspaceId, project.id, url, userId))

    res.status(201).json(audit)
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/geo/audits
 * Query: ?projectId=N&limit=10
 */
async function listAudits(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId   = req.query.projectId ? Number(req.query.projectId) : undefined
    const limit       = Math.min(Number(req.query.limit) || 10, 50)

    const where = { workspaceId, ...(projectId ? { projectId } : {}) }

    const audits = await prisma.geoAudit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    limit,
      select: {
        id: true, projectId: true, url: true, status: true,
        score: true, createdAt: true, updatedAt: true,
        project: { select: { name: true } },
      },
    })

    res.json(audits)
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/geo/audits/:id
 */
async function getAudit(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id          = Number(req.params.id)

    const audit = await prisma.geoAudit.findFirst({
      where: { id, workspaceId },
      include: { project: { select: { name: true, websiteUrl: true } } },
    })
    if (!audit) return res.status(404).json({ error: 'Audit no encontrado' })

    res.json({
      ...audit,
      findings:       JSON.parse(audit.findings),
      recommendations: JSON.parse(audit.recommendations),
    })
  } catch (err) { next(err) }
}

module.exports = { runAudit, listAudits, getAudit }
