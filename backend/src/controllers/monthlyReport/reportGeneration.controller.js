const { randomUUID } = require('crypto')
const prisma = require('../../lib/prisma')
const { aggregateReportData, resolveReportPeriod } = require('../../services/monthlyReport.service')
const { monthsInRange } = require('../../lib/monthUtils')
const { SYSTEM_TYPES, postProjectSystemMessage } = require('../../lib/chatSystemMessage')
const { saveInstagramSnapshot } = require('../../services/instagramSnapshot.service')
const { saveTikTokSnapshot }    = require('../../services/tiktokSnapshot.service')
const { saveYouTubeSnapshot }   = require('../../services/youtubeSnapshot.service')
const { saveLinkedinSnapshot }  = require('../../services/linkedinSnapshot.service')
const { saveFacebookSnapshot }  = require('../../services/facebookSnapshot.service')
const { fetchGoogleAdsData }               = require('../../services/googleAds.service')
const { fetchMetaAdsData, getValidFbToken } = require('../../services/metaAds.service')
const { SECTION_KEYS, reportPeriod, reportLabel, sanitizeSections, safeParseArr, loadBriefs } = require('./_shared')

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

module.exports = { getGenerationReadiness, regenerateReport, getGenerationLog }
