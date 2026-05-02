const prisma = require('../lib/prisma')
const { runCannibalizationAnalysis } = require('../services/cannibalization.service')

const VALID_RANGES = ['30d', '90d', '180d']

/**
 * POST /api/marketing/projects/:id/cannibal
 * Body: { dateRange? }
 * Crea un CannibalReport en estado "running" y dispara el análisis async.
 */
async function runAnalysis(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const dateRange   = VALID_RANGES.includes(req.body?.dateRange) ? req.body.dateRange : '90d'

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const report = await prisma.cannibalReport.create({
      data: { projectId, workspaceId, dateRange, status: 'pending' },
    })

    setImmediate(() => runCannibalizationAnalysis(report.id, projectId, workspaceId, dateRange))

    res.status(201).json({ reportId: report.id, status: 'pending' })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/cannibal
 * Devuelve los últimos reportes del proyecto (sin el array conflicts para listar).
 */
async function listReports(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const limit       = Math.min(Number(req.query.limit) || 10, 50)

    const reports = await prisma.cannibalReport.findMany({
      where:   { projectId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      select: {
        id: true, status: true, dateRange: true,
        totalConflicts: true, criticalCount: true, warningCount: true, lowCount: true,
        trafficAtRisk: true, errorMsg: true, createdAt: true, updatedAt: true,
      },
    })

    res.json({ reports })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/cannibal/:rid
 * Devuelve detalle completo de un reporte (incluye conflicts JSON).
 */
async function getReport(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const rid         = Number(req.params.rid)

    const report = await prisma.cannibalReport.findFirst({
      where: { id: rid, projectId, workspaceId },
    })
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado' })

    let conflicts = []
    try { conflicts = JSON.parse(report.conflicts || '[]') } catch { /* ignore */ }

    res.json({ ...report, conflicts })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/marketing/projects/:id/cannibal/:rid
 */
async function deleteReport(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const rid         = Number(req.params.rid)

    const report = await prisma.cannibalReport.findFirst({
      where: { id: rid, projectId, workspaceId },
    })
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado' })

    await prisma.cannibalReport.delete({ where: { id: rid } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { runAnalysis, listReports, getReport, deleteReport }
