/**
 * Tracking simple de eventos de conversión.
 *
 * Endpoint público (sin auth) porque queremos trackear acciones pre-signup
 * (CTA clicks en la landing, vista de pricing, etc.). Para evitar spam:
 * - allowlist de nombres de eventos válidos
 * - rate limit global ya aplicado a /api/* en app.js
 * - payload truncado a 200 chars en params
 *
 * Si el request es de un usuario autenticado, capturamos userId/workspaceId
 * desde el JWT (opcional).
 */
const prisma = require('../lib/prisma')
const jwt = require('jsonwebtoken')

const ALLOWED_EVENTS = new Set([
  // Pre-signup (landing pública)
  'landing_cta_click',
  'pricing_page_viewed',
  'pricing_calc_used',
  'signup_started',

  // Post-signup
  'signup_completed',
  'first_task_created',
  'first_team_member_invited',
  'first_marketing_integration_connected',
  'first_geo_audit_run',
  'first_report_generated',
  'checkout_started',
  'subscription_active',

  // Onboarding tour
  'tour_started',
  'tour_step_completed',
  'tour_skipped',
  'tour_completed',
  'onboarding_modules_selected',
])

function tryDecodeJwt(req) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  try {
    return jwt.verify(header.slice(7), process.env.JWT_SECRET)
  } catch {
    return null
  }
}

function sanitizeParams(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return {}
  const out = {}
  for (const [k, v] of Object.entries(p)) {
    if (typeof k !== 'string' || k.length > 50) continue
    if (v == null) continue
    if (typeof v === 'string')  out[k] = v.slice(0, 200)
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v
  }
  return out
}

/**
 * POST /api/events
 * Body: { name, params? }
 * Sin auth obligatoria. Si hay JWT válido, captura userId/workspaceId.
 */
async function track(req, res, next) {
  try {
    const { name, params } = req.body || {}
    if (typeof name !== 'string' || !ALLOWED_EVENTS.has(name)) {
      // No respondemos 400 para no romper analytics — descartamos silenciosamente.
      return res.json({ ok: true, dropped: true })
    }

    const decoded = tryDecodeJwt(req)
    await prisma.conversionEvent.create({
      data: {
        name,
        params:      sanitizeParams(params),
        userId:      decoded?.userId      ?? null,
        workspaceId: decoded?.workspaceId ?? null,
      },
    })
    res.json({ ok: true })
  } catch (err) {
    // Tampoco fallamos visiblemente — analytics no debe romper UX.
    console.error('[events] error logueando:', err.message)
    res.json({ ok: false })
  }
}

module.exports = { track, ALLOWED_EVENTS }
