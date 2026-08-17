const jwt = require('jsonwebtoken')
const prisma = require('../lib/prisma')
const { aggregateReportData } = require('../services/monthlyReport.service')
const { computeObjectives } = require('../services/marketingObjectives.service')
const { sendClientLoginCodeEmail, sendPortalFirstLoginEmail } = require('../services/email.service')
const { todayString } = require('../utils/dates')
const {
  sanitizeSections,
  currentMonthStr,
  GENERATED_WHERE,
  buildPublicReportPayload,
} = require('./monthlyReport.controller')
const { canWrite } = require('../lib/projectAccess')
const { isFlagEnabledForWorkspace } = require('../lib/featureFlags')
const { PORTAL_VISIBLE_STATUSES } = require('../lib/contentCatalog')
const { emitTo } = require('../lib/socket')
const { getProjectNotifyRecipients } = require('../lib/projectRecipients')

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
    showMeetings:   portal.showMeetings,
    showTeam:       portal.showTeam,
    showObjectives: portal.showObjectives,
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

// Limpia el `resumen` de un análisis de informe para mostrarlo como snippet en
// "Inicio": puede venir en texto plano con saltos de línea (\n\n, generado por
// la IA) o como HTML (si el admin lo editó a mano con el WYSIWYG) — mismo
// criterio de "sacar tags" que ya usa ReportViewer.jsx#handleCreateTaskFromStep.
const RESUMEN_SNIPPET_LEN = 180
function resumenSnippet(analysisJson) {
  if (!analysisJson) return null
  let parsed
  try { parsed = JSON.parse(analysisJson) } catch { return null }
  const raw = parsed?.resumen
  if (!raw || typeof raw !== 'string') return null
  const clean = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!clean) return null
  return clean.length > RESUMEN_SNIPPET_LEN ? `${clean.slice(0, RESUMEN_SNIPPET_LEN).trim()}…` : clean
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

    const { slug, active, contentEnabled, showMeetings, showTeam, showObjectives, liveSections, clientEmail, clientName } = req.body || {}

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
      showMeetings:   showMeetings === true,
      showTeam:       showTeam === true,
      showObjectives: showObjectives === true,
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

// ─── Público: pantalla de marca previa al login (sin auth) ────────────────────

/**
 * GET /api/public/client-portal/:slug/branding
 * Público, sin auth. SOLO nombre de proyecto + branding del workspace — lo
 * justo para pintar la pantalla de login antes de autenticarse. Nunca
 * reports/briefs/hasContent/pendingApprovalCount: eso exige login (getPortalData) —
 * todo el resto del portal queda detrás del login OTP, no solo "Datos en vivo"/"Contenido".
 */
async function getPortalBranding(req, res, next) {
  try {
    const portal = await prisma.projectClientPortal.findUnique({ where: { slug: req.params.slug } })
    if (!portal || !portal.active) return res.status(404).json({ error: 'Portal no encontrado' })

    const [project, workspace] = await Promise.all([
      prisma.project.findUnique({ where: { id: portal.projectId }, select: { id: true, name: true } }),
      prisma.workspace.findUnique({
        where:  { id: portal.workspaceId },
        select: { slug: true, name: true, companyName: true, logoData: true, brandColors: true },
      }),
    ])

    res.json({
      project: project ? { name: project.name } : null,
      workspace: workspace ? {
        slug:        workspace.slug,
        name:        workspace.name,
        companyName: workspace.companyName,
        hasLogo:     !!workspace.logoData,
        brandColors: workspace.brandColors ? JSON.parse(workspace.brandColors) : [],
      } : null,
    })
  } catch (err) { next(err) }
}

// ─── Datos del portal (requiere clientPortalAuth) ─────────────────────────────

/**
 * GET /api/public/client-portal/:slug
 * Meta del proyecto/workspace + informes publicados + briefs. Requiere el JWT
 * de propósito acotado del login OTP — ya NO es público (ver getPortalBranding
 * para lo mínimo que sí puede verse antes de loguearse).
 */
