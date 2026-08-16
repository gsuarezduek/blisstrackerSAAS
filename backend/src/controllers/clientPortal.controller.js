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
const { canWrite } = require('../lib/projectAccess')
const { isFlagEnabledForWorkspace } = require('../lib/featureFlags')
const { PORTAL_VISIBLE_STATUSES } = require('../lib/contentCatalog')

const SLUG_RE = /^[a-z0-9-]{3,40}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_TTL_MS = 10 * 60 * 1000
const OTP_RATE_LIMIT = 5
const OTP_RATE_WINDOW_MS = 60 * 60 * 1000

// Límite de intentos fallidos de verificación por (portalId, email), en memoria
// (best-effort, mismo patrón que los cooldowns de scraping) — evita fuerza bruta
// sobre el código de 6 dígitos dentro de su ventana de validez.
const verifyAttemptsMap = new Map() // `${portalId}:${email}` → { count, windowStart }
const VERIFY_MAX_ATTEMPTS = 8
const VERIFY_WINDOW_MS = OTP_TTL_MS
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

// `contacts` es opcional: cuando viene (getClientPortal, saveClientPortal) es
// porque el caller ya los incluyó en el query; contactCount sale de ahí sin
// una query aparte.
function shapePortal(portal, workspaceSlug) {
  return {
    slug:           portal.slug,
    active:         portal.active,
    contentEnabled: portal.contentEnabled,
    liveSections:   JSON.parse(portal.liveSections || '[]'),
    contactCount:   portal.contacts?.length ?? 0,
    publicUrl:      `https://${workspaceSlug}.${process.env.APP_DOMAIN || 'blisstracker.app'}/report/${portal.slug}`,
    updatedAt:      portal.updatedAt,
  }
}

function shapeContact(c) {
  return {
    id:          c.id,
    email:       c.email,
    name:        c.name,
    canApprove:  c.canApprove,
    active:      c.active,
    lastLoginAt: c.lastLoginAt,
  }
}

function validEmail(e) {
  return typeof e === 'string' && EMAIL_RE.test(e.trim())
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

    const portal = await prisma.projectClientPortal.findUnique({
      where:   { projectId },
      include: { contacts: { orderBy: { createdAt: 'asc' } } },
    })
    if (!portal) return res.json({ portal: null })

    res.json({ portal: { ...shapePortal(portal, req.workspace.slug), contacts: portal.contacts.map(shapeContact) } })
  } catch (err) { next(err) }
}

/**
 * PUT /api/projects/:id/client-portal
 * Body: { slug, active, contentEnabled, liveSections }. Upsert. Los contactos
 * se administran aparte (endpoints .../contacts) — no viajan acá.
 */
async function saveClientPortal(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) {
      return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

    const { slug, active, contentEnabled, liveSections, clientEmail, clientName } = req.body || {}

    if (!slug || !SLUG_RE.test(slug)) {
      return res.status(400).json({ error: 'El slug debe tener 3-40 caracteres: minúsculas, números y guiones.' })
    }
    const existing = await prisma.projectClientPortal.findUnique({ where: { slug } })
    if (existing && existing.projectId !== projectId) {
      return res.status(409).json({ error: 'Ese slug ya está en uso. Probá con otro.' })
    }

    const cleanSections = sanitizeSections(liveSections) ?? []

    const data = {
      slug,
      active:         active !== false,
      contentEnabled: contentEnabled === true,
      liveSections:   JSON.stringify(cleanSections),
    }

    const portal = await prisma.projectClientPortal.upsert({
      where:  { projectId },
      update: data,
      create: { ...data, projectId, workspaceId },
    })

    // Compat: un bundle viejo del frontend puede seguir mandando clientEmail —
    // en vez de perder el dato lo upserteamos como contacto (ProjectClientPortal.clientEmail
    // quedó legacy, ya no se escribe).
    if (validEmail(clientEmail)) {
      const email = clientEmail.trim().toLowerCase()
      await prisma.clientPortalContact.upsert({
        where:  { portalId_email: { portalId: portal.id, email } },
        update: {},
        create: { portalId: portal.id, workspaceId, email, name: clientName ? String(clientName).trim() : null },
      })
    }

    const fresh = await prisma.projectClientPortal.findUnique({
      where:   { id: portal.id },
      include: { contacts: { orderBy: { createdAt: 'asc' } } },
    })
    res.json({ portal: { ...shapePortal(fresh, req.workspace.slug), contacts: fresh.contacts.map(shapeContact) } })
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

// ─── Admin: contactos autorizados del portal ──────────────────────────────────
// ABM independiente del PUT del portal — cada alta/baja pega directo, sin
// depender de que el admin apriete "Guardar" en el resto del formulario.

async function findPortalOr404(projectId, res) {
  const portal = await prisma.projectClientPortal.findUnique({ where: { projectId } })
  if (!portal) res.status(404).json({ error: 'Configurá el portal antes de gestionar contactos' })
  return portal
}

/** GET /api/projects/:id/client-portal/contacts */
async function listContacts(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const portal = await findPortalOr404(projectId, res)
    if (!portal) return

    const contacts = await prisma.clientPortalContact.findMany({ where: { portalId: portal.id }, orderBy: { createdAt: 'asc' } })
    res.json({ contacts: contacts.map(shapeContact) })
  } catch (err) { next(err) }
}

