const { randomUUID }           = require('crypto')
const prisma                   = require('../lib/prisma')
const { aggregateReportData }  = require('../services/monthlyReport.service')

const ALLOWED_BANNER_TYPES = ['image/png', 'image/jpeg', 'image/webp']

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
      // Heredar banner del informe más reciente del mismo proyecto
      const prevReport = await prisma.monthlyReport.findFirst({
        where:   { projectId, workspaceId, bannerData: { not: null } },
        orderBy: { month: 'desc' },
        select:  { bannerData: true, bannerMimeType: true },
      })
      report = await prisma.monthlyReport.create({
        data: {
          projectId, workspaceId, month, token: randomUUID(), objectives: '{}',
          ...(prevReport?.bannerData ? { bannerData: prevReport.bannerData, bannerMimeType: prevReport.bannerMimeType } : {}),
        },
      })
    }

    // Pasar cachés si ya existen (evita queries + llamadas a APIs externas en cada carga)
    const cachedAnalysis = report.analysis   ? safeParseObj(report.analysis)   : null
    const cachedData     = report.dataCache  ? safeParseObj(report.dataCache)  : null
    const objectives     = safeParseObj(report.objectives)

    // Branding del workspace
    const workspace = await prisma.workspace.findUnique({
      where:  { id: workspaceId },
      select: { slug: true, name: true, companyName: true, companyDescription: true, industry: true, companyWebsite: true, logoData: true, bannerData: true, brandColors: true, brandFonts: true },
    })

    // Agregar todos los datos
    const data = await aggregateReportData(projectId, workspaceId, month, cachedAnalysis, objectives, cachedData)

    // Persistir cachés nuevos en DB
    const dbUpdate = {}
    if (data._analysisIsNew  && data.analysis)  dbUpdate.analysis  = JSON.stringify(data.analysis)
    if (data._dataCacheIsNew)                    dbUpdate.dataCache = JSON.stringify({
      project:        data.project,
      dataMonth:      data.dataMonth,
      connectedTypes: data.connectedTypes,
      sections:       data.sections,
    })
    if (Object.keys(dbUpdate).length > 0) {
      await prisma.monthlyReport.update({ where: { id: report.id }, data: dbUpdate })
    }

    // No exponer flags internos al cliente
    delete data._analysisIsNew
    delete data._dataCacheIsNew

    res.json({
      report: {
        id:         report.id,
        month:      report.month,
        token:      report.token,
        objectives: safeParseObj(report.objectives),
        notes:      report.notes,
        hasBanner:  !!report.bannerData,
        createdAt:  report.createdAt,
      },
      workspace: workspace ? {
        slug:               workspace.slug,
        name:               workspace.name,
        companyName:        workspace.companyName,
        companyDescription: workspace.companyDescription,
        industry:           workspace.industry,
        companyWebsite:     workspace.companyWebsite,
        hasLogo:            !!workspace.logoData,
        brandColors:        workspace.brandColors ? JSON.parse(workspace.brandColors) : [],
        brandFonts:         workspace.brandFonts  ? JSON.parse(workspace.brandFonts)  : [],
      } : null,
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
    const { objectives, notes, analysis } = req.body

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const updateData = {}
    if (objectives !== undefined) updateData.objectives = JSON.stringify(objectives)
    if (notes      !== undefined) updateData.notes      = notes
    if (analysis   !== undefined) updateData.analysis   = JSON.stringify(analysis)

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

    const [cachedAnalysis, workspace] = await Promise.all([
      Promise.resolve(report.analysis ? safeParseObj(report.analysis) : null),
      prisma.workspace.findUnique({
        where:  { id: report.workspaceId },
        select: { slug: true, name: true, companyName: true, companyDescription: true, industry: true, companyWebsite: true, logoData: true, brandColors: true, brandFonts: true },
      }),
    ])

    const objectives = safeParseObj(report.objectives)
    const data = await aggregateReportData(report.projectId, report.workspaceId, report.month, cachedAnalysis, objectives)

    // Si se generó un análisis nuevo también lo guardamos (ej: primera vez que el cliente abre el link)
    if (data._analysisIsNew && data.analysis) {
      await prisma.monthlyReport.update({
        where: { id: report.id },
        data:  { analysis: JSON.stringify(data.analysis) },
      })
    }
    delete data._analysisIsNew

    res.json({
      report: {
        month:      report.month,
        token:      report.token,
        objectives: safeParseObj(report.objectives),
        notes:      report.notes,
        hasBanner:  !!report.bannerData,
      },
      workspace: workspace ? {
        slug:               workspace.slug,
        name:               workspace.name,
        companyName:        workspace.companyName,
        companyDescription: workspace.companyDescription,
        industry:           workspace.industry,
        companyWebsite:     workspace.companyWebsite,
        hasLogo:            !!workspace.logoData,
        brandColors:        workspace.brandColors ? JSON.parse(workspace.brandColors) : [],
        brandFonts:         workspace.brandFonts  ? JSON.parse(workspace.brandFonts)  : [],
      } : null,
      data,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/marketing/projects/:id/reports/:month/banner
 * Sube o reemplaza la imagen de portada del informe (solo afecta este mes).
 */
async function uploadReportBanner(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month }   = req.params

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }

    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' })

    const mimeType = req.file.mimetype
    if (!ALLOWED_BANNER_TYPES.includes(mimeType)) {
      return res.status(400).json({ error: 'Formato no soportado. Usá PNG, JPG o WebP.' })
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const report = await prisma.monthlyReport.upsert({
      where:  { projectId_month: { projectId, month } },
      update: { bannerData: req.file.buffer, bannerMimeType: mimeType },
      create: { projectId, workspaceId, month, token: randomUUID(), objectives: '{}', bannerData: req.file.buffer, bannerMimeType: mimeType },
    })

    res.json({ hasBanner: true, token: report.token })
  } catch (err) {
    next(err)
  }
}

/**
 * DELETE /api/marketing/projects/:id/reports/:month/banner
 * Elimina la imagen de portada del informe.
 */
async function deleteReportBanner(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month }   = req.params

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    await prisma.monthlyReport.updateMany({
      where: { projectId, workspaceId, month },
      data:  { bannerData: null, bannerMimeType: null },
    })

    res.json({ hasBanner: false })
  } catch (err) {
    next(err)
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function safeParseObj(str) {
  try { return JSON.parse(str || '{}') } catch { return {} }
}

/**
 * POST /api/marketing/projects/:id/reports/:month/regenerate
 * Limpia el análisis IA cacheado y vuelve a agregar todos los datos frescos.
 * Útil cuando se reconectó una integración que estaba caída al momento de generar el informe.
 */
async function regenerateReport(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month }   = req.params

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    // Limpiar análisis cacheado (o crear el registro si no existe)
    let report = await prisma.monthlyReport.findFirst({ where: { projectId, workspaceId, month } })
    if (report) {
      await prisma.monthlyReport.update({ where: { id: report.id }, data: { analysis: null, dataCache: null } })
    } else {
      report = await prisma.monthlyReport.create({
        data: { projectId, workspaceId, month, token: randomUUID(), objectives: '{}' },
      })
    }

    // Re-agregar todos los datos sin caché de análisis (fuerza regeneración con Claude)
    const objectives = report ? safeParseObj(report.objectives) : {}
    const data = await aggregateReportData(projectId, workspaceId, month, null, objectives)

    // Guardar nuevo análisis y caché de datos en DB
    const regenUpdate = {}
    if (data.analysis?.resumen) regenUpdate.analysis  = JSON.stringify(data.analysis)
    if (data._dataCacheIsNew)   regenUpdate.dataCache = JSON.stringify({
      project:        data.project,
      dataMonth:      data.dataMonth,
      connectedTypes: data.connectedTypes,
      sections:       data.sections,
    })
    if (Object.keys(regenUpdate).length > 0) {
      await prisma.monthlyReport.update({ where: { id: report.id }, data: regenUpdate })
    }

    delete data._analysisIsNew
    delete data._dataCacheIsNew

    const updatedReport = await prisma.monthlyReport.findUnique({ where: { id: report.id } })

    res.json({
      report: {
        id:         updatedReport.id,
        month:      updatedReport.month,
        token:      updatedReport.token,
        objectives: safeParseObj(updatedReport.objectives),
        notes:      updatedReport.notes,
        createdAt:  updatedReport.createdAt,
      },
      data,
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { listReports, getReport, updateReport, getPublicReport, regenerateReport, uploadReportBanner, deleteReportBanner }
