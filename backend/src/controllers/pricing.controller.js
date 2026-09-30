const { getSettings } = require('../lib/platformSettings')

/**
 * GET /api/public/pricing  (público, sin auth)
 * Pricing vigente para la Landing y /pricing — misma fuente que usa
 * SuperAdmin → Configuración → Comercial, para que un cambio ahí se
 * refleje sin tocar código.
 */
async function getPublicPricing(req, res, next) {
  try {
    const { pricingTiers, freeSeatLimit, trialDays } = await getSettings([
      'pricingTiers', 'freeSeatLimit', 'trialDays',
    ])
    res.json({ pricingTiers, freeSeatLimit, trialDays })
  } catch (err) { next(err) }
}

module.exports = { getPublicPricing }
