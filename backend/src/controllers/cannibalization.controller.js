const prisma = require('../lib/prisma')
const { runCannibalizationAnalysis } = require('../services/cannibalization.service')
const { canWrite } = require('../lib/projectAccess')

const VALID_RANGES = ['30d', '90d', '180d']
const MAX_PROTECTED_URLS = 200
const MAX_URL_LENGTH = 2048

/**
 * POST /api/marketing/projects/:id/cannibal
 * Body: { dateRange?, language? }
 * Crea un CannibalReport en estado "running" y dispara el análisis async.
 */
async function runAnalysis(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const dateRange   = VALID_RANGES.includes(req.body?.dateRange) ? req.body.dateRange : '90d'
    const language    = typeof req.body?.language === 'string' && req.body.language.length <= 20
      ? req.body.language.trim().toLowerCase() || null
      : null

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const report = await prisma.cannibalReport.create({
      data: { projectId, workspaceId, dateRange, status: 'pending' },
    })

    setImmediate(() => runCannibalizationAnalysis(report.id, projectId, workspaceId, dateRange, language))

    res.status(201).json({ reportId: report.id, status: 'pending' })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/cannibal
 * Devuelve los últimos reportes del proyecto (sin los JSON pesados, para listar).
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
        id: true, status: true, dateRange: true, languageFilter: true,
        totalConflicts: true, criticalCount: true, warningCount: true, lowCount: true,
        trafficAtRisk: true, hreflangCount: true, indexedByMistakeCount: true,
        errorMsg: true, createdAt: true, updatedAt: true,
      },
    })

    res.json({ reports })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/cannibal/:rid
 * Devuelve detalle completo de un reporte (incluye los 3 JSON parseados).
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
    let hreflangIssues = []
    try { hreflangIssues = JSON.parse(report.hreflangIssues || '[]') } catch { /* ignore */ }
    let indexedByMistake = []
    try { indexedByMistake = JSON.parse(report.indexedByMistake || '[]') } catch { /* ignore */ }

    res.json({ ...report, conflicts, hreflangIssues, indexedByMistake })
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

/**
 * GET /api/marketing/projects/:id/cannibal/protected-urls
 * Lectura abierta a cualquier miembro del workspace (mismo criterio que el resto de este controller).
 */
async function getProtectedUrls(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where:  { id: projectId, workspaceId },
      select: { cannibalProtectedUrls: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    let urls = []
    try { urls = JSON.parse(project.cannibalProtectedUrls || '[]') } catch { /* ignore */ }
    res.json({ urls })
  } catch (err) { next(err) }
}

/**
 * PUT /api/marketing/projects/:id/cannibal/protected-urls
 * Body: { urls: string[] } — reemplaza la lista completa. Config sensible
 * (decide qué URLs nunca se tocan): admin/owner o miembro del equipo del
 * proyecto, mismo criterio que saveLinks/saveInfo (canWrite).
 */
async function setProtectedUrls(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    if (!(await canWrite(req, projectId))) {
      return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

    const body = Array.isArray(req.body?.urls) ? req.body.urls : []
    const cleaned = [...new Set(body.map(u => String(u || '').trim()).filter(Boolean))].slice(0, MAX_PROTECTED_URLS)
    for (const u of cleaned) {
      if (u.length > MAX_URL_LENGTH) {
        return res.status(400).json({ error: `URL demasiado larga: ${u.slice(0, 50)}...` })
      }
    }

    await prisma.project.update({
      where: { id: projectId },
      data:  { cannibalProtectedUrls: JSON.stringify(cleaned) },
    })
    res.json({ urls: cleaned })
  } catch (err) { next(err) }
}

module.exports = { runAnalysis, listReports, getReport, deleteReport, getProtectedUrls, setProtectedUrls }