async function getPortalData(req, res, next) {
  try {
    const portal = req.clientPortal

    const [project, workspace, reportRows, latestReport, briefRows, contentFlag, nextMeeting, allMeetings] = await Promise.all([
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
      // Aparte del listado liviano de arriba (sin analysis): solo para el
      // snippet de "Inicio", el informe más reciente con su análisis.
      prisma.monthlyReport.findFirst({
        where:   { projectId: portal.projectId, workspaceId: portal.workspaceId, status: 'published', ...GENERATED_WHERE },
        orderBy: { month: 'desc' },
        select:  { token: true, month: true, analysis: true },
      }),
      prisma.projectBrief.findMany({
        where:   { projectId: portal.projectId, workspaceId: portal.workspaceId },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.featureFlag.findUnique({ where: { key: 'contenido' } }),
      // Próxima reunión con el cliente para "Inicio" — solo si el admin prendió
      // el opt-in showMeetings. `gt` (no `gte`): las reuniones se suelen cargar
      // el mismo día que se tienen (o después), así que "hoy" ya cuenta como
      // sucedida — solo lo estrictamente posterior a hoy es "próxima" de verdad.
      portal.showMeetings
        ? prisma.projectMeeting.findFirst({
            where:   { projectId: portal.projectId, workspaceId: portal.workspaceId, type: 'client', date: { gt: todayString() } },
            orderBy: { date: 'asc' },
            select:  { date: true, title: true },
          })
        : Promise.resolve(null),
      // Historial completo (pasadas + futuras) para la pestaña "Tu equipo",
      // con notas — a diferencia de nextMeeting, acá sí se muestran: son
      // reuniones type:'client' (el cliente ya estuvo presente), y el cliente
      // pidió poder ver qué se anotó.
      portal.showMeetings
        ? prisma.projectMeeting.findMany({
            where:   { projectId: portal.projectId, workspaceId: portal.workspaceId, type: 'client' },
            orderBy: { date: 'desc' },
            select:  { date: true, title: true, notes: true },
          })
        : Promise.resolve([]),
    ])

    // hasContent/pendingApprovalCount: nunca títulos ni imágenes acá (solo
    // booleano + conteo, el detalle vive en /content). Requiere el flag
    // `contenido` grant (SuperAdmin) sin opt-out del workspace, ADEMÁS de
    // contentEnabled del portal (mismo criterio que assertContentAccess en
    // contentPortal.controller.js).
    let hasContent = false
    let pendingApprovalCount = 0
    let pendingPreview = []
    if (portal.contentEnabled && workspace) {
      const disabledKeys = JSON.parse(workspace.disabledFeatureKeys || '[]')
      if (isFlagEnabledForWorkspace(contentFlag, portal.workspaceId, disabledKeys)) {
        const [visibleCount, pendingCount] = await Promise.all([
          prisma.contentPiece.count({ where: { projectId: portal.projectId, workspaceId: portal.workspaceId, status: { in: PORTAL_VISIBLE_STATUSES } } }),
          prisma.contentPiece.count({ where: { projectId: portal.projectId, workspaceId: portal.workspaceId, status: 'aprobacion' } }),
        ])
        hasContent = visibleCount > 0
        pendingApprovalCount = pendingCount
        if (pendingCount > 0) {
          const previewRows = await prisma.contentPiece.findMany({
            where:   { projectId: portal.projectId, workspaceId: portal.workspaceId, status: 'aprobacion' },
            select:  { id: true, title: true },
            orderBy: { updatedAt: 'desc' },
            take:    2,
          })
          pendingPreview = previewRows
        }
      }
    }

    // Equipo del proyecto para "Tu equipo" — solo foto/nombre/rol, nunca
    // email/teléfono. Se resuelve server-side (el label del teamRole sale de
    // UserRole) porque el hook useRoles del front pega a /api/roles, que
    // requiere auth de equipo y no está disponible en el portal. Filtra
    // automáticamente a integrantes desactivados del workspace.
    let team = []
    if (portal.showTeam) {
      const projectMembers = await prisma.projectMember.findMany({
        where:   { projectId: portal.projectId },
        select:  { userId: true, user: { select: { id: true, name: true, avatar: true } } },
        orderBy: { user: { name: 'asc' } },
      })
      if (projectMembers.length > 0) {
        const userIds = projectMembers.map(pm => pm.userId)
        const [activeMembers, roles] = await Promise.all([
          prisma.workspaceMember.findMany({
            where:  { workspaceId: portal.workspaceId, userId: { in: userIds }, active: true },
            select: { userId: true, teamRole: true },
          }),
          prisma.userRole.findMany({ where: { workspaceId: portal.workspaceId }, select: { name: true, label: true } }),
        ])
        const teamRoleByUserId = new Map(activeMembers.map(m => [m.userId, m.teamRole]))
        const labelByName = new Map(roles.map(r => [r.name, r.label]))
        team = projectMembers
          .filter(pm => teamRoleByUserId.has(pm.userId))
          .map(pm => ({
            id:        pm.user.id,
            name:      pm.user.name,
            avatar:    pm.user.avatar,
            roleLabel: labelByName.get(teamRoleByUserId.get(pm.userId)) || null,
          }))
      }
    }

    // Cumplimiento de objetivos en vivo para "Inicio" — computeObjectives ya
    // devuelve [] de entrada si el proyecto no tiene MarketingObjective
    // cargados, así que no hace falta un chequeo previo aparte.
    let objectivesResults = []
    if (portal.showObjectives) {
      objectivesResults = await computeObjectives({
        projectId: portal.projectId, workspaceId: portal.workspaceId, dataMonth: currentMonthStr(),
      })
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
      pendingPreview,
      latestReportSummary: latestReport ? { token: latestReport.token, month: latestReport.month, resumen: resumenSnippet(latestReport.analysis) } : null,
      nextMeeting: nextMeeting ? { date: nextMeeting.date, title: nextMeeting.title } : null,
      meetings: allMeetings.map(m => ({ date: m.date, title: m.title, notes: m.notes || null })),
      today: todayString(),
      showTeam: portal.showTeam,
      team,
      showObjectives: portal.showObjectives,
      objectives: objectivesResults,
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/public/client-portal/:slug/reports/:token
 * Sirve un informe DENTRO del portal — mismo payload que el link público
 * individual (GET /api/public/report/:token, que sigue público a propósito
 * para los links compartidos sueltos de un informe), pero exige el JWT del
 * portal y valida que el informe pertenezca al MISMO proyecto/workspace que
 * req.clientPortal — así un token de informe no alcanza por sí solo (ni de
 * este portal ni de otro) para ver nada sin haber pasado el login OTP.
 */
async function getPortalReport(req, res, next) {
  try {
    const portal = req.clientPortal
    const report = await prisma.monthlyReport.findUnique({ where: { token: req.params.token } })
    if (!report || report.projectId !== portal.projectId || report.workspaceId !== portal.workspaceId) {
      return res.status(404).json({ error: 'Informe no encontrado' })
    }
    if (report.status !== 'published') {
      return res.status(404).json({ error: 'Este informe todavía no está publicado.', code: 'REPORT_DRAFT' })
    }

    res.json(await buildPublicReportPayload(report))
  } catch (err) { next(err) }
}

/**
 * Avisa al equipo (notificación in-app + email) la primera vez que un
 * contacto hace login exitoso en el portal — les da visibilidad de que el
 * cliente arrancó a usarlo, sin el ruido de un aviso por cada sesión. Fire-
 * and-forget total (setImmediate + try/catch mudo, mismo patrón que
 * notifyTeamOfDecision en contentPortal.controller.js): el login ya se
 * respondió, un aviso caído no debe romper nada.
 */
async function notifyFirstPortalLogin(portal, contact) {
  try {
    const { userIds, emails } = await getProjectNotifyRecipients(portal.projectId, portal.workspaceId)
    const who = (contact.name && contact.name.trim()) ? contact.name.trim() : contact.email
    const message = `${who} (cliente) entró al portal por primera vez`

    if (userIds.length > 0) {
      await prisma.notification.createMany({
        data: userIds.map(userId => ({
          userId, actorId: null, workspaceId: portal.workspaceId, projectId: portal.projectId,
          type: 'PORTAL_CLIENT_LOGIN', message,
        })),
      })
      for (const userId of userIds) {
        emitTo(`user:${userId}`, 'notification:new', { type: 'PORTAL_CLIENT_LOGIN' })
      }
    }

    if (emails.length > 0) {
      const [project, workspace] = await Promise.all([
        prisma.project.findUnique({ where: { id: portal.projectId }, select: { name: true } }),
        prisma.workspace.findUnique({ where: { id: portal.workspaceId }, select: { slug: true } }),
      ])
      const domain = process.env.APP_DOMAIN || 'blisstracker.app'
      const projectUrl = workspace ? `https://${workspace.slug}.${domain}/my-projects/${portal.projectId}` : null
      await sendPortalFirstLoginEmail(emails, {
        projectName: project?.name || 'Proyecto', contactName: contact.name, contactEmail: contact.email, projectUrl,
      }, portal.workspaceId)
    }
  } catch {
    // best-effort — nunca debe tumbar el login ya emitido.
  }
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
      const contactBefore = await prisma.clientPortalContact.findUnique({
        where: { id: login.contactId }, select: { lastLoginAt: true, name: true, email: true },
      })
      await prisma.clientPortalContact.update({ where: { id: login.contactId }, data: { lastLoginAt: new Date() } })
      if (contactBefore && !contactBefore.lastLoginAt) {
        setImmediate(() => notifyFirstPortalLogin(portal, contactBefore))
      }
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
  getPortalBranding,
  getPortalData,
  getPortalReport,
  requestLoginCode,
  verifyLoginCode,
  getLiveData,
  refreshLiveData,
}
