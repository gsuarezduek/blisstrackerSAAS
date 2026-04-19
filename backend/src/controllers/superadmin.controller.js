const prisma = require('../lib/prisma')
const jwt = require('jsonwebtoken')

/**
 * GET /api/superadmin/workspaces
 * Lista todos los workspaces con stats básicas.
 */
async function listWorkspaces(req, res, next) {
  try {
    const workspaces = await prisma.workspace.findMany({
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
    })

    res.json(workspaces.map(w => ({
      id:           w.id,
      name:         w.name,
      slug:         w.slug,
      status:       w.status,
      timezone:     w.timezone,
      trialEndsAt:  w.trialEndsAt,
      createdAt:    w.createdAt,
      memberCount:  w._count.members,
      projectCount: w._count.projects,
      subscription: w.subscription,
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

    const [workspace, members, projects, tokenStats] = await Promise.all([
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
        by: ['service'],
        where: { workspaceId: id },
        _sum: { inputTokens: true, outputTokens: true },
      }),
    ])

    if (!workspace) return res.status(404).json({ error: 'Workspace no encontrado' })

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
    })
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

    const workspace = await prisma.workspace.update({
      where: { id },
      data: { status },
    })
    res.json({ id: workspace.id, status: workspace.status })
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

    const token = jwt.sign(
      {
        userId:      ownerMember.user.id,
        workspaceId: workspace.id,
        role:        ownerMember.role,
        teamRole:    ownerMember.teamRole,
        isSuperAdmin: true, // mantener privilegio al impersonar
        name:        ownerMember.user.name,
        email:       ownerMember.user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    )

    res.json({ token, slug: workspace.slug, impersonating: ownerMember.user.name })
  } catch (err) { next(err) }
}

/**
 * GET /api/superadmin/stats
 * Stats globales del SaaS.
 */
async function getStats(req, res, next) {
  try {
    const [
      totalWorkspaces,
      byStatus,
      totalUsers,
      totalTasks,
    ] = await Promise.all([
      prisma.workspace.count(),
      prisma.workspace.groupBy({ by: ['status'], _count: true }),
      prisma.user.count(),
      prisma.task.count(),
    ])

    res.json({
      totalWorkspaces,
      byStatus: Object.fromEntries(byStatus.map(r => [r.status, r._count])),
      totalUsers,
      totalTasks,
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/superadmin/feedback
 * Lista todos los feedbacks de todos los workspaces.
 */
async function listFeedback(req, res, next) {
  try {
    const feedbacks = await prisma.feedback.findMany({
      include: {
        user:      { select: { id: true, name: true, avatar: true } },
        workspace: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(feedbacks)
  } catch (err) { next(err) }
}

/**
 * PUT /api/superadmin/feedback/:id/read
 * Marcar feedback como leído.
 */
async function markFeedbackRead(req, res, next) {
  try {
    const feedback = await prisma.feedback.update({
      where: { id: Number(req.params.id) },
      data: { read: true },
    })
    res.json(feedback)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'No encontrado' })
    next(err)
  }
}

/**
 * GET /api/superadmin/email-logs
 * Lista todos los logs de emails enviados. Soporta filtros ?status=&type=&limit=&offset=
 */
async function listEmailLogs(req, res, next) {
  try {
    const { status, type, limit = 50, offset = 0 } = req.query
    const where = {}
    if (status) where.status = status
    if (type)   where.type   = type

    const [logs, total] = await Promise.all([
      prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
        include: {
          workspace: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.emailLog.count({ where }),
    ])

    res.json({ logs, total })
  } catch (err) { next(err) }
}

module.exports = { listWorkspaces, getWorkspace, updateWorkspaceStatus, impersonate, getStats, listFeedback, markFeedbackRead, listEmailLogs }
