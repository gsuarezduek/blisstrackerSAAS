const { randomUUID }           = require('crypto')
const prisma                   = require('../lib/prisma')
const { aggregateReportData, getAvailableSections, resolveReportPeriod }  = require('../services/monthlyReport.service')
const { sendReportFeedbackEmail, sendReportPublishedEmail } = require('../services/email.service')
const { getProjectNotifyRecipients } = require('../lib/projectRecipients')
const { monthLabel, prevMonthStr, monthBounds, rangeLabel, monthsInRange } = require('../lib/monthUtils')
const { DEFAULT_TZ } = require('../utils/dates')
const { SYSTEM_TYPES, postProjectSystemMessage } = require('../lib/chatSystemMessage')
const { saveInstagramSnapshot } = require('../services/instagramSnapshot.service')
const { saveTikTokSnapshot }    = require('../services/tiktokSnapshot.service')
const { saveYouTubeSnapshot }   = require('../services/youtubeSnapshot.service')
const { saveLinkedinSnapshot }  = require('../services/linkedinSnapshot.service')
const { saveFacebookSnapshot }  = require('../services/facebookSnapshot.service')
const { fetchGoogleAdsData }               = require('../services/googleAds.service')
const { fetchMetaAdsData, getValidFbToken } = require('../services/metaAds.service')

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

// ─── Utility ──────────────────────────────────────────────────────────────────

function safeParseObj(str) {
  try { return JSON.parse(str || '{}') } catch { return {} }
}

// ─── Chequeo de disponibilidad de datos (antes de generar) ────────────────────
// El informe ya no intenta traer RRSS en vivo durante la generación (ver
// monthlyReport.service.js) — en su lugar, este chequeo se corre desde el modal
// "Generar Informe" y deja el snapshot del mes ancla actualizado si hace falta,
// para que la generación en sí solo lea datos ya guardados. Ads sigue siendo en
// vivo (es range-native, no calza con un snapshot mensual fijo), así que acá se
// hace un "ping" con el rango real para fallar rápido antes de comprometerse a
// generar, en vez de descubrirlo recién en el warning post-generación.
const RRSS_SAVERS = {
  instagram: { save: saveInstagramSnapshot, model: 'instagramSnapshot', integrationType: 'instagram',        label: 'Instagram' },
  tiktok:    { save: saveTikTokSnapshot,    model: 'tikTokSnapshot',    integrationType: 'tiktok',           label: 'TikTok' },
  youtube:   { save: saveYouTubeSnapshot,   model: 'youTubeSnapshot',   integrationType: 'google_youtube',   label: 'YouTube' },
  linkedin:  { save: saveLinkedinSnapshot,  model: 'linkedinSnapshot',  integrationType: 'linkedin',         label: 'LinkedIn' },
  facebook:  { save: saveFacebookSnapshot,  model: 'facebookSnapshot', integrationType: 'facebook',          label: 'Facebook' },
}

// Si ya hay snapshot del mes ancla, no hace falta pegarle a la API de nuevo.
// Si no hay, intenta traerlo y guardarlo — de ahí en más la generación lo lee como
// un snapshot normal, sin ningún camino en vivo dentro de aggregateReportData.
async function checkRrssSection(key, cfg, projectId, workspaceId, dataMonth) {
  const existing = await prisma[cfg.model].findFirst({
    where:  { projectId, workspaceId, month: dataMonth },
    select: { id: true },
  })
  if (existing) return { section: key, label: cfg.label, ok: true, refreshed: false }
  try {
    await cfg.save(projectId, workspaceId, dataMonth)
    return { section: key, label: cfg.label, ok: true, refreshed: true }
  } catch (err) {
    return { section: key, label: cfg.label, ok: false, message: err.message }
  }
}

