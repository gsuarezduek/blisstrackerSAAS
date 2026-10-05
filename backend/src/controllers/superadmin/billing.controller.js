const prisma = require('../../lib/prisma')
const stripe = require('../../lib/stripe')
const { getSettings } = require('../../lib/platformSettings')

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

module.exports = { getBillingOverview, listPayments }
