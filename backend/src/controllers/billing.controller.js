const prisma = require('../lib/prisma')
const stripe  = require('../lib/stripe')

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

module.exports = { getStatus, createCheckout, createPortal }
