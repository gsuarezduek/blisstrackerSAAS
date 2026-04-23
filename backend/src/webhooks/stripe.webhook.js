const prisma = require('../lib/prisma')
const stripe  = require('../lib/stripe')
const { sendPaymentSuccessEmail, sendPaymentFailedEmail } = require('../services/email.service')

// Devuelve los emails de todos los owners y admins activos del workspace
async function getAdminEmails(workspaceId) {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, active: true, role: { in: ['owner', 'admin'] } },
    include: { user: { select: { email: true } } },
  })
  return members.map(m => m.user.email).filter(Boolean)
}

/**
 * POST /api/billing/webhook
 * Recibe eventos de Stripe. Requiere cuerpo RAW (no JSON parseado).
 * Montado en app.js ANTES de express.json().
 */
async function handleWebhook(req, res) {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe no configurado' })
  }

  const sig = req.headers['stripe-signature']
  let event

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || '',
    )
  } catch (err) {
    console.error('[Stripe Webhook] Firma inválida:', err.message)
    return res.status(400).json({ error: `Webhook Error: ${err.message}` })
  }

  console.log(`[Stripe Webhook] ${event.type}`)

  try {
    switch (event.type) {

      // ── Usuario completó el checkout ─────────────────────────────────────
      case 'checkout.session.completed': {
        const session     = event.data.object
        const workspaceId = Number(session.metadata?.workspaceId)
        if (!workspaceId) break

        const stripeSubId = String(session.subscription)
        const stripeSub   = await stripe.subscriptions.retrieve(stripeSubId)

        const seats     = stripeSub.items.data[0]?.quantity ?? 1
        const periodEnd = stripeSub.current_period_end
          ? new Date(stripeSub.current_period_end * 1000) : null

        await prisma.$transaction([
          prisma.workspace.update({
            where: { id: workspaceId },
            data:  { status: 'active' },
          }),
          prisma.subscription.upsert({
            where:  { workspaceId },
            update: {
              stripeSubId,
              status:      'active',
              seats,
              periodStart: stripeSub.current_period_start
                ? new Date(stripeSub.current_period_start * 1000) : null,
              periodEnd,
            },
            create: {
              workspaceId,
              stripeSubId,
              status:      'active',
              planName:    'pro',
              seats,
              periodStart: stripeSub.current_period_start
                ? new Date(stripeSub.current_period_start * 1000) : null,
              periodEnd,
            },
          }),
        ])

        // Notificar por email a los owners/admins del workspace
        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } })
        const adminEmails = await getAdminEmails(workspaceId)
        if (adminEmails.length) {
          sendPaymentSuccessEmail(adminEmails, workspace?.name ?? '', seats, periodEnd, workspaceId)
            .catch(err => console.error('[Webhook] Error enviando email de pago:', err.message))
        }
        break
      }

      // ── Suscripción modificada (upgrade, downgrade, reactivación) ────────
      case 'customer.subscription.updated': {
        const sub         = event.data.object
        const workspaceId = Number(sub.metadata?.workspaceId)
        if (!workspaceId) break

        const statusMap = {
          active:             'active',
          past_due:           'past_due',
          canceled:           'cancelled',
          trialing:           'trialing',
          incomplete:         'trialing',
          incomplete_expired: 'past_due',
          unpaid:             'past_due',
        }
        const wsStatus = statusMap[sub.status] ?? 'past_due'

        await prisma.$transaction([
          prisma.workspace.update({ where: { id: workspaceId }, data: { status: wsStatus } }),
          prisma.subscription.upsert({
            where:  { workspaceId },
            update: {
              status: sub.status,
              seats:  sub.items.data[0]?.quantity ?? 1,
              periodStart: sub.current_period_start
                ? new Date(sub.current_period_start * 1000) : null,
              periodEnd:   sub.current_period_end
                ? new Date(sub.current_period_end   * 1000) : null,
            },
            create: {
              workspaceId,
              stripeSubId: sub.id,
              status:      sub.status,
              planName:    'pro',
              seats:       sub.items.data[0]?.quantity ?? 1,
              periodStart: sub.current_period_start
                ? new Date(sub.current_period_start * 1000) : null,
              periodEnd:   sub.current_period_end
                ? new Date(sub.current_period_end   * 1000) : null,
            },
          }),
        ])
        break
      }

      // ── Suscripción cancelada ────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub         = event.data.object
        const workspaceId = Number(sub.metadata?.workspaceId)
        if (!workspaceId) break

        await prisma.$transaction([
          prisma.workspace.update({ where: { id: workspaceId }, data: { status: 'cancelled' } }),
          prisma.subscription.updateMany({ where: { workspaceId }, data: { status: 'cancelled' } }),
        ])
        break
      }

      // ── Pago exitoso ─────────────────────────────────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        if (!invoice.subscription) break
        const sub         = await stripe.subscriptions.retrieve(String(invoice.subscription))
        const workspaceId = Number(sub.metadata?.workspaceId)
        if (!workspaceId) break

        await prisma.workspace.update({ where: { id: workspaceId }, data: { status: 'active' } })
        break
      }

      // ── Pago fallido ─────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object
        if (!invoice.subscription) break
        const sub         = await stripe.subscriptions.retrieve(String(invoice.subscription))
        const workspaceId = Number(sub.metadata?.workspaceId)
        if (!workspaceId) break

        await prisma.workspace.update({ where: { id: workspaceId }, data: { status: 'past_due' } })

        // Notificar a los owners/admins
        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } })
        const adminEmails = await getAdminEmails(workspaceId)
        if (adminEmails.length) {
          sendPaymentFailedEmail(adminEmails, workspace?.name ?? '', workspaceId)
            .catch(err => console.error('[Webhook] Error enviando email de fallo de pago:', err.message))
        }
        break
      }

      default:
        // Evento no manejado — ignorar
        break
    }

    // Siempre responder 200 a Stripe para evitar reintentos
    res.json({ received: true })
  } catch (err) {
    console.error('[Stripe Webhook] Error procesando evento:', err)
    res.json({ received: true })
  }
}

module.exports = { handleWebhook }