/** POST /api/projects/:id/client-portal/contacts — { email, name?, canApprove? } */
async function createContact(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const portal = await findPortalOr404(projectId, res)
    if (!portal) return

    const { email, name, canApprove } = req.body || {}
    if (!validEmail(email)) return res.status(400).json({ error: 'Email inválido.' })

    try {
      const contact = await prisma.clientPortalContact.create({
        data: {
          portalId: portal.id,
          workspaceId,
          email:      email.trim().toLowerCase(),
          name:       name ? String(name).trim() : null,
          canApprove: canApprove !== false,
        },
      })
      res.status(201).json(shapeContact(contact))
    } catch (e) {
      if (e.code === 'P2002') return res.status(409).json({ error: 'Ese email ya está en la lista.' })
      throw e
    }
  } catch (err) { next(err) }
}

/** PATCH /api/projects/:id/client-portal/contacts/:cid — { name?, canApprove?, active? } */
async function updateContact(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const portal = await findPortalOr404(projectId, res)
    if (!portal) return

    const contact = await prisma.clientPortalContact.findFirst({ where: { id: Number(req.params.cid), portalId: portal.id } })
    if (!contact) return res.status(404).json({ error: 'Contacto no encontrado' })

    const { name, canApprove, active } = req.body || {}
    const data = {}
    if (name       !== undefined) data.name       = name ? String(name).trim() : null
    if (canApprove !== undefined) data.canApprove = canApprove !== false
    if (active     !== undefined) data.active     = active !== false

    const updated = await prisma.clientPortalContact.update({ where: { id: contact.id }, data })
    res.json(shapeContact(updated))
  } catch (err) { next(err) }
}

