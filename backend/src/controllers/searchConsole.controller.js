const prisma = require('../lib/prisma')
const { fetchSearchConsoleData, fetchQueryPages, querySearchConsole } = require('../services/googleSearchConsole.service')
const { getValidAccessToken } = require('../services/tokenRefresh.service')
const { normalizeSiteUrl } = require('../utils/seo')
const { saveMonthSnapshot, generateSeoAiInsights } = require('../services/searchConsoleSnapshot.service')

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

    const device  = req.query.device  || null
    const compare = req.query.compare === 'true'
    const data = await fetchSearchConsoleData(integration, siteUrl, startDate, endDate, { device, compare })
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
      }).catch(err => console.error('[SearchConsole] Error al marcar integración como error:', err.message))
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

/**
 * GET /api/marketing/projects/:id/search-console/query-pages?query=...&startDate=...&endDate=...
 */
async function getQueryPages(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { query, startDate, endDate } = req.query

    if (!query?.trim()) return res.status(400).json({ error: 'query requerida' })

    const defaults = defaultDates(28)
    const start    = parseDateParam(startDate, defaults.startDate)
    const end      = parseDateParam(endDate,   defaults.endDate)

    const [project, integration] = await Promise.all([
      prisma.project.findFirst({
        where: { id: projectId, workspaceId },
        select: { id: true, websiteUrl: true },
      }),
      prisma.projectIntegration.findUnique({
        where: { projectId_type: { projectId, type: 'google_search_console' } },
      }),
    ])
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!integration || integration.status !== 'active') {
      return res.status(400).json({ error: 'GSC no conectado', status: 'no_integration' })
    }

    const siteUrl = normalizeSiteUrl(integration.propertyId || project.websiteUrl)
    if (!siteUrl) return res.status(400).json({ error: 'No hay URL de sitio configurada' })

    const accessToken = await getValidAccessToken(integration)
    const pages = await fetchQueryPages(accessToken, siteUrl, query.trim(), start, end)
    res.json({ query: query.trim(), pages })
  } catch (err) { next(err) }
}

// ─── SEO Snapshots ────────────────────────────────────────────────────────────

function parseSnapshot(snap) {
  return {
    ...snap,
    devices:    JSON.parse(snap.devices),
    countries:  JSON.parse(snap.countries),
    topQueries: JSON.parse(snap.topQueries),
    topPages:   JSON.parse(snap.topPages),
  }
}

/**
 * GET /api/marketing/projects/:id/seo/snapshot/:month
 * Devuelve el snapshot guardado para un mes (YYYY-MM). 404 si no existe.
 */
async function getSeoSnapshot(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month }   = req.params

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month debe tener formato YYYY-MM' })
    }

    const snap = await prisma.searchConsoleSnapshot.findUnique({
      where: { projectId_month: { projectId, month } },
    })

    if (!snap) return res.status(404).json({ error: 'Sin datos para este mes' })
    res.json(parseSnapshot(snap))
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/seo/snapshots
 * Guarda manualmente un snapshot. body: { month: 'YYYY-MM' }
 */
async function saveSeoSnapshot(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month }   = req.body

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month debe tener formato YYYY-MM' })
    }

    const snap = await saveMonthSnapshot(projectId, workspaceId, month)
    if (!snap) {
      return res.status(400).json({
        error: 'No se pudo guardar el snapshot. Verificá que GSC esté conectado y activo.',
      })
    }
    res.json(parseSnapshot(snap))
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/seo/ai-insights
 * Devuelve el análisis IA guardado (si existe) con tiempo de cooldown.
 */
async function getSeoAiInsights(req, res, next) {
  try {
    const projectId = Number(req.params.id)
    const existing  = await prisma.seoAiInsight.findUnique({ where: { projectId } })

    if (!existing) return res.json({ insight: null, cooldownRemaining: 0 })

    const ageMs   = Date.now() - new Date(existing.generatedAt).getTime()
    const cooldown = Math.max(0, 60 * 60 * 1000 - ageMs)

    res.json({
      insight:           JSON.parse(existing.content),
      generatedAt:       existing.generatedAt,
      cooldownRemaining: Math.ceil(cooldown / 60000),
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/seo/ai-insights
 * (Re)genera el análisis IA con datos live de los últimos 30 días.
 */
async function createSeoAiInsights(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    // Cooldown de 1 hora
    const existing = await prisma.seoAiInsight.findUnique({ where: { projectId } })
    if (existing) {
      const ageMs = Date.now() - new Date(existing.generatedAt).getTime()
      if (ageMs < 60 * 60 * 1000) {
        const waitMins = Math.ceil((60 * 60 * 1000 - ageMs) / 60000)
        return res.status(429).json({ error: `Esperá ${waitMins} min antes de regenerar.`, waitMins })
      }
    }

    const [project, integration] = await Promise.all([
      prisma.project.findFirst({
        where:  { id: projectId, workspaceId },
        select: { id: true, name: true, websiteUrl: true },
      }),
      prisma.projectIntegration.findUnique({
        where:  { projectId_type: { projectId, type: 'google_search_console' } },
      }),
    ])

    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!integration || integration.status !== 'active') {
      return res.status(400).json({ error: 'Google Search Console no conectado o inactivo' })
    }

    const siteUrl = normalizeSiteUrl(integration.propertyId || project.websiteUrl)
    if (!siteUrl) return res.status(400).json({ error: 'No hay URL de sitio configurada' })

    const end   = new Date()
    const start = new Date(); start.setDate(start.getDate() - 30)

    const liveData = await fetchSearchConsoleData(
      integration, siteUrl,
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10),
      { compare: true },
    )

    const insight = await generateSeoAiInsights(projectId, workspaceId, liveData)
    res.json({ insight, generatedAt: new Date(), cooldownRemaining: 60 })
  } catch (err) { next(err) }
}

module.exports = {
  getSearchConsoleData, getQueryPages,
  getSeoSnapshot, saveSeoSnapshot,
  getSeoAiInsights, createSeoAiInsights,
}
