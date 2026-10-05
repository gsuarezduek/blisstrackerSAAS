const prisma = require('../../lib/prisma')
const jwt = require('jsonwebtoken')
const { getSettings } = require('../../lib/platformSettings')

/**
 * GET /api/superadmin/workspaces
 * Lista todos los workspaces con stats básicas.
 */
async function listWorkspaces(req, res, next) {
  try {
    const { startOfCurrentMonth } = require('../../lib/tokenBudget')
    const { computeAllWorkspacesStorageUsage } = require('../../services/workspaceStorage.service')
    const monthStart = startOfCurrentMonth()

    const [workspaces, tokenUsageRaw, storageUsageRaw] = await Promise.all([
      prisma.workspace.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              members: { where: { active: true } },
              projects: { where: { active: true } },
            },
          },
          subscription: { select: { status: true, planName: true, periodEnd: true } },
        },
      }),
      prisma.aiTokenLog.groupBy({
        by:      ['workspaceId'],
        where:   { createdAt: { gte: monthStart } },
        _sum:    { inputTokens: true, outputTokens: true },
      }),
      computeAllWorkspacesStorageUsage(),
    ])

    // Mapear consumo mensual por workspaceId
    const tokenByWs = {}
    for (const r of tokenUsageRaw) {
      if (r.workspaceId) {
        tokenByWs[r.workspaceId] = (r._sum.inputTokens ?? 0) + (r._sum.outputTokens ?? 0)
      }
    }
    const storageByWs = {}
    for (const r of storageUsageRaw) {
      storageByWs[r.workspaceId] = r.total
    }

    res.json(workspaces.map(w => ({
      id:                w.id,
      name:              w.name,
      slug:              w.slug,
      status:            w.status,
      timezone:          w.timezone,
      trialEndsAt:       w.trialEndsAt,
      createdAt:         w.createdAt,
      memberCount:       w._count.members,
      projectCount:      w._count.projects,
      subscription:      w.subscription,
      monthlyTokenLimit: w.monthlyTokenLimit,
      monthlyTokenUsed:  tokenByWs[w.id] ?? 0,
      storageLimitMb:    w.storageLimitMb,
      storageUsedBytes:  storageByWs[w.id] ?? 0,
    })))
  } catch (err) { next(err) }
}

/**
 * GET /api/superadmin/workspaces/:id
 * Detalle de un workspace: miembros, proyectos, uso de AI.
 */
