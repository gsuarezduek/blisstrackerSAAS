const { randomUUID } = require('crypto')
const prisma = require('../../lib/prisma')
const { aggregateReportData, getAvailableSections } = require('../../services/monthlyReport.service')
const {
  SECTION_KEYS, reportPeriod, reportLabel, sanitizeSections,
  safeParseArr, safeParseObj, loadBriefs, loadFeedbackSummary,
} = require('./_shared')

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
      select:  { id: true, month: true, token: true, notes: true, createdAt: true, status: true, periodStart: true, periodEnd: true },
    })

    res.json({ reports: reports.map(r => ({
      ...r,
      objectives:  {},
      periodLabel: reportLabel(r),
    })) })
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
        data: { projectId, workspaceId, month, token: randomUUID(), generatedById: req.user?.userId ?? null },
      })
    }

    // Secciones disponibles para ofrecer en el modal de "Generar Informe" (siempre, es liviano)
    const availableSections = await getAvailableSections(projectId, workspaceId)

    // El informe se considera "generado" una vez que se eligieron secciones.
    // Compatibilidad: informes previos a esta feature (sin enabledSections) pero con
    // análisis o caché ya armado también cuentan como generados (secciones = todas).
    // Si nunca se generó, NO se agregan datos al entrar — se espera el botón "Generar Informe".
    const enabledSections = report.enabledSections ? safeParseArr(report.enabledSections) : null
    const isGenerated     = enabledSections !== null || !!report.dataCache || !!report.analysis

    // Branding del workspace
    const workspace = await prisma.workspace.findUnique({
      where:  { id: workspaceId },
      select: { slug: true, name: true, companyName: true, companyDescription: true, industry: true, companyWebsite: true, logoData: true, bannerData: true, brandColors: true, brandFonts: true },
    })

    let data = null
    if (isGenerated) {
      // Pasar cachés si ya existen (evita queries + llamadas a APIs externas en cada carga)
      const cachedAnalysis = report.analysis   ? safeParseObj(report.analysis)   : null
      const cachedData     = report.dataCache  ? safeParseObj(report.dataCache)  : null
      const objectives     = {}
      const briefs         = await loadBriefs(projectId)

      data = await aggregateReportData(projectId, workspaceId, month, cachedAnalysis, objectives, cachedData, enabledSections, {
        periodStart: report.periodStart, periodEnd: report.periodEnd, briefs,
      })

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
    }

    const period = reportPeriod(report)
    const feedback = await loadFeedbackSummary(report.id)
    res.json({
      report: {
        id:              report.id,
        month:           report.month,
        token:           report.token,
        objectives:      {},
        notes:           report.notes,
        hasBanner:       !!report.bannerData,
        createdAt:       report.createdAt,
        status:          report.status,
        periodStart:     period.start,
        periodEnd:       period.end,
        periodLabel:     reportLabel(report),
        feedback,
        enabledSections,
        isGenerated,
      },
      availableSections,
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
 * GET /api/marketing/projects/:id/report-sections
 * Devuelve el estado de cada sección (disponible + estado de integración) sin
 * agregar el informe. Liviano — para refrescar el modal de "Generar Informe".
 */
async function getSectionsStatus(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const availableSections = await getAvailableSections(projectId, workspaceId)
    res.json({ availableSections })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/projects/:id/report-sections-config
 * Config de secciones de Marketing habilitadas para el informe de este proyecto
 * (ej: un proyecto sin web puede no ofrecer "Performance web"/"GEO"). Sin
 * configurar (reportSections null) → todas las claves del catálogo (sin restricción,
 * comportamiento legacy). Incluye los servicios del proyecto como contexto para elegir.
 */
async function getReportSectionsConfig(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where:   { id: projectId, workspaceId },
      select:  {
        name: true, reportSections: true,
        services: { include: { service: true }, orderBy: { service: { name: 'asc' } } },
      },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const stored = project.reportSections ? safeParseArr(project.reportSections) : null

    res.json({
      projectName: project.name,
      services:    project.services.map(ps => ({ id: ps.service.id, name: ps.service.name })),
      sections:    stored ?? [...SECTION_KEYS],
    })
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /api/marketing/projects/:id/report-sections-config
 * Guarda la config de secciones habilitadas para el informe de este proyecto.
 * Body: { sections: string[] }
 */
async function updateReportSectionsConfig(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const sections = sanitizeSections(req.body?.sections)
    if (!sections) return res.status(400).json({ error: 'sections debe ser un array de claves válidas.' })

    await prisma.project.update({
      where: { id: projectId },
      data:  { reportSections: JSON.stringify(sections) },
    })

    res.json({ sections })
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
    const { notes, analysis } = req.body

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const updateData = {}
    if (notes      !== undefined) updateData.notes      = notes
    if (analysis   !== undefined) updateData.analysis   = JSON.stringify(analysis)

    const report = await prisma.monthlyReport.upsert({
      where:  { projectId_month: { projectId, month } },
      update: updateData,
      create: { projectId, workspaceId, month, token: randomUUID(), ...updateData },
    })

    res.json({
      report: {
        id:         report.id,
        month:      report.month,
        token:      report.token,
        objectives: {},
        notes:      report.notes,
      },
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { listReports, getReport, getSectionsStatus, getReportSectionsConfig, updateReportSectionsConfig, updateReport }
