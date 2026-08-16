const { randomUUID }           = require('crypto')
const prisma                   = require('../lib/prisma')
const { aggregateReportData, getAvailableSections }  = require('../services/monthlyReport.service')
const { sendReportFeedbackEmail } = require('../services/email.service')
const { getProjectNotifyRecipients } = require('../lib/projectRecipients')
const { monthLabel, prevMonthStr, monthBounds, rangeLabel } = require('../lib/monthUtils')
const { DEFAULT_TZ } = require('../utils/dates')

// Filtro Prisma para informes "generados" (no placeholders vacíos)
const GENERATED_WHERE = {
  OR: [
    { enabledSections: { not: null } },
    { dataCache:       { not: null } },
    { analysis:        { not: null } },
  ],
}

// ─── Período de un informe ──────────────────────────────────────────────────────
// Resuelve el rango de datos (YYYY-MM-DD). Legacy (sin periodStart) → mes completo anterior.
function reportPeriod(report) {
  if (report.periodStart && report.periodEnd) {
    return {
      start: new Date(report.periodStart).toISOString().slice(0, 10),
      end:   new Date(report.periodEnd).toISOString().slice(0, 10),
    }
  }
  const { startDate, endDate } = monthBounds(prevMonthStr(report.month))
  return { start: startDate, end: endDate }
}

function reportLabel(report) {
  const p = reportPeriod(report)
  return rangeLabel(p.start, p.end)
}

// Valida un rango recibido del cliente. Devuelve { periodStart, periodEnd } (Date) o null si inválido/ausente.
// `null` (sin rango) es válido → se usa el default (mes anterior completo).
function parsePeriodInput(body) {
  const s = body?.periodStart
  const e = body?.periodEnd
  if (!s && !e) return { ok: true, value: null }
  if (!s || !e) return { ok: false, error: 'Rango incompleto: enviá inicio y fin.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) {
    return { ok: false, error: 'Formato de fecha inválido (esperado YYYY-MM-DD).' }
  }
  if (s > e) return { ok: false, error: 'La fecha de inicio no puede ser posterior a la de fin.' }
  return { ok: true, value: { periodStart: new Date(`${s}T00:00:00.000Z`), periodEnd: new Date(`${e}T00:00:00.000Z`) } }
}

// Resumen del feedback del cliente sobre un informe (para la vista admin).
async function loadFeedbackSummary(reportId) {
  const items = await prisma.reportFeedback.findMany({
    where:   { reportId },
    orderBy: { createdAt: 'desc' },
    select:  { id: true, name: true, rating: true, comment: true, createdAt: true },
  })
  const count = items.length
  const avg   = count ? parseFloat((items.reduce((s, i) => s + i.rating, 0) / count).toFixed(1)) : null
  return { count, avg, items }
}

// Carga los briefs del proyecto (para contextualizar el análisis IA).
async function loadBriefs(projectId) {
  try {
    const rows = await prisma.projectBrief.findMany({
      where:  { projectId },
      select: { type: true, answers: true },
    })
    return rows.map(r => ({ type: r.type, answers: r.answers || {} }))
  } catch {
    return null
  }
}

const ALLOWED_BANNER_TYPES = ['image/png', 'image/jpeg', 'image/webp']

// Claves de sección válidas para `enabledSections` (deben coincidir con las del servicio/ReportViewer)
const SECTION_KEYS = [
  'objectives', 'analytics', 'performance', 'geo', 'seo', 'keywords',
  'instagram', 'tiktok', 'youtube', 'linkedin', 'facebook', 'metaAds', 'googleAds', 'competitors', 'tasks',
]

// Normaliza un array de claves de sección recibido del cliente (filtra inválidas)
function sanitizeSections(arr) {
  if (!Array.isArray(arr)) return null
  const clean = arr.filter(k => SECTION_KEYS.includes(k))
  return clean
}

