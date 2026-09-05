const prisma = require('../../lib/prisma')
const { DEFAULT_LATE_TEMPLATE } = require('../../services/lateNotification.service')
const { MARKETING_SECTION_IDS } = require('../../lib/marketingSections')
const { sendTestDigest: sendMarketingDigestTest } = require('../../services/marketingDigest.service')
const { sendLateNotificationEmail } = require('../../services/email.service')

async function getGlobalSettings(req, res, next) {
  try {
    const workspace = req.workspace
    const first = await prisma.project.findFirst({
      where: { workspaceId: workspace.id },
      select: { linksEnabled: true, situationEnabled: true, hoursEnabled: true, briefsEnabled: true, emailFrom: true, aiWeeklyTokenLimit: true },
      orderBy: { id: 'asc' },
    })
    const effectiveEmailFrom = first?.emailFrom ?? process.env.EMAIL_FROM ?? null
    res.json({
      timezone: workspace.timezone,
      linksEnabled: first?.linksEnabled ?? true,
      situationEnabled: first?.situationEnabled ?? true,
      hoursEnabled: first?.hoursEnabled ?? false,
      briefsEnabled: first?.briefsEnabled ?? true,
      attendanceTrackingEnabled: workspace.attendanceTrackingEnabled ?? true,
      productivityEnabled: workspace.productivityEnabled ?? true,
      productivityDigestEnabled: workspace.productivityDigestEnabled ?? true,
      adsAdvisorAutoEnabled: workspace.adsAdvisorAutoEnabled ?? true,
      rrssAdvisorAutoEnabled: workspace.rrssAdvisorAutoEnabled ?? true,
      marketingDisabledSections: JSON.parse(workspace.marketingDisabledSections || '[]'),
      marketingDigestEnabled: workspace.marketingDigestEnabled ?? true,
      seoAlertsEnabled: workspace.seoAlertsEnabled ?? true,
      lateToleranceMins: workspace.lateToleranceMins ?? 0,
      lateNotifyEnabled: workspace.lateNotifyEnabled ?? false,
      lateNotifyThreshold: workspace.lateNotifyThreshold ?? 3,
      lateNotifyTemplate: workspace.lateNotifyTemplate || DEFAULT_LATE_TEMPLATE,
      emailFrom: effectiveEmailFrom,
      aiWeeklyTokenLimit: first?.aiWeeklyTokenLimit ?? 500000,
    })
  } catch (err) { next(err) }
}

async function getAiUsage(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const now = new Date()
    const startOfDay   = new Date(now); startOfDay.setHours(0, 0, 0, 0)
    const startOfWeek  = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // Período para el desglose por servicio
    const { period } = req.query
    let periodStart = null
    let periodEnd   = null
    if (period === '7d')         { periodStart = new Date(now); periodStart.setDate(now.getDate() - 7) }
    if (period === '30d')        { periodStart = new Date(now); periodStart.setDate(now.getDate() - 30) }
    if (period === 'month')      { periodStart = new Date(now.getFullYear(), now.getMonth(), 1) }
    if (period === 'prev_month') {
      periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      periodEnd   = new Date(now.getFullYear(), now.getMonth(), 1)
    }
    // 'all' o sin param: sin filtro de fecha (todo el tiempo)

    const whereBase = {
      workspaceId,
      ...(periodStart ? { createdAt: { gte: periodStart, ...(periodEnd ? { lt: periodEnd } : {}) } } : {}),
    }

    const [day, week, month, byServiceRaw, periodTotal, workspace] = await Promise.all([
      prisma.aiTokenLog.aggregate({ where: { workspaceId, createdAt: { gte: startOfDay } },   _sum: { inputTokens: true, outputTokens: true } }),
      prisma.aiTokenLog.aggregate({ where: { workspaceId, createdAt: { gte: startOfWeek } },  _sum: { inputTokens: true, outputTokens: true } }),
      prisma.aiTokenLog.aggregate({ where: { workspaceId, createdAt: { gte: startOfMonth } }, _sum: { inputTokens: true, outputTokens: true } }),
      prisma.aiTokenLog.groupBy({ by: ['service'], where: whereBase, _sum: { inputTokens: true, outputTokens: true }, orderBy: { _sum: { inputTokens: 'desc' } } }),
      prisma.aiTokenLog.aggregate({ where: whereBase, _sum: { inputTokens: true, outputTokens: true } }),
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { monthlyTokenLimit: true } }),
    ])

    const toTotal = (agg) => (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0)

    const byService = byServiceRaw.map(r => ({
      service:      r.service,
      inputTokens:  r._sum.inputTokens  ?? 0,
      outputTokens: r._sum.outputTokens ?? 0,
      total:        (r._sum.inputTokens ?? 0) + (r._sum.outputTokens ?? 0),
    })).sort((a, b) => b.total - a.total)

    res.json({
      day:               { input: day._sum.inputTokens   ?? 0, output: day._sum.outputTokens   ?? 0, total: toTotal(day) },
      week:              { input: week._sum.inputTokens  ?? 0, output: week._sum.outputTokens  ?? 0, total: toTotal(week) },
      month:             { input: month._sum.inputTokens ?? 0, output: month._sum.outputTokens ?? 0, total: toTotal(month) },
      byService,
      periodTotal:       { input: periodTotal._sum.inputTokens ?? 0, output: periodTotal._sum.outputTokens ?? 0, total: toTotal(periodTotal) },
      period:            period || 'all',
      monthlyTokenLimit: workspace?.monthlyTokenLimit ?? 1000000,
    })
  } catch (err) { next(err) }
}

