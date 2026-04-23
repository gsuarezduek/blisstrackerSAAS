const prisma = require('../lib/prisma')
const stripe  = require('../lib/stripe')

// ── Status map compartido con el webhook ─────────────────────────────────────
const STRIPE_STATUS_MAP = {
  active:             'active',
  past_due:           'past_due',
  canceled:           'cancelled',
  cancelled:          'cancelled',
  trialing:           'trialing',
  incomplete:         'trialing',
  incomplete_expired: 'past_due',
  unpaid:             'past_due',
}

function stripeRequired(res) {
  if (!stripe) {
    res.status(503).json({ error: 'Billing no está configurado en este entorno (falta STRIPE_SECRET_KEY)' })
    return true
  }
  return false
}

function adminOrOwnerOnly(req, res) {
  const role = req.workspaceMember?.role
  if (role !== 'owner' && role !== 'admin') {
    res.status(403).json({ error: 'Se requieren permisos de administrador para gestionar la suscripción' })
    return true
  }
  return false
}

/**
 * GET /api/billing/status
 * Devuelve estado del trial/suscripción del workspace actual.
 * Accesible para todos los miembros.
 */
async function getStatus(req, res, next) {
  try {
    const workspace = req.workspace
    const sub = await prisma.subscription.findUnique({ where: { workspaceId: workspace.id } })
    const seats = await prisma.workspaceMember.count({
      where: { workspaceId: workspace.id, active: true },
    })

    let trialDaysLeft = null
    if (workspace.status === 'trialing' && workspace.trialEndsAt) {
      const msLeft = new Date(workspace.trialEndsAt) - new Date()
      trialDaysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
    }

    res.json({
      status:       workspace.status,       // trialing | active | past_due | suspended | cancelled
      trialEndsAt:  workspace.trialEndsAt,
      trialDaysLeft,
      seats,
      subscription: sub,
      isAdmin:      req.workspaceMember?.role === 'owner' || req.workspaceMember?.role === 'admin',
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/billing/checkout
 * Crea una sesión de Stripe Checkout para suscribirse.
 * Solo owner.
 */
async function createCheckout(req, res, next) {
  if (stripeRequired(res)) return
  if (adminOrOwnerOnly(req, res)) return
  try {
    const workspace = req.workspace
    const seats = await prisma.workspaceMember.count({
      where: { workspaceId: workspace.id, active: true },
    })

    // Obtener o crear Stripe Customer
    let customerId = workspace.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: workspace.name,
        metadata: { workspaceId: String(workspace.id), slug: workspace.slug },
      })
      await prisma.workspace.update({
        where: { id: workspace.id },
        data:  { stripeCustomerId: customer.id },
      })
      customerId = customer.id
    }

    // Construir URLs de retorno — funciona tanto en localhost como en prod
    const base = process.env.NODE_ENV === 'production'
      ? `https://${workspace.slug}.${process.env.APP_DOMAIN || 'blisstracker.app'}`
      : (process.env.FRONTEND_URL || 'http://localhost:5173')

    const session = await stripe.checkout.sessions.create({
      customer:    customerId,
      mode:        'subscription',
      line_items:  [{ price: process.env.STRIPE_PRICE_ID, quantity: Math.max(1, seats) }],
      success_url: `${base}/billing?success=1`,
      cancel_url:  `${base}/billing?cancelled=1`,
      metadata:    { workspaceId: String(workspace.id) },
      subscription_data: {
        metadata: { workspaceId: String(workspace.id), slug: workspace.slug },
      },
    })

    res.json({ url: session.url })
  } catch (err) { next(err) }
}

/**
 * POST /api/billing/portal
 * Abre el Customer Portal de Stripe para gestionar una suscripción existente.
 * Solo owner.
 */
async function createPortal(req, res, next) {
  if (stripeRequired(res)) return
  if (adminOrOwnerOnly(req, res)) return
  try {
    const workspace = req.workspace

    if (!workspace.stripeCustomerId) {
      return res.status(400).json({ error: 'No hay suscripción de Stripe asociada a este workspace' })
    }

    const base = process.env.NODE_ENV === 'production'
      ? `https://${workspace.slug}.${process.env.APP_DOMAIN || 'blisstracker.app'}`
      : (process.env.FRONTEND_URL || 'http://localhost:5173')

    const session = await stripe.billingPortal.sessions.create({
      customer:   workspace.stripeCustomerId,
      return_url: `${base}/billing`,
    })

    res.json({ url: session.url })
  } catch (err) { next(err) }
}

/**
 * POST /api/billing/sync
 * Sincroniza el estado de la suscripción leyendo directo desde Stripe.
 * Llamado por el frontend al volver de Stripe Checkout con ?success=1.
 * Accesible para todos los miembros (la sincronización no modifica nada sensible).
 */
async function syncFromStripe(req, res, next) {
  if (stripeRequired(res)) return
  try {
    const workspace = req.workspace

    if (!workspace.stripeCustomerId) {
      // Sin customer en Stripe todavía — devolver el estado actual sin cambios
      return res.json({ synced: false, status: workspace.status })
    }

    // Buscar la suscripción más reciente del customer
    const { data: subs } = await stripe.subscriptions.list({
      customer: workspace.stripeCustomerId,
      limit:    1,
      expand:   ['data.items'],
    })

    if (!subs.length) {
      return res.json({ synced: false, status: workspace.status })
    }

    const sub      = subs[0]
    const wsStatus = STRIPE_STATUS_MAP[sub.status] ?? 'past_due'

    await prisma.$transaction([
      prisma.workspace.update({
        where: { id: workspace.id },
        data:  { status: wsStatus },
      }),
      prisma.subscription.upsert({
        where:  { workspaceId: workspace.id },
        update: {
          stripeSubId: sub.id,
          status:      sub.status,
          seats:       sub.items.data[0]?.quantity ?? 1,
          periodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000) : null,
          periodEnd:   sub.current_period_end   ? new Date(sub.current_period_end   * 1000) : null,
        },
        create: {
          workspaceId: workspace.id,
          stripeSubId: sub.id,
          status:      sub.status,
          planName:    'pro',
          seats:       sub.items.data[0]?.quantity ?? 1,
          periodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000) : null,
          periodEnd:   sub.current_period_end   ? new Date(sub.current_period_end   * 1000) : null,
        },
      }),
    ])

    res.json({ synced: true, status: wsStatus })
  } catch (err) { next(err) }
}