async function getWorkspace(req, res, next) {
  try {
    const id = Number(req.params.id)

    const { startOfCurrentMonth } = require('../../lib/tokenBudget')
    const { computeWorkspaceStorageUsage } = require('../../services/workspaceStorage.service')

    const [workspace, members, projects, tokenStats, monthlyUsageAgg, storageUsage, storageQuotaDefaults] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id },
        include: { subscription: true },
      }),
      prisma.workspaceMember.findMany({
        where: { workspaceId: id },
        include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
        orderBy: { joinedAt: 'asc' },
      }),
      prisma.project.findMany({
        where: { workspaceId: id },
        select: { id: true, name: true, active: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.aiTokenLog.groupBy({
        by:    ['service'],
        where: { workspaceId: id },
        _sum:  { inputTokens: true, outputTokens: true },
      }),
      prisma.aiTokenLog.aggregate({
        where: { workspaceId: id, createdAt: { gte: startOfCurrentMonth() } },
        _sum:  { inputTokens: true, outputTokens: true },
      }),
      computeWorkspaceStorageUsage(id),
      getSettings(['projectFilesMaxMbPerWorkspace', 'contentStorageMaxMbPerWorkspace', 'chatAttachmentMaxMbPerWorkspace']),
    ])

    if (!workspace) return res.status(404).json({ error: 'Workspace no encontrado' })

    const monthlyTokenUsed = (monthlyUsageAgg._sum.inputTokens ?? 0) + (monthlyUsageAgg._sum.outputTokens ?? 0)

    res.json({
      ...workspace,
      members: members.map(m => ({
        ...m.user,
        role: m.role,
        teamRole: m.teamRole,
        active: m.active,
        joinedAt: m.joinedAt,
      })),
      projects,
      tokenStats,
      monthlyTokenUsed,
      storageUsedBytes: storageUsage.total,
      storageBreakdown: storageUsage,
      // Defaults globales (PlatformSetting) de cada cuota que SÍ bloquea subidas —
      // el front los muestra como placeholder cuando el workspace no tiene override.
      storageQuotaDefaults: {
        projectFilesMaxMb:   storageQuotaDefaults.projectFilesMaxMbPerWorkspace,
        contentStorageMaxMb: storageQuotaDefaults.contentStorageMaxMbPerWorkspace,
        chatAttachmentMaxMb: storageQuotaDefaults.chatAttachmentMaxMbPerWorkspace,
      },
    })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/workspaces/:id/token-limit
 * Actualiza el límite mensual de tokens del workspace.
 * Body: { monthlyTokenLimit: number }
 */
async function updateTokenLimit(req, res, next) {
  try {
    const id    = Number(req.params.id)
    const limit = Number(req.body.monthlyTokenLimit)
    if (!Number.isInteger(limit) || limit < 0) {
      return res.status(400).json({ error: 'monthlyTokenLimit debe ser un entero ≥ 0 (0 = ilimitado)' })
    }
    const workspace = await prisma.workspace.update({
      where: { id },
      data:  { monthlyTokenLimit: limit },
      select: { id: true, name: true, monthlyTokenLimit: true },
    })
    res.json(workspace)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/workspaces/:id/storage-limit
 * Actualiza el límite de almacenamiento (MB) del workspace. Es un límite
 * informativo/de alerta (ver storageBudget.js) — NO bloquea subidas, eso lo
 * siguen haciendo contentStorageMaxMbPerWorkspace/projectFilesMaxMbPerWorkspace.
 * Body: { storageLimitMb: number }
 */
async function updateStorageLimit(req, res, next) {
  try {
    const id    = Number(req.params.id)
    const limit = Number(req.body.storageLimitMb)
    if (!Number.isInteger(limit) || limit < 0) {
      return res.status(400).json({ error: 'storageLimitMb debe ser un entero ≥ 0 (0 = ilimitado)' })
    }
    const workspace = await prisma.workspace.update({
      where: { id },
      data:  { storageLimitMb: limit },
      select: { id: true, name: true, storageLimitMb: true },
    })
    res.json(workspace)
  } catch (err) { next(err) }
}

// body key → columna de Workspace, para updateStorageQuotas de abajo.
const STORAGE_QUOTA_FIELDS = {
  projectFilesMaxMb:   'projectFilesMaxMbOverride',
  contentStorageMaxMb: 'contentStorageMaxMbOverride',
  chatAttachmentMaxMb: 'chatAttachmentMaxMbOverride',
}

/**
 * PATCH /api/superadmin/workspaces/:id/storage-quotas
 * Override puntual por workspace de las cuotas que SÍ bloquean subidas
 * (Archivos/Contenido/Chat — a diferencia de storageLimitMb, que es solo
 * informativo). Body: { projectFilesMaxMb?, contentStorageMaxMb?, chatAttachmentMaxMb? }
 * — cada campo presente admite `null` (vuelve a usar el default global de
 * PlatformSetting) o un entero ≥ 0 (0 = ilimitado para ESTE workspace). Solo
 * se tocan los campos presentes en el body.
 */
async function updateStorageQuotas(req, res, next) {
  try {
    const id = Number(req.params.id)
    const data = {}
    for (const [bodyKey, column] of Object.entries(STORAGE_QUOTA_FIELDS)) {
      if (!(bodyKey in req.body)) continue
      const raw = req.body[bodyKey]
      if (raw === null) { data[column] = null; continue }
      const n = Number(raw)
      if (!Number.isInteger(n) || n < 0) {
        return res.status(400).json({ error: `${bodyKey} debe ser un entero ≥ 0, o null para usar el default global` })
      }
      data[column] = n
    }
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Nada para actualizar' })

    const workspace = await prisma.workspace.update({
      where: { id },
      data,
      select: {
        id: true, name: true,
        projectFilesMaxMbOverride: true,
        contentStorageMaxMbOverride: true,
        chatAttachmentMaxMbOverride: true,
      },
    })
    res.json(workspace)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/workspaces/:id/status
 * Cambiar el status de un workspace.
 * Body: { status: "active" | "trialing" | "suspended" | "cancelled" }
 */
async function updateWorkspaceStatus(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { status } = req.body
    const VALID = ['trialing', 'active', 'past_due', 'suspended', 'cancelled']
    if (!VALID.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Valores permitidos: ${VALID.join(', ')}` })
    }

    // Volver a "trialing" un workspace con una suscripción de Stripe viva es peligroso:
    // el cron diario de trials vencidos lo pasaría a past_due (trialEndsAt ya quedó
    // en el pasado desde que se convirtió a pago), cortando el acceso a un cliente pagando.
    if (status === 'trialing') {
      const sub = await prisma.subscription.findUnique({ where: { workspaceId: id }, select: { stripeSubId: true } })
      if (sub?.stripeSubId) {
        return res.status(409).json({ error: 'Este workspace tiene una suscripción de Stripe activa — no se puede volver a "trialing".' })
      }
    }

    const workspace = await prisma.workspace.update({
      where: { id },
      data: { status },
    })
    res.json({ id: workspace.id, status: workspace.status })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/workspaces/:id/billing-exempt
 * Marcar/desmarcar un workspace como exento de billing.
 * Body: { billingExempt: boolean }
 *
 * Un workspace exento nunca es tocado por el cron de reconciliación de tiers
 * (billingTier.service) — queda fuera del ciclo trial→past_due de forma
 * permanente. Al activar la exención forzamos status='active' para que el
 * cambio tenga efecto inmediato (si no, un workspace en past_due quedaría
 * exento pero seguiría mostrándose como vencido).
 */
async function updateWorkspaceBillingExempt(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { billingExempt } = req.body
    if (typeof billingExempt !== 'boolean') {
      return res.status(400).json({ error: 'billingExempt debe ser boolean' })
    }

    const data = { billingExempt }
    // Al eximir, dejarlo activo de inmediato (salvo suspensiones/cancelaciones manuales).
    if (billingExempt) {
      const current = await prisma.workspace.findUnique({ where: { id }, select: { status: true } })
      if (current && current.status !== 'suspended' && current.status !== 'cancelled') {
        data.status = 'active'
      }
    }

    const workspace = await prisma.workspace.update({
      where: { id },
      data,
      select: { id: true, name: true, status: true, billingExempt: true },
    })
    res.json(workspace)
  } catch (err) { next(err) }
}

/**
 * DELETE /api/superadmin/workspaces/:id
 * Borrado inmediato y definitivo de un workspace, para los casos que el flujo normal
 * (owner pide la baja desde Preferencias, espera 48hs) no puede resolver — ej: un
 * workspace viejo sin ningún miembro con rol owner/admin activo, que por eso tampoco
 * puede autopromoverse ni pedir su propia baja. Reusa `executeWorkspaceDeletion`, el
 * mismo motor que corre el cron de bajas vencidas. Body: { confirmSlug } — debe
 * coincidir exacto con el slug del workspace, para no borrar el equivocado con un click.
 */
async function deleteWorkspace(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { confirmSlug } = req.body

    const workspace = await prisma.workspace.findUnique({ where: { id }, select: { id: true, slug: true, name: true } })
    if (!workspace) return res.status(404).json({ error: 'Workspace no encontrado' })
    if (confirmSlug !== workspace.slug) {
      return res.status(400).json({ error: 'El slug no coincide. Escribilo exactamente para confirmar el borrado.' })
    }

    const { executeWorkspaceDeletion } = require('../workspace/deletion.controller')
    await executeWorkspaceDeletion(id)
    console.log(`[superadmin] staff#${req.user.userId} eliminó el workspace#${id} (${workspace.slug})`)
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * POST /api/superadmin/impersonate
 * Genera un JWT para entrar a un workspace como su owner/admin.
 * Body: { workspaceId }
 */
async function impersonate(req, res, next) {
  try {
    const { workspaceId } = req.body
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId requerido' })

    const workspace = await prisma.workspace.findUnique({ where: { id: Number(workspaceId) } })
    if (!workspace) return res.status(404).json({ error: 'Workspace no encontrado' })

    // Buscar owner, luego admin, luego cualquier miembro activo
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: workspace.id, active: true },
      orderBy: [
        { role: 'asc' }, // owner < admin < member alfabéticamente no aplica, usamos includes
      ],
      include: { user: true },
    })

    // Priorizar owner > admin > member
    const ownerMember = await prisma.workspaceMember.findFirst({
      where: { workspaceId: workspace.id, active: true, role: 'owner' },
      include: { user: true },
    }) || await prisma.workspaceMember.findFirst({
      where: { workspaceId: workspace.id, active: true, role: 'admin' },
      include: { user: true },
    }) || member

    if (!ownerMember) return res.status(404).json({ error: 'No hay miembros activos en este workspace' })

    // Seguridad: el token impersonado NO lleva isSuperAdmin — la sesión actúa con el rol real
    // del miembro (owner/admin/member) en ESE workspace, sin acceso a rutas /superadmin ni a los
    // bypass globales. `impersonatedBy` deja traza de quién impersonó (auditoría).
    const token = jwt.sign(
      {
        userId:      ownerMember.user.id,
        workspaceId: workspace.id,
        role:        ownerMember.role,
        teamRole:    ownerMember.teamRole,
        isSuperAdmin: false,
        impersonatedBy: req.user.userId,
        name:        ownerMember.user.name,
        email:       ownerMember.user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    )

    console.log(`[impersonate] superadmin#${req.user.userId} → workspace#${workspace.id} (${workspace.slug}) como user#${ownerMember.user.id}`)
    res.json({ token, slug: workspace.slug, impersonating: ownerMember.user.name })
  } catch (err) { next(err) }
}

module.exports = {
  listWorkspaces, getWorkspace, updateWorkspaceStatus, updateTokenLimit,
  updateStorageLimit, updateStorageQuotas, updateWorkspaceBillingExempt,
  deleteWorkspace, impersonate,
}
