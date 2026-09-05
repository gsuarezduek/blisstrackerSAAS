const prisma = require('../../lib/prisma')
const { aggregateReportData } = require('../../services/monthlyReport.service')
const { GENERATED_WHERE, reportLabel, safeParseArr, safeParseObj, loadBriefs } = require('./_shared')

/**
 * GET /api/public/report/:token
 * Endpoint PÚBLICO (sin auth). Devuelve los datos del informe para el cliente.
 */
// Arma { report, workspace, siblings, data } para un MonthlyReport YA validado
// (existe, status==='published'). Compartido por el link público individual
// (getPublicReport) y por el informe dentro del portal de cliente
// (clientPortal.controller.js#getPortalReport) — evita duplicar
// aggregateReportData/briefs/siblings/persistencia del análisis.
async function buildPublicReportPayload(report) {
  const [cachedAnalysis, workspace] = await Promise.all([
    Promise.resolve(report.analysis ? safeParseObj(report.analysis) : null),
    prisma.workspace.findUnique({
      where:  { id: report.workspaceId },
      select: { slug: true, name: true, companyName: true, companyDescription: true, industry: true, companyWebsite: true, logoData: true, brandColors: true, brandFonts: true },
    }),
  ])

  const objectives      = {}
  const enabledSections = report.enabledSections ? safeParseArr(report.enabledSections) : null
  const cachedData      = report.dataCache ? safeParseObj(report.dataCache) : null
  const briefs          = await loadBriefs(report.projectId)
  const [data, siblingRows] = await Promise.all([
    aggregateReportData(report.projectId, report.workspaceId, report.month, cachedAnalysis, objectives, cachedData, enabledSections, {
      periodStart: report.periodStart, periodEnd: report.periodEnd, briefs,
    }),
    // Otros informes PUBLICADOS del mismo proyecto, para navegar desde el link público
    prisma.monthlyReport.findMany({
      where:   { projectId: report.projectId, workspaceId: report.workspaceId, status: 'published', ...GENERATED_WHERE },
      select:  { token: true, month: true, periodStart: true, periodEnd: true },
      orderBy: { month: 'desc' },
    }),
  ])
  const siblings = siblingRows.map(r => ({ token: r.token, month: r.month, label: reportLabel(r) }))

  // Si se generó un análisis nuevo también lo guardamos (ej: primera vez que el cliente abre el link)
  if (data._analysisIsNew && data.analysis) {
    await prisma.monthlyReport.update({
      where: { id: report.id },
      data:  { analysis: JSON.stringify(data.analysis) },
    })
  }
  delete data._analysisIsNew

  return {
    report: {
      month:       report.month,
      token:       report.token,
      objectives:  {},
      notes:       report.notes,
      hasBanner:   !!report.bannerData,
      periodLabel: reportLabel(report),
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
    siblings,
    data,
  }
}

async function getPublicReport(req, res, next) {
  try {
    const { token } = req.params

    const report = await prisma.monthlyReport.findUnique({ where: { token } })
    if (!report) return res.status(404).json({ error: 'Informe no encontrado' })

    // El link público solo sirve informes PUBLICADOS (los borradores no se exponen al cliente).
    if (report.status !== 'published') {
      return res.status(404).json({ error: 'Este informe todavía no está publicado.', code: 'REPORT_DRAFT' })
    }

    res.json(await buildPublicReportPayload(report))
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/public/report/:token/meta
 * Metadata liviana del informe para armar los Open Graph tags (preview de WhatsApp,
 * etc.) desde la función serverless de Vercel. Sin auth, sin agregación pesada.
 */
async function getPublicReportMeta(req, res, next) {
  try {
    const report = await prisma.monthlyReport.findUnique({
      where:  { token: req.params.token },
      select: {
        month:          true,
        periodStart:    true,
        periodEnd:      true,
        status:         true,
        bannerMimeType: true,
        project:        { select: { name: true } },
        workspace:      { select: { name: true, companyName: true } },
      },
    })
    if (!report) return res.status(404).json({ error: 'Informe no encontrado' })
    if (report.status !== 'published') return res.status(404).json({ error: 'Informe no publicado' })

    res.set('Cache-Control', 'public, max-age=300')
    res.json({
      projectName:   report.project?.name ?? 'Proyecto',
      month:         report.month,
      monthLabel:    reportLabel(report),
      workspaceName: report.workspace?.companyName || report.workspace?.name || 'BlissTracker',
      hasBanner:     !!report.bannerMimeType,
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { getPublicReport, getPublicReportMeta, buildPublicReportPayload }
