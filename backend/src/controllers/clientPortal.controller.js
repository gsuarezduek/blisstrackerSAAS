const jwt = require('jsonwebtoken')
const prisma = require('../lib/prisma')
const { aggregateReportData } = require('../services/monthlyReport.service')
const { sendClientLoginCodeEmail } = require('../services/email.service')
const { todayString } = require('../utils/dates')
const {
  sanitizeSections,
  currentMonthStr,
  GENERATED_WHERE,
} = require('./monthlyReport.controller')

const SLUG_RE = /^[a-z0-9-]{3,40}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_TTL_MS = 10 * 60 * 1000
const OTP_RATE_LIMIT = 5
const OTP_RATE_WINDOW_MS = 60 * 60 * 1000
const LIVE_REFRESH_COOLDOWN_MS = 15 * 60 * 1000

// ─── Helpers compartidos (mismo criterio que briefs.controller.js) ────────────

async function resolveProjectId(param, workspaceId) {
  const num = Number(param)
  if (Number.isInteger(num) && num > 0) {
    const p = await prisma.project.findFirst({ where: { id: num, workspaceId }, select: { id: true } })
    return p?.id ?? null
  }
  const p = await prisma.project.findFirst({ where: { name: param, workspaceId }, select: { id: true } })
  return p?.id ?? null
}

function isAdmin(req) {
  const m = req.workspaceMember
  return req.user?.isSuperAdmin || m?.role === 'admin' || m?.role === 'owner'
}

async function canWrite(req, projectId) {
  if (isAdmin(req)) return true
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: req.user.userId } },
  })
  return !!member
}

function shapePortal(portal, workspaceSlug) {
  return {
    slug:          portal.slug,
    clientEmail:   portal.clientEmail,
    clientName:    portal.clientName,
    active:        portal.active,
    liveSections:  JSON.parse(portal.liveSections || '[]'),
    publicUrl:     `https://${workspaceSlug}.${process.env.APP_DOMAIN || 'blisstracker.app'}/report/${portal.slug}`,
    updatedAt:     portal.updatedAt,
  }
}

function safeParseArr(str) {
  try { const v = JSON.parse(str); return Array.isArray(v) ? v : [] } catch { return [] }
}

// ─── Admin: configuración del portal (autenticado, dentro del proyecto) ───────

/**
 * GET /api/projects/:id/client-portal
 */
async function getClientPortal(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const portal = await prisma.projectClientPortal.findUnique({ where: { projectId } })
    res.json({ portal: portal ? shapePortal(portal, req.workspace.slug) : null })
  } catch (err) { next(err) }
}

/**
 * PUT /api/projects/:id/client-portal
 * Body: { slug, clientEmail, clientName?, active, liveSections }. Upsert.
 */
