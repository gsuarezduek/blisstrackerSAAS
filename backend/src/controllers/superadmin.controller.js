const prisma = require('../lib/prisma')
const jwt = require('jsonwebtoken')
const stripe = require('../lib/stripe')
const { getSettings } = require('../lib/platformSettings')
const { DEFAULT_TZ } = require('../utils/dates')

/**
 * GET /api/superadmin/workspaces
 * Lista todos los workspaces con stats básicas.
 */
async function listWorkspaces(req, res, next) {
  try {
    const { startOfCurrentMonth } = require('../lib/tokenBudget')
    const monthStart = startOfCurrentMonth()

    const [workspaces, tokenUsageRaw] = await Promise.all([
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
    ])

    // Mapear consumo mensual por workspaceId
    const tokenByWs = {}
    for (const r of tokenUsageRaw) {
      if (r.workspaceId) {
        tokenByWs[r.workspaceId] = (r._sum.inputTokens ?? 0) + (r._sum.outputTokens ?? 0)
      }
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

    const { startOfCurrentMonth } = require('../lib/tokenBudget')

    const [workspace, members, projects, tokenStats, monthlyUsageAgg] = await Promise.all([
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

// Pricing — funciones puras. Los tiers vienen de PlatformSetting 'pricingTiers'.
// Pre-cargar al inicio del handler para evitar contagio async dentro de loops.
function findTier(seats, tiers) {
  return tiers.find(t => t.upTo == null || seats <= t.upTo) ?? tiers[tiers.length - 1]
}

function calcMrr(seats, tiers) {
  if (seats <= 0 || !tiers?.length) return 0
  const tier = findTier(seats, tiers)
  return seats * tier.pricePerSeat
}

function priceLabel(seats, tiers) {
  if (!tiers?.length) return null
  const tier = findTier(seats, tiers)
  return tier ? `$${tier.pricePerSeat}` : null
}

/**
 * GET /api/superadmin/billing
 * Resumen global de facturación: MRR, ARR, conteos por estado, tabla de workspaces.
 */
async function getBillingOverview(req, res, next) {
  try {
    // Pre-cargar settings necesarios — calc functions quedan puras y sync
    const settings = await getSettings(['pricingTiers', 'trialingSoonDays'])
    const pricingTiers = settings.pricingTiers

    const workspaces = await prisma.workspace.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: true,
        _count: { select: { members: { where: { active: true } } } },
      },
    })

    const now = new Date()

    const rows = workspaces.map(w => {
      const seats = w._count.members
      const isActive = w.status === 'active'
      const mrr = isActive ? calcMrr(seats, pricingTiers) : 0

      let trialDaysLeft = null
      if (w.status === 'trialing' && w.trialEndsAt) {
        const ms = new Date(w.trialEndsAt) - now
        trialDaysLeft = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
      }

      return {
        id:           w.id,
        name:         w.name,
        slug:         w.slug,
        status:       w.status,
        seats,
        trialEndsAt:  w.trialEndsAt,
        trialDaysLeft,
        createdAt:    w.createdAt,
        subscription: w.subscription ? {
          stripeSubId: w.subscription.stripeSubId,
          periodEnd:   w.subscription.periodEnd,
          planName:    w.subscription.planName,
        } : null,
        mrr,
        pricePerSeat: isActive ? priceLabel(seats, pricingTiers) : null,
      }
    })

    const activeRows   = rows.filter(w => w.status === 'active')
    const mrr          = activeRows.reduce((sum, w) => sum + w.mrr, 0)
    const trialingSoon = rows.filter(w => w.status === 'trialing' && w.trialDaysLeft != null && w.trialDaysLeft <= settings.trialingSoonDays)

    res.json({
      mrr,
      arr:          mrr * 12,
      pricingTiers,
      activeCount:     rows.filter(w => w.status === 'active').length,
      trialingCount:   rows.filter(w => w.status === 'trialing').length,
      pastDueCount:    rows.filter(w => w.status === 'past_due').length,
      cancelledCount:  rows.filter(w => w.status === 'cancelled' || w.status === 'suspended').length,
      trialingSoon:    trialingSoon.length,
      workspaces:      rows,
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/superadmin/payments
 * Lista los pagos recibidos en Stripe, enriquecidos con info del workspace.
 * Soporta ?limit=&starting_after= para paginación cursor-based (igual que Stripe).
 */
async function listPayments(req, res, next) {
  if (!stripe) return res.status(503).json({ error: 'Stripe no configurado' })
  try {
    const limit         = Math.min(Number(req.query.limit) || 25, 100)
    const startingAfter = req.query.starting_after || undefined

    // Traer facturas pagadas de Stripe (todas, sin filtro de customer)
    const { data: invoices, has_more } = await stripe.invoices.list({
      status:         'paid',
      limit,
      starting_after: startingAfter,
      expand:         ['data.customer'],
    })

    if (!invoices.length) return res.json({ payments: [], has_more: false })

    // Extraer workspaceIds desde la metadata del customer de cada factura
    const workspaceIds = invoices
      .map(inv => Number(inv.customer?.metadata?.workspaceId))
      .filter(id => id > 0)

    // Traer los workspaces en una sola query
    const workspaces = await prisma.workspace.findMany({
      where: { id: { in: [...new Set(workspaceIds)] } },
      select: { id: true, name: true, slug: true, status: true },
    })
    const wsMap = Object.fromEntries(workspaces.map(w => [w.id, w]))

    const payments = invoices.map(inv => {
      const wid       = Number(inv.customer?.metadata?.workspaceId)
      const workspace = wsMap[wid] ?? null
      return {
        id:          inv.id,
        number:      inv.number,
        amount:      inv.amount_paid / 100,
        currency:    inv.currency.toUpperCase(),
        date:        new Date(inv.created * 1000),
        periodStart: inv.period_start ? new Date(inv.period_start * 1000) : null,
        periodEnd:   inv.period_end   ? new Date(inv.period_end   * 1000) : null,
        pdfUrl:      inv.invoice_pdf,
        hostedUrl:   inv.hosted_invoice_url,
        customerEmail: typeof inv.customer === 'object' ? inv.customer.email : null,
        workspace,
      }
    })

    res.json({ payments, has_more })
  } catch (err) { next(err) }
}

// Pricing de Claude Haiku — funciones puras; los costos vienen de PlatformSetting.
function calcTokenCost(inputTokens, outputTokens, costs) {
  return (inputTokens / 1_000_000) * costs.haikuInputCostPer1M
       + (outputTokens / 1_000_000) * costs.haikuOutputCostPer1M
}

/**
 * GET /api/superadmin/ai-tokens
 * Estadísticas de uso de tokens de IA.
 * Query params:
 *   ?period=all|30d|7d  (default: all)
 */
async function getAiTokenStats(req, res, next) {
  try {
    const { period = 'all' } = req.query
    let dateFilter = {}
    if (period === '30d') {
      const from = new Date(); from.setDate(from.getDate() - 30)
      dateFilter = { createdAt: { gte: from } }
    } else if (period === '7d') {
      const from = new Date(); from.setDate(from.getDate() - 7)
      dateFilter = { createdAt: { gte: from } }
    }

    const costs = await getSettings(['haikuInputCostPer1M', 'haikuOutputCostPer1M'])

    const [globalByService, workspaces, byWorkspaceAndService, dailySeries] = await Promise.all([
      // Totales globales agrupados por servicio
      prisma.aiTokenLog.groupBy({
        by: ['service'],
        where: dateFilter,
        _sum: { inputTokens: true, outputTokens: true },
        orderBy: { _sum: { inputTokens: 'desc' } },
      }),

      // Info de todos los workspaces (para enriquecer resultados)
      prisma.workspace.findMany({
        select: { id: true, name: true, slug: true, status: true },
      }),

      // Totales por workspace + servicio
      prisma.aiTokenLog.groupBy({
        by: ['workspaceId', 'service'],
        where: dateFilter,
        _sum: { inputTokens: true, outputTokens: true },
      }),

      // Serie diaria (últimos 30 días siempre) para el gráfico de evolución
      prisma.aiTokenLog.groupBy({
        by: ['service'],
        where: { createdAt: { gte: (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d })() } },
        _sum: { inputTokens: true, outputTokens: true },
      }),
    ])

    const wsMap = Object.fromEntries(workspaces.map(w => [w.id, w]))

    // Calcular totales globales
    const totalInput  = globalByService.reduce((s, r) => s + (r._sum.inputTokens  || 0), 0)
    const totalOutput = globalByService.reduce((s, r) => s + (r._sum.outputTokens || 0), 0)

    // Armar breakdown por servicio
    const byService = globalByService.map(r => ({
      service:       r.service,
      inputTokens:   r._sum.inputTokens  || 0,
      outputTokens:  r._sum.outputTokens || 0,
      total:         (r._sum.inputTokens || 0) + (r._sum.outputTokens || 0),
      estimatedCost: calcTokenCost(r._sum.inputTokens || 0, r._sum.outputTokens || 0, costs),
    }))

    // Agrupar por workspace
    const byWorkspaceMap = {}
    for (const row of byWorkspaceAndService) {
      const wid = row.workspaceId
      if (!byWorkspaceMap[wid]) {
        byWorkspaceMap[wid] = {
          workspaceId:   wid,
          name:          wsMap[wid]?.name  ?? `Workspace #${wid}`,
          slug:          wsMap[wid]?.slug  ?? '',
          status:        wsMap[wid]?.status ?? 'unknown',
          inputTokens:   0,
          outputTokens:  0,
          total:         0,
          estimatedCost: 0,
          byService:     [],
        }
      }
      const inp  = row._sum.inputTokens  || 0
      const out  = row._sum.outputTokens || 0
      byWorkspaceMap[wid].inputTokens  += inp
      byWorkspaceMap[wid].outputTokens += out
      byWorkspaceMap[wid].total        += inp + out
      byWorkspaceMap[wid].estimatedCost += calcTokenCost(inp, out, costs)
      byWorkspaceMap[wid].byService.push({
        service:       row.service,
        inputTokens:   inp,
        outputTokens:  out,
        total:         inp + out,
        estimatedCost: calcTokenCost(inp, out, costs),
      })
    }

    // Incluir workspaces sin uso (total = 0) no tiene sentido, solo los que tienen logs
    const byWorkspace = Object.values(byWorkspaceMap)
      .sort((a, b) => b.total - a.total)

    res.json({
      period,
      totalInputTokens:  totalInput,
      totalOutputTokens: totalOutput,
      totalTokens:       totalInput + totalOutput,
      estimatedCostUsd:  calcTokenCost(totalInput, totalOutput, costs),
      byService,
      byWorkspace,
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/superadmin/whatsapp-usage?month=YYYY-MM
 * Uso de WhatsApp por workspace/mes (Fase 6 del plan) — mirror de
 * getAiTokenStats. El costo es una ESTIMACIÓN simple (costo fijo por
 * plantilla × cantidad enviada) porque Meta cobra por conversación con
 * precio variable por país/categoría, no expone eso vía la API del BSP —
 * ver PlatformSetting `whatsappTemplateCostUsd`. Con el setting en 0
 * (default, "sin configurar") no se calcula costo, solo volumen.
 */
async function getWhatsappUsageStats(req, res, next) {
  try {
    const { computeAllWorkspacesWhatsappUsage } = require('../services/whatsappUsage.service')
    const { todayString } = require('../utils/dates')
    const month = req.query.month || todayString(DEFAULT_TZ).slice(0, 7)

    const [rows, { whatsappTemplateCostUsd: costPerTemplate }, workspaces] = await Promise.all([
      computeAllWorkspacesWhatsappUsage(month),
      getSettings(['whatsappTemplateCostUsd']),
      prisma.workspace.findMany({ select: { id: true, name: true, slug: true, status: true } }),
    ])
    const wsMap = Object.fromEntries(workspaces.map(w => [w.id, w]))

    const byWorkspace = rows
      .map(r => ({
        ...r,
        name: wsMap[r.workspaceId]?.name ?? `Workspace #${r.workspaceId}`,
        slug: wsMap[r.workspaceId]?.slug ?? '',
        status: wsMap[r.workspaceId]?.status ?? 'unknown',
        estimatedCostUsd: Math.round(r.templatesSent * costPerTemplate * 100) / 100,
      }))
      .sort((a, b) => b.templatesSent - a.templatesSent)

    const totals = byWorkspace.reduce((acc, w) => ({
      messagesIn: acc.messagesIn + w.messagesIn,
      messagesOut: acc.messagesOut + w.messagesOut,
      templatesSent: acc.templatesSent + w.templatesSent,
      conversationsActive: acc.conversationsActive + w.conversationsActive,
      estimatedCostUsd: Math.round((acc.estimatedCostUsd + w.estimatedCostUsd) * 100) / 100,
    }), { messagesIn: 0, messagesOut: 0, templatesSent: 0, conversationsActive: 0, estimatedCostUsd: 0 })

    res.json({ month, costPerTemplate, totals, byWorkspace })
  } catch (err) { next(err) }
}

/**
 * GET /api/superadmin/users
 * Lista global de usuarios con búsqueda y paginación.
 * Query: ?search=&limit=50&offset=0&status=all|active|inactive|orphan
 */
async function listUsers(req, res, next) {
  try {
    const { search = '', status = 'all' } = req.query
    const limit  = Math.min(Number(req.query.limit)  || 50, 200)
    const offset = Math.max(Number(req.query.offset) || 0, 0)

    const where = search.trim()
      ? {
          OR: [
            { email: { contains: search.trim(), mode: 'insensitive' } },
            { name:  { contains: search.trim(), mode: 'insensitive' } },
          ],
        }
      : {}

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id:           true,
          name:         true,
          email:        true,
          avatar:       true,
          isSuperAdmin: true,
          createdAt:    true,
          workspaceMembers: {
            select: {
              active:              true,
              role:                true,
              dailyInsightEnabled: true,
              workspace:           { select: { id: true, name: true, slug: true } },
            },
          },
          loginEvents: {
            select:  { loginAt: true },
            orderBy: { loginAt: 'desc' },
            take:    1,
          },
        },
      }),
      prisma.user.count({ where }),
    ])

    const rows = users.map(u => {
      const totalMemberships  = u.workspaceMembers.length
      const activeMemberships = u.workspaceMembers.filter(m => m.active).length
      const lastLoginAt       = u.loginEvents[0]?.loginAt ?? null

      let dailyInsightStatus = 'none'
      if (totalMemberships > 0) {
        const onCount = u.workspaceMembers.filter(m => m.dailyInsightEnabled).length
        if (onCount === totalMemberships)      dailyInsightStatus = 'on'
        else if (onCount === 0)                dailyInsightStatus = 'off'
        else                                   dailyInsightStatus = 'mixed'
      }

      return {
        id:                 u.id,
        name:               u.name,
        email:              u.email,
        avatar:             u.avatar,
        isSuperAdmin:       u.isSuperAdmin,
        createdAt:          u.createdAt,
        totalMemberships,
        activeMemberships,
        lastLoginAt,
        dailyInsightStatus,
        workspaces: u.workspaceMembers.map(m => ({
          id:                  m.workspace.id,
          name:                m.workspace.name,
          slug:                m.workspace.slug,
          role:                m.role,
          active:              m.active,
          dailyInsightEnabled: m.dailyInsightEnabled,
        })),
      }
    })

    const filtered = rows.filter(u => {
      if (status === 'active')   return u.activeMemberships > 0
      if (status === 'inactive') return u.totalMemberships > 0 && u.activeMemberships === 0
      if (status === 'orphan')   return u.totalMemberships === 0
      return true
    })

    res.json({ users: filtered, total })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/users/:id/toggle-active
 * Body: { active: boolean }
 * Si active === false: desactiva todas las memberships del usuario (kill switch global).
 * Si active === true:  reactiva todas las memberships del usuario.
 * Nunca aplica a memberships dentro de un workspace cancelado/suspendido.
 */
async function toggleUserActive(req, res, next) {
  try {
    const userId = Number(req.params.id)
    const active = Boolean(req.body.active)

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const result = await prisma.workspaceMember.updateMany({
      where: { userId },
      data:  { active },
    })

    res.json({ userId, active, affectedMemberships: result.count })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/users/:id/toggle-daily-insight
 * Body: { enabled: boolean }
 * Aplica el cambio a TODAS las memberships del usuario (en todos sus workspaces).
 * Si enabled === false, también desactiva insightMemoryEnabled y taskQualityEnabled
 * (subordinados al master toggle, ver Preferences.jsx).
 */
async function toggleUserDailyInsight(req, res, next) {
  try {
    const userId  = Number(req.params.id)
    const enabled = Boolean(req.body.enabled)

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const data = enabled
      ? { dailyInsightEnabled: true }
      : { dailyInsightEnabled: false, insightMemoryEnabled: false, taskQualityEnabled: false }

    const result = await prisma.workspaceMember.updateMany({
      where: { userId },
      data,
    })

    res.json({ userId, enabled, affectedMemberships: result.count })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/users/:id/toggle-superadmin
 * Body: { isSuperAdmin: boolean }
 * Otorga o revoca el acceso global a /superadmin. Un super admin no puede
 * quitarse el flag a sí mismo (evita quedarse sin acceso sin que quede otro
 * super admin activo para revertirlo).
 */
async function toggleUserSuperAdmin(req, res, next) {
  try {
    const userId       = Number(req.params.id)
    const isSuperAdmin = Boolean(req.body.isSuperAdmin)

    if (userId === req.user.userId && !isSuperAdmin) {
      return res.status(400).json({ error: 'No podés quitarte a vos mismo el acceso de Super Admin.' })
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const updated = await prisma.user.update({
      where: { id: userId },
      data:  { isSuperAdmin },
      select: { id: true, isSuperAdmin: true },
    })

    res.json(updated)
  } catch (err) { next(err) }
}

/**
 * GET /api/superadmin/conversion-funnel
 * Agregados de los últimos 30 días: signups, trials activos, conversiones a paid.
 * Lee de ConversionEvent (eventos instrumentados desde frontend) + Workspace/Subscription.
 */
async function getConversionFunnel(req, res, next) {
  try {
    const days = Math.max(1, Math.min(Number(req.query.days) || 30, 365))
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const [
      ctaClicks,
      pricingViews,
      signupStarted,
      signupCompleted,
      workspacesNew,
      workspacesActive,
      workspacesTrialing,
      checkoutStarted,
      subscriptionActive,
    ] = await Promise.all([
      prisma.conversionEvent.count({ where: { name: 'landing_cta_click', createdAt: { gte: since } } }),
      prisma.conversionEvent.count({ where: { name: 'pricing_page_viewed', createdAt: { gte: since } } }),
      prisma.conversionEvent.count({ where: { name: 'signup_started', createdAt: { gte: since } } }),
      prisma.conversionEvent.count({ where: { name: 'signup_completed', createdAt: { gte: since } } }),
      prisma.workspace.count({ where: { createdAt: { gte: since } } }),
      prisma.workspace.count({ where: { status: 'active',   createdAt: { gte: since } } }),
      prisma.workspace.count({ where: { status: 'trialing', createdAt: { gte: since } } }),
      prisma.conversionEvent.count({ where: { name: 'checkout_started', createdAt: { gte: since } } }),
      prisma.conversionEvent.count({ where: { name: 'subscription_active', createdAt: { gte: since } } }),
    ])

    // Eventos top de los últimos N días (para diagnosticar qué se está clickeando)
    const topEvents = await prisma.conversionEvent.groupBy({
      by:    ['name'],
      where: { createdAt: { gte: since } },
      _count: { name: true },
      orderBy: { _count: { name: 'desc' } },
      take:    20,
    })

    res.json({
      windowDays: days,
      since,
      funnel: {
        ctaClicks,
        pricingViews,
        signupStarted,
        signupCompleted,
        workspacesNew,
        workspacesTrialing,
        workspacesActive,
        checkoutStarted,
        subscriptionActive,
      },
      // Conversion rates (cuando hay denominador)
      rates: {
        ctaToSignupStarted:  ctaClicks       > 0 ? Math.round((signupStarted   / ctaClicks)       * 1000) / 10 : null,
        signupStartedToDone: signupStarted   > 0 ? Math.round((signupCompleted / signupStarted)   * 1000) / 10 : null,
        trialingToActive:    workspacesNew   > 0 ? Math.round((workspacesActive / workspacesNew)  * 1000) / 10 : null,
      },
      topEvents: topEvents.map(e => ({ name: e.name, count: e._count.name })),
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/superadmin/metrics?days=N
 * Métricas de uso de la plataforma: series diarias (DAU, workspaces activos,
 * tareas, signups, tokens IA), KPIs (WAU/MAU/stickiness) y retención por
 * cohortes semanales. Todo agrupado por día calendario en ART (UTC-3).
 */
const METRICS_TZ = DEFAULT_TZ
const num = v => Number(v ?? 0)

async function getMetrics(req, res, next) {
  try {
    const days = Math.max(7, Math.min(Number(req.query.days) || 30, 365))

    // Eje de días en ART (sin DST en Argentina → paso de 24h estable).
    const artDay = d => new Intl.DateTimeFormat('en-CA', { timeZone: METRICS_TZ }).format(d)
    const axis = []
    for (let i = days - 1; i >= 0; i--) axis.push(artDay(new Date(Date.now() - i * 86400000)))
    const since = new Date(`${axis[0]}T00:00:00-03:00`)
    const cohortSince = new Date(Date.now() - 8 * 7 * 86400000) // 8 semanas

    // Helper: convierte filas [{ day, ... }] en un array alineado al eje.
    const toSeries = (rows, key = 'n') => {
      const map = Object.fromEntries(rows.map(r => [r.day, num(r[key])]))
      return axis.map(d => map[d] ?? 0)
    }

    const [
      activity, tasksCreated, tasksCompleted, signups, newUsers, tokens,
      mauRow, wauRow, cohortRows,
    ] = await Promise.all([
      prisma.$queryRaw`
        SELECT (("loginAt" AT TIME ZONE 'UTC' AT TIME ZONE DEFAULT_TZ)::date)::text AS day,
               COUNT(DISTINCT "userId") AS users, COUNT(DISTINCT "workspaceId") AS workspaces
        FROM "UserLogin" WHERE "loginAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw`
        SELECT (("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE DEFAULT_TZ)::date)::text AS day, COUNT(*) AS n
        FROM "Task" WHERE "createdAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw`
        SELECT (("completedAt" AT TIME ZONE 'UTC' AT TIME ZONE DEFAULT_TZ)::date)::text AS day, COUNT(*) AS n
        FROM "Task" WHERE "completedAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw`
        SELECT (("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE DEFAULT_TZ)::date)::text AS day, COUNT(*) AS n
        FROM "Workspace" WHERE "createdAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw`
        SELECT (("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE DEFAULT_TZ)::date)::text AS day, COUNT(*) AS n
        FROM "User" WHERE "createdAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw`
        SELECT (("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE DEFAULT_TZ)::date)::text AS day,
               COALESCE(SUM("inputTokens" + "outputTokens"), 0) AS n
        FROM "AiTokenLog" WHERE "createdAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw`SELECT COUNT(DISTINCT "userId") AS n FROM "UserLogin" WHERE "loginAt" >= now() - interval '30 days'`,
      prisma.$queryRaw`SELECT COUNT(DISTINCT "userId") AS n FROM "UserLogin" WHERE "loginAt" >= now() - interval '7 days'`,
      // Cohortes semanales: workspaces por semana de alta + cuántos siguen activos (login en últimos 14d)
      prisma.$queryRaw`
        WITH cohort AS (
          SELECT id, to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE DEFAULT_TZ), 'IYYY-"W"IW') AS week
          FROM "Workspace" WHERE "createdAt" >= ${cohortSince}
        ),
        act AS (
          SELECT DISTINCT "workspaceId" AS id FROM "UserLogin"
          WHERE "loginAt" >= now() - interval '14 days' AND "workspaceId" IS NOT NULL
        )
        SELECT c.week AS week, COUNT(*) AS size, COUNT(a.id) AS active
        FROM cohort c LEFT JOIN act a ON a.id = c.id
        GROUP BY c.week ORDER BY c.week`,
    ])

    const activeUsers      = toSeries(activity, 'users')
    const activeWorkspaces = toSeries(activity, 'workspaces')
    const sum = arr => arr.reduce((a, b) => a + b, 0)
    const dauAvg = activeUsers.length ? Math.round(sum(activeUsers) / activeUsers.length) : 0
    const mau = num(mauRow[0]?.n)

    res.json({
      range: { days, since },
      axis,
      series: {
        activeUsers,
        activeWorkspaces,
        tasksCreated:   toSeries(tasksCreated),
        tasksCompleted: toSeries(tasksCompleted),
        newWorkspaces:  toSeries(signups),
        newUsers:       toSeries(newUsers),
        aiTokens:       toSeries(tokens),
      },
      summary: {
        dauAvg,
        dauToday:   activeUsers[activeUsers.length - 1] ?? 0,
        wau:        num(wauRow[0]?.n),
        mau,
        stickiness: mau > 0 ? Math.round((dauAvg / mau) * 1000) / 10 : null, // %
        newWorkspaces:  sum(toSeries(signups)),
        newUsers:       sum(toSeries(newUsers)),
        tasksCreated:   sum(toSeries(tasksCreated)),
        tasksCompleted: sum(toSeries(tasksCompleted)),
      },
      cohorts: cohortRows.map(c => {
        const size = num(c.size), active = num(c.active)
        return { week: c.week, size, active, rate: size > 0 ? Math.round((active / size) * 1000) / 10 : 0 }
      }),
    })
  } catch (err) { next(err) }
}

module.exports = { listWorkspaces, getWorkspace, updateWorkspaceStatus, updateTokenLimit, updateWorkspaceBillingExempt, impersonate, getStats, listFeedback, markFeedbackRead, listEmailLogs, getBillingOverview, listPayments, getAiTokenStats, getWhatsappUsageStats, listUsers, toggleUserActive, toggleUserDailyInsight, toggleUserSuperAdmin, getConversionFunnel, getMetrics }
