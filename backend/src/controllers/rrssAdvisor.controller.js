const { generateRrssAdvisor, PLATFORMS } = require('../services/rrssAdvisor.service')

/**
 * POST /api/marketing/projects/:id/rrss/:platform/advisor
 * Errores propios del servicio traen `err.status`/`err.code` — mismo criterio que
 * adsAdvisor.controller.js. A diferencia de Ads, acá no hay llamadas a APIs externas
 * en el momento (usa snapshots ya guardados), así que no hace falta el manejo de
 * errores de axios.
 */
async function run(req, res, next) {
  try {
    const projectId = Number(req.params.id)
    const platform   = req.params.platform
    if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: 'Red social inválida' })

    const result = await generateRrssAdvisor({
      projectId, workspaceId: req.workspace.id, userId: req.user.userId,
      platform, tz: req.workspace.timezone,
    })
    res.json(result)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code })
    next(err)
  }
}

module.exports = { run }
