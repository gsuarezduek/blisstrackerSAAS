const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')
const { callApi } = require('../mcp/apiBridge')
const { isProjectMember } = require('../lib/projectAccess')

const { saveMonthSnapshot: saveGA4Snapshot }            = require('./analyticsSnapshot.service')
const { saveMonthSnapshot: saveSearchConsoleSnapshot }  = require('./searchConsoleSnapshot.service')
const { refreshProjectDomainRating }                    = require('./ahrefs.service')
const { saveMonthKeywordRankings, currentMonthStr }     = require('./keywordTracking.service')
const { refreshScrapeForIntegration: refreshInstagramScrape } = require('../controllers/instagram.controller')
const { refreshScrapeForIntegration: refreshFacebookScrape }  = require('../controllers/facebook.controller')
const { refreshScrapeForIntegration: refreshLinkedinScrape }  = require('../controllers/linkedin.controller')

// Refresco masivo de fuentes de Marketing — ver "Marketing refresh masivo (MCP)"
// en backend/CLAUDE.md. Cada fuente mapea a la MISMA acción real que su botón
// "Actualizar"/"Analizar" en la UI (o, si la fuente es siempre-en-vivo, a leerla
// una vez para disparar su auto-snapshot) — no se duplica lógica de negocio:
// las que ya tienen un endpoint propio se llaman por loopback HTTP (mismo truco
// que mcp/apiBridge.js), las que solo existen como función de cron (GA4,
// Search Console, Keywords, Domain Rating) se llaman directo.

const ALL_SOURCES = [
  'analytics', 'search_console', 'domain_rating', 'keywords',
  'instagram', 'facebook', 'linkedin', 'tiktok', 'youtube',
  'google_ads', 'meta_ads', 'pagespeed',
]
// pagespeed consume cuota real de la API de Google (2 llamadas por proyecto) —
// queda afuera del default, solo corre si se pide explícito en `sources`.
const DEFAULT_SOURCES = ALL_SOURCES.filter(s => s !== 'pagespeed')

const INTEGRATION_TYPE = {
  analytics:      'google_analytics',
  search_console: 'google_search_console',
  instagram:      'instagram',
  facebook:       'facebook',
  linkedin:       'linkedin',
  tiktok:         'tiktok',
  youtube:        'google_youtube',
  google_ads:     'google_ads',
  meta_ads:       'meta_ads',
}

const LIVE_PATH = {
  instagram:  id => `/marketing/projects/${id}/instagram`,
  facebook:   id => `/marketing/projects/${id}/facebook`,
  linkedin:   id => `/marketing/projects/${id}/linkedin`,
  tiktok:     id => `/marketing/projects/${id}/tiktok`,
  youtube:    id => `/marketing/projects/${id}/youtube`,
  google_ads: id => `/marketing/projects/${id}/google-ads`,
  meta_ads:   id => `/marketing/projects/${id}/meta-ads`,
}

