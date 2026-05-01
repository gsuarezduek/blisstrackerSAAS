const { randomUUID }           = require('crypto')
const prisma                   = require('../lib/prisma')
const { aggregateReportData }  = require('../services/monthlyReport.service')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ─── Controladores ────────────────────────────────────────────────────────────

/**
 * GET /api/marketing/projects/:id/reports
 * Lista todos los informes del proyecto (solo metadata).
 */
async function listReports(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const reports = await prisma.monthlyReport.findMany({
      where:   { projectId, workspaceId },
      orderBy: { month: 'desc' },
      select:  { id: true, month: true, token: true, objectives: true, notes: true, createdAt: true },
    })

    res.json({ reports: reports.map(r => ({ ...r, objectives: safeParseObj(r.objectives) })) })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/projects/:id/reports/:month
 * Obtiene (o crea) el informe del mes y agrega todos los datos.
 */
async function getReport(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month }   = req.params

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    // Obtener o crear el registro de informe
    let report = await prisma.monthlyReport.findFirst({ where: { projectId, workspaceId, month } })
    if (!report) {
      report = await prisma.monthlyReport.create({
        data: { projectId, workspaceId, month, token: randomUUID(), objectives: '{}' },
      })
    }

    // Agregar todos los datos
    const data = await aggregateReportData(projectId, workspaceId, month)

    res.json({
      report: {
        id:         report.id,
        month:      report.month,
        token:      report.token,
        objectives: safeParseObj(report.objectives),
        notes:      report.notes,
        createdAt:  report.createdAt,
      },
      data,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /api/marketing/projects/:id/reports/:month
 * Actualiza objetivos y/o notas del informe.
 */
async function updateReport(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month }   = req.params
    const { objectives, notes } = req.body

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const updateData = {}
    if (objectives !== undefined) updateData.objectives = JSON.stringify(objectives)
    if (notes      !== undefined) updateData.notes      = notes

    const report = await prisma.monthlyReport.upsert({
      where:  { projectId_month: { projectId, month } },
      update: updateData,
      create: { projectId, workspaceId, month, token: randomUUID(), objectives: '{}', ...updateData },
    })

    res.json({
      report: {
        id:         report.id,
        month:      report.month,
        token:      report.token,
        objectives: safeParseObj(report.objectives),
        notes:      report.notes,
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/public/report/:token
 * Endpoint PÚBLICO (sin auth). Devuelve los datos del informe para el cliente.
 */
async function getPublicReport(req, res, next) {
  try {
    const { token } = req.params

    const report = await prisma.monthlyReport.findUnique({ where: { token } })
    if (!report) return res.status(404).json({ error: 'Informe no encontrado' })

    const data = await aggregateReportData(report.projectId, report.workspaceId, report.month)

    res.json({
      report: {
        month:      report.month,
        objectives: safeParseObj(report.objectives),
        notes:      report.notes,
      },
      data,
    })
  } catch (err) {
    next(err)
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function safeParseObj(str) {
  try { return JSON.parse(str || '{}') } catch { return {} }
}

module.exports = { listReports, getReport, updateReport, getPublicReport }