async function checkAdsSection(type, integration, dateRange) {
  const label = type === 'googleAds' ? 'Google Ads' : 'Meta Ads'
  try {
    if (type === 'googleAds') {
      await fetchGoogleAdsData(integration, 'this_month', dateRange)
    } else {
      const token = await getValidFbToken(integration)
      await fetchMetaAdsData(integration.propertyId, token, 'this_month', dateRange)
    }
    return { section: type, label, ok: true }
  } catch (err) {
    return { section: type, label, ok: false, message: err.message }
  }
}

/**
 * POST /api/marketing/projects/:id/reports/:month/check-readiness
 * Se corre desde el modal "Generar Informe", ANTES de generar. Por cada sección
 * de RRSS con integración conectada, asegura que el snapshot del mes ancla exista
 * (lo trae y guarda si falta). Por cada sección de Ads conectada, hace una llamada
 * de prueba con el rango real del informe. No persiste nada del informe en sí —
 * solo actualiza snapshots de RRSS como efecto colateral (ver `saveXSnapshot`).
 */
async function getGenerationReadiness(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month }   = req.params

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const periodParse = parsePeriodInput(req.body)
    if (!periodParse.ok) return res.status(400).json({ error: periodParse.error })

    const existingReport = await prisma.monthlyReport.findFirst({
      where:  { projectId, workspaceId, month },
      select: { periodStart: true, periodEnd: true },
    })
    const periodStart = periodParse.value?.periodStart ?? existingReport?.periodStart ?? null
    const periodEnd   = periodParse.value?.periodEnd   ?? existingReport?.periodEnd   ?? null
    const period        = resolveReportPeriod(month, periodStart, periodEnd)
    const monthsCovered = monthsInRange(period.start, period.end)
    const dataMonth      = monthsCovered[monthsCovered.length - 1]

    const sectionSet = new Set(sanitizeSections(req.body?.enabledSections) ?? SECTION_KEYS)

    const integrations = await prisma.projectIntegration.findMany({
      where:  { projectId, status: 'active' },
      select: { type: true, propertyId: true, customerId: true, accessToken: true, refreshToken: true, expiresAt: true, scopes: true },
    })
    const byType = (t) => integrations.find(i => i.type === t)

    const checks = []

    for (const [key, cfg] of Object.entries(RRSS_SAVERS)) {
      if (!sectionSet.has(key)) continue
      if (!byType(cfg.integrationType)) continue // sin integración conectada: nada que chequear
      checks.push(checkRrssSection(key, cfg, projectId, workspaceId, dataMonth))
    }

    const dateRange = { startDate: period.start, endDate: period.end }
    const gadsIntegration = byType('google_ads')
    if (sectionSet.has('googleAds') && gadsIntegration && gadsIntegration.customerId && process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
      checks.push(checkAdsSection('googleAds', gadsIntegration, dateRange))
    }
    const metaIntegration = byType('meta_ads')
    if (sectionSet.has('metaAds') && metaIntegration && metaIntegration.propertyId) {
      checks.push(checkAdsSection('metaAds', metaIntegration, dateRange))
    }

    const results = await Promise.all(checks)
    res.json({ dataMonth, results })
  } catch (err) {
    next(err)
  }
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

    // Log del intento (no bloquea la respuesta si falla) — permite auditar qué venía
    // saliendo mal cuando alguien tuvo que regenerar el informe varias veces seguidas.
    prisma.reportGenerationLog.create({
      data: {
        workspaceId, projectId, reportId: report.id, userId,
        warnings:      data.dataWarnings?.length ? JSON.stringify(data.dataWarnings) : null,
        analysisError: data.analysisError || null,
      },
    }).catch(err => console.error('[MonthlyReport] Error al registrar el intento de generación:', err.message))

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

    const actorName = req.user?.name || 'Alguien'
    setImmediate(() => {
      postProjectSystemMessage(
        projectId, workspaceId, SYSTEM_TYPES.REPORT_GENERATED,
        `📊 ${actorName} generó el informe de ${reportLabel(updatedReport)}.`
      ).catch(() => {})
    })

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
 * GET /api/marketing/projects/:id/reports/:month/generation-log
 * Historial de intentos de generación/regeneración del informe (quién, cuándo,
 * qué warnings de datos y de análisis IA tuvo cada intento). Últimos 20.
 */