async function saveClientPortal(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) {
      return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

    const { slug, clientEmail, clientName, active, liveSections } = req.body || {}

    if (!slug || !SLUG_RE.test(slug)) {
      return res.status(400).json({ error: 'El slug debe tener 3-40 caracteres: minúsculas, números y guiones.' })
    }
    if (!clientEmail || !EMAIL_RE.test(clientEmail)) {
      return res.status(400).json({ error: 'Email de cliente inválido.' })
    }
    const existing = await prisma.projectClientPortal.findUnique({ where: { slug } })
    if (existing && existing.projectId !== projectId) {
      return res.status(409).json({ error: 'Ese slug ya está en uso. Probá con otro.' })
    }

    const cleanSections = sanitizeSections(liveSections) ?? []

    const data = {
      slug,
      clientEmail: clientEmail.trim().toLowerCase(),
      clientName:  clientName ? String(clientName).trim() : null,
      active:      active !== false,
      liveSections: JSON.stringify(cleanSections),
    }

    const portal = await prisma.projectClientPortal.upsert({
      where:  { projectId },
      update: data,
      create: { ...data, projectId, workspaceId },
    })
    res.json({ portal: shapePortal(portal, req.workspace.slug) })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/projects/:id/client-portal
 */
async function deleteClientPortal(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) {
      return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }
    await prisma.projectClientPortal.deleteMany({ where: { projectId, workspaceId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ─── Público: portal del cliente (sin auth) ───────────────────────────────────

/**
 * GET /api/public/client-portal/:slug
 * Meta del proyecto/workspace + informes publicados + briefs. Abierto, sin login.
 */
async function getPortalPublic(req, res, next) {
  try {
    const portal = await prisma.projectClientPortal.findUnique({ where: { slug: req.params.slug } })
    if (!portal || !portal.active) return res.status(404).json({ error: 'Portal no encontrado' })

    const [project, workspace, reportRows, briefRows] = await Promise.all([
      prisma.project.findUnique({ where: { id: portal.projectId }, select: { id: true, name: true } }),
      prisma.workspace.findUnique({
        where:  { id: portal.workspaceId },
        select: { slug: true, name: true, companyName: true, companyDescription: true, industry: true, companyWebsite: true, logoData: true, brandColors: true, brandFonts: true },
      }),
      prisma.monthlyReport.findMany({
        where:   { projectId: portal.projectId, workspaceId: portal.workspaceId, status: 'published', ...GENERATED_WHERE },
        select:  { token: true, month: true },
        orderBy: { month: 'desc' },
      }),
      prisma.projectBrief.findMany({
        where:   { projectId: portal.projectId, workspaceId: portal.workspaceId },
        orderBy: { updatedAt: 'desc' },
      }),
    ])

    res.json({
      project: project ? { name: project.name } : null,
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
      reports: reportRows.map(r => ({ token: r.token, month: r.month })),
      briefs:  briefRows.map(b => ({ type: b.type, answers: b.answers && typeof b.answers === 'object' ? b.answers : {}, updatedAt: b.updatedAt })),
      hasLiveSections: safeParseArr(portal.liveSections).length > 0,
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/public/client-portal/:slug/live/request-code
 * Body: { email }. Genera y envía un código OTP de 6 dígitos si el email matchea
 * al registrado. Respuesta genérica siempre (no confirma si el email es correcto).
 */
async function requestLoginCode(req, res, next) {
  try {
    const portal = await prisma.projectClientPortal.findUnique({ where: { slug: req.params.slug } })
    if (!portal || !portal.active) return res.status(404).json({ error: 'Portal no encontrado' })

    const email = String(req.body?.email || '').trim().toLowerCase()
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email inválido.' })
    }

    if (email === portal.clientEmail.toLowerCase()) {
      const recentCount = await prisma.clientPortalLoginCode.count({
        where: { portalId: portal.id, createdAt: { gt: new Date(Date.now() - OTP_RATE_WINDOW_MS) } },
      })
      if (recentCount >= OTP_RATE_LIMIT) {
        return res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en un rato.' })
      }

      const code = String(Math.floor(100000 + Math.random() * 900000))
      const expiresAt = new Date(Date.now() + OTP_TTL_MS)
      await prisma.clientPortalLoginCode.create({ data: { portalId: portal.id, email, code, expiresAt } })

      const project = await prisma.project.findUnique({ where: { id: portal.projectId }, select: { name: true } })
      await sendClientLoginCodeEmail(email, project?.name || 'tu proyecto', code, portal.workspaceId)
    }

    // Respuesta idéntica exista o no coincidencia — no filtra el email registrado.
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * POST /api/public/client-portal/:slug/live/verify-code
 * Body: { email, code }. Devuelve { token } (JWT de propósito acotado) si es válido.
 */
async function verifyLoginCode(req, res, next) {
  try {
    const portal = await prisma.projectClientPortal.findUnique({ where: { slug: req.params.slug } })
    if (!portal || !portal.active) return res.status(404).json({ error: 'Portal no encontrado' })

    const email = String(req.body?.email || '').trim().toLowerCase()
    const code = String(req.body?.code || '').trim()
    if (!email || !code) return res.status(400).json({ error: 'Email y código son requeridos.' })

    const login = await prisma.clientPortalLoginCode.findFirst({
      where: { portalId: portal.id, email, code, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    if (!login) return res.status(401).json({ error: 'Código inválido o vencido.' })

    await prisma.clientPortalLoginCode.update({ where: { id: login.id }, data: { used: true } })

    const token = jwt.sign(
      { portalId: portal.id, projectId: portal.projectId, workspaceId: portal.workspaceId, purpose: 'client-portal-live' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' },
    )
    res.json({ token })
  } catch (err) { next(err) }
}

// ─── Datos en vivo (requiere clientPortalAuth) ────────────────────────────────

async function computeLiveData(portal) {
  const month = currentMonthStr()
  const today = todayString()
  const periodStart = new Date(`${month}-01T00:00:00.000Z`)
  const periodEnd   = new Date(`${today}T00:00:00.000Z`)
  const liveSections = safeParseArr(portal.liveSections)

  // cachedAnalysis con `resumen` truthy: aggregateReportData salta la llamada a Claude
  // (ver monthlyReport.service.js — validCachedAnalysis = cachedAnalysis?.resumen ? ... : null)
  const data = await aggregateReportData(
    portal.projectId, portal.workspaceId, month,
    { resumen: '—' }, {}, null, liveSections,
    { periodStart, periodEnd },
  )
  delete data._analysisIsNew
  delete data._dataCacheIsNew
  delete data.analysis
  delete data.analysisError
  return data
}

/**
 * GET /api/public/client-portal/:slug/live
 * Devuelve el cache actual; si nunca se generó, dispara un primer fetch síncrono.
 */
async function getLiveData(req, res, next) {
  try {
    const portal = req.clientPortal
    if (!portal.liveDataCachedAt) {
      const data = await computeLiveData(portal)
      const updated = await prisma.projectClientPortal.update({
        where: { id: portal.id },
        data:  { liveDataCache: JSON.stringify(data), liveDataCachedAt: new Date() },
      })
      return res.json({ data, cachedAt: updated.liveDataCachedAt })
    }
    res.json({ data: JSON.parse(portal.liveDataCache), cachedAt: portal.liveDataCachedAt })
  } catch (err) { next(err) }
}

/**
 * POST /api/public/client-portal/:slug/live/refresh
 * Cooldown de 15 min. Recalcula y cachea.
 */
async function refreshLiveData(req, res, next) {
  try {
    const portal = req.clientPortal
    if (portal.liveDataCachedAt) {
      const elapsed = Date.now() - new Date(portal.liveDataCachedAt).getTime()
      if (elapsed < LIVE_REFRESH_COOLDOWN_MS) {
        const waitMins = Math.ceil((LIVE_REFRESH_COOLDOWN_MS - elapsed) / 60000)
        return res.status(429).json({ error: 'Esperá un poco antes de actualizar de nuevo.', waitMins })
      }
    }
    const data = await computeLiveData(portal)
    const updated = await prisma.projectClientPortal.update({
      where: { id: portal.id },
      data:  { liveDataCache: JSON.stringify(data), liveDataCachedAt: new Date() },
    })
    res.json({ data, cachedAt: updated.liveDataCachedAt })
  } catch (err) { next(err) }
}

module.exports = {
  getClientPortal,
  saveClientPortal,
  deleteClientPortal,
  getPortalPublic,
  requestLoginCode,
  verifyLoginCode,
  getLiveData,
  refreshLiveData,
}