/** DELETE /api/projects/:id/client-portal/contacts/:cid */
async function deleteContact(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const portal = await findPortalOr404(projectId, res)
    if (!portal) return

    await prisma.clientPortalContact.deleteMany({ where: { id: Number(req.params.cid), portalId: portal.id } })
    res.json({ deleted: true })
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

    const [project, workspace, reportRows, briefRows, contentFlag] = await Promise.all([
      prisma.project.findUnique({ where: { id: portal.projectId }, select: { id: true, name: true } }),
      prisma.workspace.findUnique({
        where:  { id: portal.workspaceId },
        select: { slug: true, name: true, companyName: true, companyDescription: true, industry: true, companyWebsite: true, logoData: true, brandColors: true, brandFonts: true, disabledFeatureKeys: true },
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
      prisma.featureFlag.findUnique({ where: { key: 'contenido' } }),
    ])

    // hasContent/pendingApprovalCount: nunca títulos ni imágenes acá (endpoint
    // sin login) — solo booleano + conteo. Requiere el flag `contenido` grant
    // (SuperAdmin) sin opt-out del workspace, ADEMÁS de contentEnabled del portal
    // (mismo criterio que assertContentAccess en contentPortal.controller.js).
    let hasContent = false
    let pendingApprovalCount = 0
    if (portal.contentEnabled && workspace) {
      const disabledKeys = JSON.parse(workspace.disabledFeatureKeys || '[]')
      if (isFlagEnabledForWorkspace(contentFlag, portal.workspaceId, disabledKeys)) {
        const [visibleCount, pendingCount] = await Promise.all([
          prisma.contentPiece.count({ where: { projectId: portal.projectId, workspaceId: portal.workspaceId, status: { in: PORTAL_VISIBLE_STATUSES } } }),
          prisma.contentPiece.count({ where: { projectId: portal.projectId, workspaceId: portal.workspaceId, status: 'aprobacion' } }),
        ])
        hasContent = visibleCount > 0
        pendingApprovalCount = pendingCount
      }
    }

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
      hasContent,
      pendingApprovalCount,
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/public/client-portal/:slug/live/request-code
 * Body: { email }. Genera y envía un código OTP de 6 dígitos si el email
 * matchea a un contacto ACTIVO del portal. Respuesta genérica siempre (no
 * confirma si el email está en la lista).
 */
async function requestLoginCode(req, res, next) {
  try {
    const portal = await prisma.projectClientPortal.findUnique({ where: { slug: req.params.slug } })
    if (!portal || !portal.active) return res.status(404).json({ error: 'Portal no encontrado' })

    const email = String(req.body?.email || '').trim().toLowerCase()
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email inválido.' })
    }

    const contact = await prisma.clientPortalContact.findUnique({
      where: { portalId_email: { portalId: portal.id, email } },
    })

    if (contact && contact.active) {
      // Rate limit por (portal, email) — no por portal: con varios contactos, un
      // límite compartido se agotaría con un solo login de cada uno.
      const recentCount = await prisma.clientPortalLoginCode.count({
        where: { portalId: portal.id, email, createdAt: { gt: new Date(Date.now() - OTP_RATE_WINDOW_MS) } },
      })
      if (recentCount >= OTP_RATE_LIMIT) {
        return res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en un rato.' })
      }

      const code = String(Math.floor(100000 + Math.random() * 900000))
      const expiresAt = new Date(Date.now() + OTP_TTL_MS)
      await prisma.clientPortalLoginCode.create({ data: { portalId: portal.id, contactId: contact.id, email, code, expiresAt } })

      const project = await prisma.project.findUnique({ where: { id: portal.projectId }, select: { name: true } })
      await sendClientLoginCodeEmail(email, project?.name || 'tu proyecto', code, portal.workspaceId)
    }

    // Respuesta idéntica exista o no coincidencia — no filtra quién está en la lista.
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * POST /api/public/client-portal/:slug/live/verify-code
 * Body: { email, code }. Devuelve { token } (JWT de propósito acotado, con
 * contactId si el email matcheaba un contacto) si es válido.
 */
async function verifyLoginCode(req, res, next) {
  try {
    const portal = await prisma.projectClientPortal.findUnique({ where: { slug: req.params.slug } })
    if (!portal || !portal.active) return res.status(404).json({ error: 'Portal no encontrado' })

    const email = String(req.body?.email || '').trim().toLowerCase()
    const code = String(req.body?.code || '').trim()
    if (!email || !code) return res.status(400).json({ error: 'Email y código son requeridos.' })

    const attemptKey = `${portal.id}:${email}`
    const now = Date.now()
    let attempts = verifyAttemptsMap.get(attemptKey)
    if (!attempts || now - attempts.windowStart >= VERIFY_WINDOW_MS) {
      attempts = { count: 0, windowStart: now }
    }
    if (attempts.count >= VERIFY_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Demasiados intentos. Pedí un código nuevo en unos minutos.' })
    }

    const login = await prisma.clientPortalLoginCode.findFirst({
      where: { portalId: portal.id, email, code, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    if (!login) {
      attempts.count += 1
      verifyAttemptsMap.set(attemptKey, attempts)
      return res.status(401).json({ error: 'Código inválido o vencido.' })
    }
    verifyAttemptsMap.delete(attemptKey)

    await prisma.clientPortalLoginCode.update({ where: { id: login.id }, data: { used: true } })
    if (login.contactId) {
      await prisma.clientPortalContact.update({ where: { id: login.contactId }, data: { lastLoginAt: new Date() } })
    }

    const token = jwt.sign(
      { portalId: portal.id, projectId: portal.projectId, workspaceId: portal.workspaceId, contactId: login.contactId ?? null, purpose: 'client-portal-live' },
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
 * No exige identidad de contacto: los tokens pre-migración (sin contactId)
 * siguen viendo esto igual — solo las acciones que necesitan "quién sos"
 * (aprobar/comentar, F7) exigen req.clientPortalContact.
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
  listContacts,
  createContact,
  updateContact,
  deleteContact,
  getPortalPublic,
  requestLoginCode,
  verifyLoginCode,
  getLiveData,
  refreshLiveData,
}