async function saveGlobalSettings(req, res, next) {
  try {
    const { timezone, linksEnabled, situationEnabled, hoursEnabled, briefsEnabled, attendanceTrackingEnabled, productivityEnabled, productivityDigestEnabled, adsAdvisorAutoEnabled, rrssAdvisorAutoEnabled, marketingDisabledSections, marketingDigestEnabled, seoAlertsEnabled, lateToleranceMins, lateNotifyEnabled, lateNotifyThreshold, lateNotifyTemplate, emailFrom, aiWeeklyTokenLimit } = req.body
    const workspaceData = {}
    const projectData = {}

    if (timezone !== undefined) {
      try { Intl.DateTimeFormat(undefined, { timeZone: timezone }) }
      catch { return res.status(400).json({ error: 'Zona horaria inválida' }) }
      workspaceData.timezone = timezone
    }
    if (attendanceTrackingEnabled !== undefined) workspaceData.attendanceTrackingEnabled = Boolean(attendanceTrackingEnabled)
    if (productivityEnabled !== undefined) workspaceData.productivityEnabled = Boolean(productivityEnabled)
    if (productivityDigestEnabled !== undefined) workspaceData.productivityDigestEnabled = Boolean(productivityDigestEnabled)
    if (adsAdvisorAutoEnabled !== undefined) workspaceData.adsAdvisorAutoEnabled = Boolean(adsAdvisorAutoEnabled)
    if (rrssAdvisorAutoEnabled !== undefined) workspaceData.rrssAdvisorAutoEnabled = Boolean(rrssAdvisorAutoEnabled)
    if (marketingDigestEnabled !== undefined) workspaceData.marketingDigestEnabled = Boolean(marketingDigestEnabled)
    if (seoAlertsEnabled !== undefined) workspaceData.seoAlertsEnabled = Boolean(seoAlertsEnabled)
    if (marketingDisabledSections !== undefined) {
      if (!Array.isArray(marketingDisabledSections) || marketingDisabledSections.some(id => !MARKETING_SECTION_IDS.includes(id))) {
        return res.status(400).json({ error: 'marketingDisabledSections inválido' })
      }
      const unique = [...new Set(marketingDisabledSections)]
      if (unique.length >= MARKETING_SECTION_IDS.length) {
        return res.status(400).json({ error: 'Debe quedar al menos una sección de Marketing habilitada' })
      }
      workspaceData.marketingDisabledSections = JSON.stringify(unique)
    }
    if (lateToleranceMins !== undefined) {
      const t = Number(lateToleranceMins)
      if (!Number.isInteger(t) || t < 0 || t > 120) {
        return res.status(400).json({ error: 'La tolerancia debe ser un entero entre 0 y 120 minutos' })
      }
      workspaceData.lateToleranceMins = t
    }
    if (lateNotifyEnabled !== undefined) workspaceData.lateNotifyEnabled = Boolean(lateNotifyEnabled)
    if (lateNotifyThreshold !== undefined) {
      const n = Number(lateNotifyThreshold)
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        return res.status(400).json({ error: 'El umbral de tardanzas debe ser un entero entre 1 y 10' })
      }
      workspaceData.lateNotifyThreshold = n
    }
    if (lateNotifyTemplate !== undefined) {
      if (lateNotifyTemplate === null || lateNotifyTemplate === '' || lateNotifyTemplate === DEFAULT_LATE_TEMPLATE) {
        workspaceData.lateNotifyTemplate = null  // vacío o igual al default → null (usa el default)
      } else if (typeof lateNotifyTemplate === 'string') {
        if (lateNotifyTemplate.length > 5000) {
          return res.status(400).json({ error: 'El texto del email es demasiado largo (máx. 5000 caracteres)' })
        }
        workspaceData.lateNotifyTemplate = lateNotifyTemplate
      }
    }
    if (linksEnabled !== undefined)    projectData.linksEnabled    = Boolean(linksEnabled)
    if (situationEnabled !== undefined) projectData.situationEnabled = Boolean(situationEnabled)
    if (hoursEnabled !== undefined)    projectData.hoursEnabled    = Boolean(hoursEnabled)
    if (briefsEnabled !== undefined)   projectData.briefsEnabled   = Boolean(briefsEnabled)
    if (aiWeeklyTokenLimit !== undefined) {
      const limit = Number(aiWeeklyTokenLimit)
      if (!Number.isInteger(limit) || limit < 0) {
        return res.status(400).json({ error: 'aiWeeklyTokenLimit debe ser un entero positivo' })
      }
      projectData.aiWeeklyTokenLimit = limit
    }
    if (emailFrom !== undefined) {
      if (emailFrom === null || emailFrom === '') {
        projectData.emailFrom = null
      } else if (typeof emailFrom === 'string') {
        const emailMatch = emailFrom.match(/<([^>]+)>/) || [null, emailFrom.trim()]
        const addr = emailMatch[1]
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
          return res.status(400).json({ error: 'Dirección de email inválida' })
        }
        projectData.emailFrom = emailFrom.trim()
      }
    }

    const workspaceId = req.workspace.id
    await Promise.all([
      Object.keys(workspaceData).length > 0
        ? prisma.workspace.update({ where: { id: workspaceId }, data: workspaceData })
        : Promise.resolve(),
      Object.keys(projectData).length > 0
        ? prisma.project.updateMany({ where: { workspaceId }, data: projectData })
        : Promise.resolve(),
    ])

    res.json({ ok: true, ...workspaceData, ...projectData })
  } catch (err) { next(err) }
}

// Envía el email de tardanza al usuario actual (vista previa). Usa el template del body
// si viene (para previsualizar ediciones sin guardar), si no el guardado / default.
async function testLateNotification(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { name: true, email: true },
    })
    const tpl = (typeof req.body.template === 'string' && req.body.template.trim())
      ? req.body.template
      : (req.workspace.lateNotifyTemplate || DEFAULT_LATE_TEMPLATE)
    await sendLateNotificationEmail(user.email, user.name, req.workspace.name, tpl, req.workspace.id)
    res.json({ ok: true, sentTo: user.email })
  } catch (err) { next(err) }
}

// Envía el digest semanal de Prioridades (Marketing) al admin actual, como vista previa.
async function testMarketingDigest(req, res, next) {
  try {
    const r = await sendMarketingDigestTest(req.workspace, req.user.email)
    res.json(r)
  } catch (err) { next(err) }
}

module.exports = { getGlobalSettings, saveGlobalSettings, testLateNotification, testMarketingDigest, getAiUsage }