const SCRAPE_REFRESH = {
  instagram: refreshInstagramScrape,
  facebook:  refreshFacebookScrape,
  linkedin:  refreshLinkedinScrape,
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function liveGet(source, projectId, identity) {
  const { status, data } = await callApi(identity, 'GET', LIVE_PATH[source](projectId))
  if (status >= 400) return { status: 'error', detail: data?.error || `HTTP ${status}` }
  return { status: 'ok' }
}

async function pollPageSpeedResult(projectId, resultId, identity, { intervalMs = 3000, timeoutMs = 90000 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const { data } = await callApi(identity, 'GET', `/marketing/projects/${projectId}/pagespeed/${resultId}`)
    if (data?.status === 'done')  return 'ok'
    if (data?.status === 'error') return `error (${data.errorMsg || 'desconocido'})`
    await sleep(intervalMs)
  }
  return 'timeout'
}

async function runPageSpeed(projectId, identity) {
  const details = []
  for (const strategy of ['mobile', 'desktop']) {
    const { status, data } = await callApi(identity, 'POST', `/marketing/projects/${projectId}/pagespeed`, { body: { strategy } })
    if (status >= 400) { details.push(`${strategy}: ${data?.error || `HTTP ${status}`}`); continue }
    const outcome = await pollPageSpeedResult(projectId, data.resultId, identity)
    details.push(`${strategy}: ${outcome}`)
  }
  const hasError = details.some(d => !d.endsWith(': ok'))
  return { status: hasError ? 'error' : 'ok', detail: details.join(' · ') }
}

// Corre UNA fuente para UN proyecto. Nunca lanza — siempre devuelve
// { status: 'ok'|'error'|'not_connected'|'cooldown', detail?, waitMinutes? }.
async function runForProjectSource(source, project, integrationsByType, identity) {
  try {
    switch (source) {
      case 'analytics': {
        const integ = integrationsByType[INTEGRATION_TYPE.analytics]
        if (!integ) return { status: 'not_connected' }
        const month = todayString(project.timezone).slice(0, 7)
        await saveGA4Snapshot(project.id, project.workspaceId, month)
        return { status: 'ok' }
      }
      case 'search_console': {
        const integ = integrationsByType[INTEGRATION_TYPE.search_console]
        if (!integ) return { status: 'not_connected' }
        const month = todayString(project.timezone).slice(0, 7)
        await saveSearchConsoleSnapshot(project.id, project.workspaceId, month)
        return { status: 'ok' }
      }
      case 'domain_rating': {
        if (!project.websiteUrl) return { status: 'not_connected' }
        await refreshProjectDomainRating({ id: project.id, websiteUrl: project.websiteUrl })
        return { status: 'ok' }
      }
      case 'keywords': {
        const count = await prisma.trackedKeyword.count({ where: { projectId: project.id } })
        if (count === 0) return { status: 'not_connected' }
        await saveMonthKeywordRankings(project.id, project.workspaceId, currentMonthStr())
        return { status: 'ok' }
      }
      case 'instagram':
      case 'facebook':
      case 'linkedin': {
        const integ = integrationsByType[INTEGRATION_TYPE[source]]
        if (!integ) return { status: 'not_connected' }
        if (integ.scopes === 'scrape') {
          const r = await SCRAPE_REFRESH[source](integ, project.id, project.workspaceId)
          if (r.status === 'ok')       return { status: 'ok' }
          if (r.status === 'cooldown') return { status: 'cooldown', waitMinutes: r.waitMins }
          return { status: 'error', detail: r.message }
        }
        return await liveGet(source, project.id, identity)
      }
      case 'tiktok':
      case 'youtube':
      case 'google_ads':
      case 'meta_ads': {
        const integ = integrationsByType[INTEGRATION_TYPE[source]]
        if (!integ) return { status: 'not_connected' }
        return await liveGet(source, project.id, identity)
      }
      case 'pagespeed': {
        if (!project.websiteUrl) return { status: 'not_connected' }
        return await runPageSpeed(project.id, identity)
      }
      default:
        return { status: 'error', detail: `Fuente desconocida: ${source}` }
    }
  } catch (err) {
    return { status: 'error', detail: err.message }
  }
}

async function resolveTargetProjects(job) {
  const where = { workspaceId: job.workspaceId, active: true }
  if (job.projectId) where.id = job.projectId
  const projects = await prisma.project.findMany({
    where,
    select: { id: true, name: true, workspaceId: true, websiteUrl: true, isPrivate: true },
  })

  // El projectId puntual ya se validó (privacidad) al crear el job. Para "todos
  // los proyectos" filtramos los privados a los que el actor no tiene acceso —
  // mismo criterio que requireProjectAccessPrefix (admin/owner o equipo del proyecto).
  if (job.projectId) return projects

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: job.workspaceId, userId: job.requestedByUserId } },
    select: { role: true },
  })
  const isAdminActor = member?.role === 'admin' || member?.role === 'owner'
  if (isAdminActor) return projects

  const visible = []
  for (const p of projects) {
    if (!p.isPrivate || await isProjectMember(p.id, job.requestedByUserId)) visible.push(p)
  }
  return visible
}

// Orquestador async — se dispara con setImmediate desde el controller y nunca
// bloquea la respuesta HTTP. Va actualizando `results` a medida que termina cada
// proyecto×fuente, para que el polling (marketing_refresh_status) muestre progreso
// real, no solo el resultado final.
async function runRefreshJob(jobId) {
  try {
    const job = await prisma.marketingRefreshJob.findUnique({ where: { id: jobId } })
    if (!job) return

    const workspace = await prisma.workspace.findUnique({
      where: { id: job.workspaceId },
      select: { slug: true, timezone: true },
    })
    const identity = { userId: job.requestedByUserId, workspaceSlug: workspace.slug }
    const requested = JSON.parse(job.sources || '[]')
    const sources = requested.length ? requested : DEFAULT_SOURCES

    const projects = await resolveTargetProjects(job)
    const results = []

    for (const project of projects) {
      const integrations = await prisma.projectIntegration.findMany({ where: { projectId: project.id } })
      const integrationsByType = Object.fromEntries(integrations.map(i => [i.type, i]))
      const projectWithTz = { ...project, timezone: workspace.timezone }

      for (const source of sources) {
        const outcome = await runForProjectSource(source, projectWithTz, integrationsByType, identity)
        results.push({ projectId: project.id, projectName: project.name, source, ...outcome })
        await prisma.marketingRefreshJob.update({
          where: { id: jobId },
          data:  { results: JSON.stringify(results) },
        }).catch(() => {})
      }
    }

    await prisma.marketingRefreshJob.update({
      where: { id: jobId },
      data:  { status: 'completed', finishedAt: new Date() },
    })
  } catch (err) {
    console.error('[MarketingRefresh] Error en job', jobId, ':', err.message)
    await prisma.marketingRefreshJob.update({
      where: { id: jobId },
      data:  { status: 'failed', errorMsg: err.message, finishedAt: new Date() },
    }).catch(() => {})
  }
}

module.exports = { ALL_SOURCES, DEFAULT_SOURCES, runRefreshJob }