function safeParseArr(str) {
  try { const v = JSON.parse(str); return Array.isArray(v) ? v : null } catch { return null }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
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
      // Heredar banner del informe más reciente del mismo proyecto
      const prevReport = await prisma.monthlyReport.findFirst({
        where:   { projectId, workspaceId, bannerData: { not: null } },
        orderBy: { month: 'desc' },
        select:  { bannerData: true, bannerMimeType: true },
      })
      report = await prisma.monthlyReport.create({
        data: {
          projectId, workspaceId, month, token: randomUUID(),
          generatedById: req.user?.userId ?? null,
          ...(prevReport?.bannerData ? { bannerData: prevReport.bannerData, bannerMimeType: prevReport.bannerMimeType } : {}),
        },
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

/**
 * GET /api/public/report/:token
 * Endpoint PÚBLICO (sin auth). Devuelve los datos del informe para el cliente.
 */
async function getPublicReport(req, res, next) {
  try {
    const { token } = req.params

    const report = await prisma.monthlyReport.findUnique({ where: { token } })
    if (!report) return res.status(404).json({ error: 'Informe no encontrado' })

    // El link público solo sirve informes PUBLICADOS (los borradores no se exponen al cliente).
    if (report.status !== 'published') {
      return res.status(404).json({ error: 'Este informe todavía no está publicado.', code: 'REPORT_DRAFT' })
    }

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

    res.json({
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
    })
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
      create: { projectId, workspaceId, month, token: randomUUID(), bannerData: req.file.buffer, bannerMimeType: mimeType },
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

    // Rango de fechas del informe (opcional; sin él = mes anterior completo)
    const periodParse = parsePeriodInput(req.body)
    if (!periodParse.ok) return res.status(400).json({ error: periodParse.error })

    // Limpiar análisis cacheado (o crear el registro si no existe)
    let report = await prisma.monthlyReport.findFirst({ where: { projectId, workspaceId, month } })
    const userId = req.user?.userId ?? null

    // Secciones a incluir: las del body (modal "Generar Informe") tienen prioridad;
    // si no se envían, se reutilizan las del informe existente (regeneración simple).
    const fromBody  = sanitizeSections(req.body?.enabledSections)
    const existing  = report?.enabledSections ? safeParseArr(report.enabledSections) : null
    const sectionsToUse = fromBody ?? existing
    const sectionsJson  = sectionsToUse ? JSON.stringify(sectionsToUse) : null

    // Período: si el body trae rango, se persiste. Si no y ya existía uno, se conserva.
    const periodData = periodParse.value
      ? { periodStart: periodParse.value.periodStart, periodEnd: periodParse.value.periodEnd }
      : {}

    if (report) {
      await prisma.monthlyReport.update({
        where: { id: report.id },
        data:  { analysis: null, dataCache: null, generatedById: userId, ...(sectionsJson != null ? { enabledSections: sectionsJson } : {}), ...periodData },
      })
      report = await prisma.monthlyReport.findUnique({ where: { id: report.id } })
    } else {
      report = await prisma.monthlyReport.create({
        data: { projectId, workspaceId, month, token: randomUUID(), generatedById: userId, enabledSections: sectionsJson, ...periodData },
      })
    }

    // Re-agregar los datos de las secciones elegidas sin caché de análisis (fuerza regeneración con Claude)
    const objectives = {}
    const briefs     = await loadBriefs(projectId)
    const data = await aggregateReportData(projectId, workspaceId, month, null, objectives, null, sectionsToUse, {
      periodStart: report.periodStart, periodEnd: report.periodEnd, briefs,
    })

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
    const period = reportPeriod(updatedReport)

    res.json({
      report: {
        id:              updatedReport.id,
        month:           updatedReport.month,
        token:           updatedReport.token,
        objectives:      {},
        notes:           updatedReport.notes,
        hasBanner:       !!updatedReport.bannerData,
        createdAt:       updatedReport.createdAt,
        status:          updatedReport.status,
        periodStart:     period.start,
        periodEnd:       period.end,
        periodLabel:     reportLabel(updatedReport),
        enabledSections: updatedReport.enabledSections ? safeParseArr(updatedReport.enabledSections) : null,
        isGenerated:     updatedReport.enabledSections != null,
      },
      data,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /api/marketing/projects/:id/reports/:month/status
 * Publica o vuelve a borrador un informe. body: { status: 'draft' | 'published' }
 * Solo los informes publicados son visibles por el link público del cliente.
 */
async function setReportStatus(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month }   = req.params
    const { status }  = req.body

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }
    if (status !== 'draft' && status !== 'published') {
      return res.status(400).json({ error: 'Estado inválido (draft | published)' })
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const report = await prisma.monthlyReport.findFirst({ where: { projectId, workspaceId, month }, select: { id: true } })
    if (!report) return res.status(404).json({ error: 'Informe no encontrado' })

    await prisma.monthlyReport.update({ where: { id: report.id }, data: { status } })
    res.json({ status })
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /api/marketing/projects/:id/reports/:month/sections
 * Elimina secciones/sub-secciones de un informe ya generado, sin regenerar ni
 * llamar a la IA. Actualiza `enabledSections` y poda el `dataCache` para que las
 * secciones borradas no viajen al link del cliente. body: { remove: [keys] }
 */
async function removeReportSections(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month }   = req.params

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }

    const remove = sanitizeSections(req.body?.remove)
    if (!remove || remove.length === 0) {
      return res.status(400).json({ error: 'No se indicaron secciones válidas a eliminar.' })
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const report = await prisma.monthlyReport.findFirst({ where: { projectId, workspaceId, month } })
    if (!report) return res.status(404).json({ error: 'Informe no encontrado' })

    const isGenerated = report.enabledSections != null || report.dataCache != null || report.analysis != null
    if (!isGenerated) return res.status(400).json({ error: 'El informe todavía no está generado.' })

    // enabledSections null (legacy) = todas → materializamos el catálogo completo antes de restar.
    const current   = report.enabledSections ? safeParseArr(report.enabledSections) : [...SECTION_KEYS]
    const removeSet = new Set(remove)
    const next      = (current || [...SECTION_KEYS]).filter(k => !removeSet.has(k))

    const update = { enabledSections: JSON.stringify(next) }
    // Podar el caché para que la sección no viaje al informe público.
    if (report.dataCache) {
      const dc = safeParseObj(report.dataCache)
      if (dc && dc.sections) {
        for (const k of remove) if (k in dc.sections) dc.sections[k] = null
        // `evolution` es la serie histórica de `analytics`: si se borra analytics, también se va.
        if (removeSet.has('analytics') && 'evolution' in dc.sections) dc.sections.evolution = null
        update.dataCache = JSON.stringify(dc)
      }
    }

    await prisma.monthlyReport.update({ where: { id: report.id }, data: update })

    res.json({ enabledSections: next })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/public/report/:token/feedback
 * Endpoint PÚBLICO (sin auth). El cliente califica el informe 1–5 + comentario opcional.
 * Solo se acepta feedback de informes publicados.
 */
async function submitReportFeedback(req, res, next) {
  try {
    const { token } = req.params
    const { name, rating, comment } = req.body

    const r = Number(rating)
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return res.status(400).json({ error: 'Elegí una calificación de 1 a 5 estrellas.' })
    }

    const report = await prisma.monthlyReport.findUnique({
      where:  { token },
      select: { id: true, projectId: true, workspaceId: true, status: true },
    })
    if (!report) return res.status(404).json({ error: 'Informe no encontrado' })
    if (report.status !== 'published') return res.status(404).json({ error: 'Informe no disponible' })

    const cleanName    = (name    ?? '').toString().trim().slice(0, 120)  || null
    const cleanComment = (comment ?? '').toString().trim().slice(0, 2000) || null

    await prisma.reportFeedback.create({
      data: { reportId: report.id, workspaceId: report.workspaceId, name: cleanName, rating: r, comment: cleanComment },
    })

    res.status(201).json({ ok: true })

    // Aviso por email a la agencia (fire-and-forget, no bloquea ni rompe la respuesta)
    setImmediate(() => {
      notifyReportFeedback(report, { name: cleanName, rating: r, comment: cleanComment })
        .catch(err => console.warn('[ReportFeedback] aviso por email fallido (ignorado):', err.message))
    })
  } catch (err) {
    next(err)
  }
}

// Avisa a admins/owners del workspace + miembros del proyecto que un cliente dejó feedback.
async function notifyReportFeedback(report, feedback) {
  const { id: reportId, projectId, workspaceId } = report
  const [fullReport, project, workspace, { emails }] = await Promise.all([
    prisma.monthlyReport.findUnique({ where: { id: reportId }, select: { token: true, month: true, periodStart: true, periodEnd: true } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true, name: true, companyName: true } }),
    getProjectNotifyRecipients(projectId, workspaceId),
  ])
  if (!fullReport || !workspace || emails.length === 0) return

  const domain    = process.env.APP_DOMAIN || 'blisstracker.app'
  const reportUrl = `https://${workspace.slug}.${domain}/report/${fullReport.token}`

  await sendReportFeedbackEmail(emails, {
    projectName:   project?.name || 'Proyecto',
    periodLabel:   reportLabel(fullReport),
    reportUrl,
    name:          feedback.name,
    rating:        feedback.rating,
    comment:       feedback.comment,
    workspaceName: workspace.companyName || workspace.name,
  }, workspaceId)
}

module.exports = { listReports, getReport, getSectionsStatus, getReportSectionsConfig, updateReportSectionsConfig, updateReport, getPublicReport, getPublicReportMeta, regenerateReport, removeReportSections, setReportStatus, uploadReportBanner, deleteReportBanner, submitReportFeedback, SECTION_KEYS, sanitizeSections, currentMonthStr, GENERATED_WHERE }
