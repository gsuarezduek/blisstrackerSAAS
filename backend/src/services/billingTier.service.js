/**
 * Free tier: regla "hasta N usuarios gratis" prometida en la landing/pricing.
 *
 * Un workspace cuyo trial venció y que NO paga (sin suscripción Stripe activa)
 * debe quedar en plan Gratis (`status = 'active'`, sin suscripción) mientras
 * tenga `freeSeatLimit` usuarios activos o menos. Si supera el límite, pasa a
 * `past_due` hasta que active Pro.
 *
 * El límite es configurable desde SuperAdmin → Configuración (`freeSeatLimit`).
 */
const prisma = require('../lib/prisma')
const { getSetting } = require('../lib/platformSettings')
const { sendPlatformNotification, platformCard } = require('./email.service')

/**
 * Reconcilia el status de un workspace contra la regla de free tier.
 *
 * No toca:
 *   - workspaces exentos de billing (Workspace.billingExempt, ej: bliss)
 *   - workspaces con suscripción Stripe paga y activa (Stripe es dueño del status)
 *   - trials en curso (acceso completo hasta el vencimiento)
 *   - suspensiones/cancelaciones manuales (suspended | cancelled)
 *
 * En el resto (trial vencido / active / past_due sin pagar): cuenta usuarios
 * activos y resuelve `active` (≤ límite) o `past_due` (> límite).
 *
 * @returns {Promise<string|null>} el status resultante, o null si no se gestionó.
 */
async function reconcileWorkspaceTier(workspaceId) {
  const ws = await prisma.workspace.findUnique({
    where:  { id: workspaceId },
    select: { id: true, name: true, status: true, trialEndsAt: true, billingExempt: true },
  })
  if (!ws || ws.billingExempt) return null

  // Suspensiones/cancelaciones manuales no se tocan acá.
  if (ws.status === 'suspended' || ws.status === 'cancelled') return null

  // Trial en curso → acceso completo, la regla de free tier aún no aplica.
  if (ws.status === 'trialing' && ws.trialEndsAt && ws.trialEndsAt > new Date()) return null

  // Suscripción Stripe paga y activa → Stripe/webhooks son dueños del status.
  const sub = await prisma.subscription.findUnique({ where: { workspaceId } })
  if (sub?.stripeSubId && sub.status === 'active') return null

  const limit = await getSetting('freeSeatLimit')
  const seats = await prisma.workspaceMember.count({ where: { workspaceId, active: true } })

  const next = seats > limit ? 'past_due' : 'active'
  if (next !== ws.status) {
    await prisma.workspace.update({ where: { id: workspaceId }, data: { status: next } })
    console.log(`[BillingTier] Workspace ${workspaceId}: ${ws.status} → ${next} (${seats} usuario(s) activo(s), límite gratis ${limit})`)

    // Aviso interno: trial vencido sin conversión que pasó a past_due.
    if (ws.status === 'trialing' && next === 'past_due') {
      sendPlatformNotification('trialExpired', {
        workspaceId,
        subject: `⏰ Trial vencido sin conversión: ${ws.name}`,
        bodyHtml: platformCard('⏰ Trial vencido → past_due', [
          ['Workspace',        ws.name],
          ['Usuarios activos', String(seats)],
          ['Límite gratis',    String(limit)],
        ], '#d97706'),
      })
    }
  }
  return next
}

module.exports = { reconcileWorkspaceTier }
