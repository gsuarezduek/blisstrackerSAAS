/**
 * Lógica compartida de códigos de invitación — única fuente de verdad usada tanto por el
 * endpoint público de validación (registro) como por el CRUD de SuperAdmin, para no duplicar
 * las reglas de vigencia/cupo ni el texto del beneficio mostrado al usuario.
 */
const stripe = require('./stripe')

const BENEFIT_TYPES = ['discount_percent', 'discount_fixed', 'free_months', 'extra_trial_days', 'custom']

function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase()
}

/** Texto en español del beneficio, para mostrarle al usuario (registro) o en SuperAdmin. */
function describeBenefit(ic) {
  switch (ic.benefitType) {
    case 'discount_percent':  return `${ic.benefitValue}% de descuento`
    case 'discount_fixed': {
      const amount = (ic.benefitValue / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 })
      return `${(ic.currency || 'usd').toUpperCase()} ${amount} de descuento`
    }
    case 'free_months':       return `${ic.benefitValue} ${ic.benefitValue === 1 ? 'mes' : 'meses'} gratis`
    case 'extra_trial_days':  return `${ic.benefitValue} días de prueba gratis`
    case 'custom':            return ic.benefitLabel || 'Beneficio especial'
    default:                  return ic.benefitLabel || ''
  }
}

/**
 * Valida un código contra las reglas de vigencia/cupo. `client` permite pasar el cliente de
 * una transacción Prisma (`tx`) para revalidar dentro de la misma transacción del registro,
 * justo antes de incrementar `usesCount`.
 * Lanza { status, error } si no es válido; devuelve la fila si lo es.
 */
async function validateCodeForRedemption(rawCode, client) {
  const code = normalizeCode(rawCode)
  if (!code) throw { status: 400, error: 'Ingresá un código de invitación' }

  const ic = await client.invitationCode.findUnique({ where: { code } })
  if (!ic) throw { status: 400, error: 'El código de invitación no existe' }
  if (!ic.active) throw { status: 400, error: 'Este código de invitación ya no está activo' }
  if (ic.expiresAt && new Date(ic.expiresAt) < new Date()) {
    throw { status: 400, error: 'Este código de invitación venció' }
  }
  if (ic.maxUses != null && ic.usesCount >= ic.maxUses) {
    throw { status: 400, error: 'Este código de invitación ya alcanzó su cupo de usos' }
  }
  return ic
}

/**
 * Crea (si corresponde) el Cupón de Stripe que implementa el beneficio, para que se aplique
 * solo más adelante en el Checkout del workspace (ver billing.controller.js `createCheckout`).
 * Devuelve null para tipos que no requieren Stripe (`extra_trial_days`/`custom`) o si Stripe
 * no está configurado en este entorno — el código sigue funcionando para trackear el uso,
 * simplemente no hay auto-aplicación del descuento.
 */
async function createStripeCouponForBenefit(ic) {
  if (!stripe) return null

  if (ic.benefitType === 'discount_percent') {
    const coupon = await stripe.coupons.create({
      percent_off: ic.benefitValue,
      duration:    'forever',
      name:        ic.code,
    })
    return coupon.id
  }

  if (ic.benefitType === 'discount_fixed') {
    const coupon = await stripe.coupons.create({
      amount_off: ic.benefitValue,
      currency:   ic.currency || 'usd',
      duration:   'forever',
      name:       ic.code,
    })
    return coupon.id
  }

  if (ic.benefitType === 'free_months') {
    const coupon = await stripe.coupons.create({
      percent_off:        100,
      duration:            'repeating',
      duration_in_months:  ic.benefitValue,
      name:                ic.code,
    })
    return coupon.id
  }

  return null // extra_trial_days / custom — sin efecto en Stripe
}

module.exports = { BENEFIT_TYPES, normalizeCode, describeBenefit, validateCodeForRedemption, createStripeCouponForBenefit }
