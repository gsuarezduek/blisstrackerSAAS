const prisma = require('../lib/prisma')
const { fetchSearchConsoleData } = require('../services/googleSearchConsole.service')
const { normalizeSiteUrl } = require('../utils/seo')

// Acepta 'YYYY-MM-DD' solamente (Search Console no acepta 'NdaysAgo')
const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/

function parseDateParam(val, fallback) {
  if (val && VALID_DATE.test(val.trim())) return val.trim()
  return fallback
}


function defaultDates(days = 28) {
  const end   = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate:   end.toISOString().slice(0, 10),
  }
}

/**
 * GET /api/marketing/projects/:id/search-console?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
async function getSearchConsoleData(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const defaults  = defaultDates(28)
    const startDate = parseDateParam(req.query.startDate, defaults.startDate)
    const endDate   = parseDateParam(req.query.endDate,   defaults.endDate)

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true, name: true, websiteUrl: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const integration = await prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'google_search_console' } },
    })

    if (!integration) {
      return res.status(404).json({ error: 'Google Search Console no conectado para este proyecto' })
    }

    if (integration.status === 'error') {
      return res.status(400).json({
        error: 'La integración tiene un error. Desconectá y volvé a conectar Search Console.',
        status: 'error',
      })
    }

    // Si el usuario guardó un Site URL específico lo usamos; si no, recurrimos a websiteUrl del proyecto
    const siteUrl = normalizeSiteUrl(integration.propertyId || project.websiteUrl)
    if (!siteUrl) {
      return res.status(400).json({
        error: 'No hay URL de sitio configurada. Agregá la URL en la tab Info del proyecto.',
        status: 'no_site_url',
      })
    }

    const data = await fetchSearchConsoleData(integration, siteUrl, startDate, endDate)
    res.json({ ...data, projectName: project.name })
  } catch (err) {
    const status = err.httpStatus ?? err.response?.status
    console.error('[searchConsole] error HTTP %s: %s', status ?? '?', err.message)

    // Token revocado / expirado
    if (
      status === 401 ||
      err.message?.includes('invalid_grant') ||
      err.message?.includes('Token has been expired') ||
      err.message?.includes('UNAUTHENTICATED')
    ) {
      await prisma.projectIntegration.update({
        where: { projectId_type: { projectId: Number(req.params.id), type: 'google_search_console' } },
        data:  { status: 'error' },
      }).catch(() => {})
      return res.status(401).json({
        error: 'Token revocado. Desconectá y volvé a conectar Search Console.',
        status: 'revoked',
      })
    }

    // 403: dos sub-casos — API no habilitada vs sin permisos sobre la propiedad
    if (status === 403) {
      if (
        err.message?.includes('has not been used') ||
        err.message?.includes('is disabled') ||
        err.message?.includes('API has not been')
      ) {
        return res.status(400).json({
          error: 'La Google Search Console API no está habilitada en Google Cloud Console. Habilitala en APIs y servicios → Biblioteca.',
          status: 'api_disabled',
        })
      }
      return res.status(403).json({
        error: 'Sin acceso a esta propiedad de Search Console. Verificá que la cuenta conectada tiene permisos sobre el sitio.',
        status: 'no_access',
      })
    }

    // 400: URL inválida u otro error de request
    if (status === 400) {
      return res.status(400).json({
        error: `URL de sitio inválida para Search Console: ${err.message}`,
        status: 'bad_url',
      })
    }

    next(err)
  }
}

module.exports = { getSearchConsoleData }