/**
 * GET /api/billing/invoices
 * Lista las últimas facturas del workspace desde Stripe.
 * Solo admin/owner.
 */
async function getInvoices(req, res, next) {
  if (stripeRequired(res)) return
  if (adminOrOwnerOnly(req, res)) return
  try {
    const workspace = req.workspace

    if (!workspace.stripeCustomerId) {
      return res.json([])
    }

    const { data: invoices } = await stripe.invoices.list({
      customer: workspace.stripeCustomerId,
      limit:    10,
    })

    res.json(invoices.map(inv => ({
      id:          inv.id,
      number:      inv.number,
      status:      inv.status,           // paid | open | void | uncollectible
      amount:      inv.amount_paid / 100,
      currency:    inv.currency.toUpperCase(),
      date:        new Date(inv.created * 1000),
      periodStart: inv.period_start ? new Date(inv.period_start * 1000) : null,
      periodEnd:   inv.period_end   ? new Date(inv.period_end   * 1000) : null,
      pdfUrl:      inv.invoice_pdf,
      hostedUrl:   inv.hosted_invoice_url,
    })))
  } catch (err) { next(err) }
}

/**
 * Helper: actualiza la cantidad de seats en la suscripción de Stripe.
 * Llamado desde workspace.controller cuando cambia el nro de miembros activos.
 * Es fire-and-forget: los errores se logean pero no propagan.
 */
async function syncSeatsToStripe(workspaceId) {
  if (!stripe) return
  try {
    const sub = await prisma.subscription.findUnique({ where: { workspaceId } })
    if (!sub?.stripeSubId) return                       // sin suscripción activa en Stripe

    const seats     = await prisma.workspaceMember.count({ where: { workspaceId, active: true } })
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubId)
    const itemId    = stripeSub.items.data[0]?.id
    if (!itemId) return

    await stripe.subscriptions.update(sub.stripeSubId, {
      items:                 [{ id: itemId, quantity: Math.max(1, seats) }],
      proration_behavior:    'always_invoice',          // cobra o acredita la diferencia inmediatamente
    })

    await prisma.subscription.update({
      where: { workspaceId },
      data:  { seats },
    })

    console.log(`[Stripe] Seats actualizados para workspace ${workspaceId}: ${seats}`)
  } catch (err) {
    console.error(`[Stripe] Error al sincronizar seats para workspace ${workspaceId}:`, err.message)
  }
}

module.exports = { getStatus, createCheckout, createPortal, syncFromStripe, getInvoices, syncSeatsToStripe }