async function getGenerationLog(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month }   = req.params

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }

    const report = await prisma.monthlyReport.findFirst({ where: { projectId, workspaceId, month }, select: { id: true } })
    if (!report) return res.json({ attempts: [] })

    const rows = await prisma.reportGenerationLog.findMany({
      where:   { reportId: report.id },
      orderBy: { createdAt: 'desc' },
      take:    20,
      select:  { id: true, warnings: true, analysisError: true, createdAt: true, user: { select: { name: true } } },
    })

    res.json({
      attempts: rows.map(r => ({
        id:            r.id,
        createdAt:     r.createdAt,
        userName:      r.user?.name || 'Sistema',
        warnings:      r.warnings ? safeParseArr(r.warnings) : [],
        analysisError: r.analysisError,
      })),
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
 * POST /api/marketing/projects/:id/reports/:month/notify
 * Avisa por email a los contactos activos del portal de cliente de que el
 * informe (ya publicado) está disponible. Requiere portal activo con al menos
 * un contacto — mismo criterio que "Pedir aprobación" de Contenido.
 */
async function notifyReportPublished(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month }   = req.params

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }

    const report = await prisma.monthlyReport.findFirst({ where: { projectId, workspaceId, month } })
    if (!report) return res.status(404).json({ error: 'Informe no encontrado' })
    if (report.status !== 'published') {
      return res.status(400).json({ error: 'Publicá el informe antes de avisarle al cliente' })
    }

    const portal = await prisma.projectClientPortal.findUnique({ where: { projectId } })
    if (!portal || !portal.active) {
      return res.status(400).json({ error: 'Este proyecto no tiene un portal de cliente activo — configuralo en la pestaña Info' })
    }

    const contacts = await prisma.clientPortalContact.findMany({
      where:  { portalId: portal.id, active: true },
      select: { email: true },
    })
    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No hay contactos activos en el portal — agregá uno en la configuración' })
    }

    const [project, workspace] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true, name: true, companyName: true } }),
    ])

    const domain    = process.env.APP_DOMAIN || 'blisstracker.app'
    const portalUrl = `https://${workspace.slug}.${domain}/report/${portal.slug}?report=${report.token}`
    const emails    = contacts.map(c => c.email)

    setImmediate(() => {
      sendReportPublishedEmail(emails, {
        projectName:   project?.name || 'Proyecto',
        periodLabel:   reportLabel(report),
        portalUrl,
        workspaceName: workspace?.companyName || workspace?.name,
      }, workspaceId).catch(() => {})
    })

    res.json({ sent: emails.length })
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
  if (!fullReport) return

  // Deja constancia en el chat del proyecto aunque no haya nadie a quien avisar por
  // email (workspace/emails vacío) — el resto de la función es solo el aviso por mail.
  const clientLabel = (feedback.name || '').trim() || 'Un cliente'
  const comment = (feedback.comment || '').trim()
  const commentPart = comment ? `: "${comment.length > 140 ? `${comment.slice(0, 137)}…` : comment}"` : ''
  setImmediate(() => {
    postProjectSystemMessage(
      projectId, workspaceId, SYSTEM_TYPES.REPORT_RATED,
      `⭐ ${clientLabel} calificó el informe de ${reportLabel(fullReport)}: ${feedback.rating}/5${commentPart}`
    ).catch(() => {})
  })

  if (!workspace || emails.length === 0) return

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

module.exports = { listReports, getReport, getSectionsStatus, getReportSectionsConfig, updateReportSectionsConfig, updateReport, getPublicReport, getPublicReportMeta, getGenerationReadiness, regenerateReport, getGenerationLog, removeReportSections, setReportStatus, notifyReportPublished, submitReportFeedback, SECTION_KEYS, sanitizeSections, currentMonthStr, GENERATED_WHERE, buildPublicReportPayload }
