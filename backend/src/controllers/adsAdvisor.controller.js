const { generateAdsAdvisor } = require('../services/adsAdvisor.service')

// Errores propios del servicio (resolveIntegration, proyecto no encontrado, presupuesto
// de tokens) traen `err.status`/`err.code` — mismo criterio que contentBrief.controller.js.
// Errores de la API de Meta/Google (axios) se degradan a 400 con el mensaje que traiga la
// API en vez de un 500 opaco. IMPORTANTE: se chequea `err.response?.data` PRIMERO — axios
// (1.x) también adjunta un `err.status` propio a sus errores (espejo de `response.status`),
// así que si chequeáramos `err.status` primero, un error de la API de Meta/Google con estado
// 400 caería en esa rama y perderíamos el mensaje real de la API (`err.message` sería el
// genérico "Request failed with status code 400" de axios, no el de Facebook/Google).
function handleAdvisorError(err, res, next) {
  if (err.response?.data) {
    const apiErr = err.response.data.error
    return res.status(400).json({ error: apiErr?.message || 'Error al traer datos de la plataforma de anuncios.' })
  }
  if (err.status) return res.status(err.status).json({ error: err.message, code: err.code })
  next(err)
}

/**
 * POST /api/marketing/projects/:id/meta-ads/advisor?datePreset=this_month
 */
async function runMetaAdvisor(req, res, next) {
  try {
    const projectId  = Number(req.params.id)
    const datePreset = req.query.datePreset || 'this_month'
    const result = await generateAdsAdvisor({
      projectId, workspaceId: req.workspace.id, userId: req.user.userId,
      platform: 'meta_ads', datePreset, tz: req.workspace.timezone,
    })
    res.json(result)
  } catch (err) { handleAdvisorError(err, res, next) }
}

/**
 * POST /api/marketing/projects/:id/google-ads/advisor?datePreset=this_month
 */
async function runGoogleAdvisor(req, res, next) {
  try {
    const projectId  = Number(req.params.id)
    const datePreset = req.query.datePreset || 'this_month'
    const result = await generateAdsAdvisor({
      projectId, workspaceId: req.workspace.id, userId: req.user.userId,
      platform: 'google_ads', datePreset, tz: req.workspace.timezone,
    })
    res.json(result)
  } catch (err) { handleAdvisorError(err, res, next) }
}

module.exports = { runMetaAdvisor, runGoogleAdvisor }
