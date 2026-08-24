const prisma = require('../lib/prisma')
const { querySearchConsole } = require('../services/googleSearchConsole.service')
const { getValidAccessToken } = require('../services/tokenRefresh.service')
const { normalizeSiteUrl } = require('../utils/seo')
const { computeSeoActionItems } = require('../services/seoActionPlan.service')

// ─── Helpers de fechas ────────────────────────────────────────────────────────

function defaultDates(days = 28) {
  const end   = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
}

// Período anterior equivalente (misma cantidad de días, inmediatamente antes)
function previousPeriod(startDate, endDate) {
  const s    = new Date(startDate)
  const e    = new Date(endDate)
  const days = Math.round((e - s) / 86400000) + 1
  const prevEnd   = new Date(s.getTime() - 86400000)
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000)
  return { startDate: prevStart.toISOString().slice(0, 10), endDate: prevEnd.toISOString().slice(0, 10) }
}

function mapRow(r) {
  return {
    key:         r.keys[0],
    clicks:      r.clicks      ?? 0,
    impressions: r.impressions ?? 0,
    ctr:         r.ctr         ?? 0,
    position:    r.position    ?? 0,
  }
}

// ─── Agrupamiento de variantes casi idénticas (mismo intent de búsqueda) ────────

// Stopwords en español que no cambian la intención (de, en, el, para…).
const STOPWORDS = new Set(['de', 'en', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'para', 'por', 'a', 'y', 'o', 'con', 'del', 'al', 'e', 'u', 'lo'])

// Clave canónica de una query: minúsculas, sin acentos, sin stopwords, con
// singularización cruda (quita 's' final en palabras >3 chars) y tokens ordenados.
// Así "alquiler de autos en mendoza" y "alquiler de auto mendoza" caen en el mismo grupo.
function canonicalKey(q) {
  const tokens = String(q).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/).filter(Boolean)
    .filter(t => !STOPWORDS.has(t))
    .map(t => (t.length > 3 && t.endsWith('s')) ? t.slice(0, -1) : t)
  return [...new Set(tokens)].sort().join(' ')
}

// Agrupa un conjunto de queries (striking distance) por intención. Cada cluster suma
// impresiones/clicks de sus variantes; la variante de más impresiones es la representativa.
function clusterQueries(items) {
  const map = new Map()
  for (const it of items) {
    const key = canonicalKey(it.query) || it.query
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(it)
  }
  const clusters = []
  for (const variants of map.values()) {
    variants.sort((a, b) => b.impressions - a.impressions)
    const rep         = variants[0]
    const impressions = variants.reduce((s, v) => s + v.impressions, 0)
    const clicks      = variants.reduce((s, v) => s + v.clicks, 0)
    const position    = impressions
      ? parseFloat((variants.reduce((s, v) => s + v.position * v.impressions, 0) / impressions).toFixed(1))
      : rep.position
    clusters.push({
      query:        rep.query,
      position,
      impressions,
      clicks,
      ctr:          impressions ? clicks / impressions : 0,
      zone:         position <= 10 ? 'casi_top3' : 'pagina_2',
      variantCount: variants.length,
      variants:     variants.map(v => ({ query: v.query, impressions: v.impressions, clicks: v.clicks, ctr: v.ctr, position: v.position })),
    })
  }
  return clusters.sort((a, b) => b.impressions - a.impressions).slice(0, 25)
}

// Resuelve proyecto + integración GSC + siteUrl. Devuelve { error } si algo falta.
async function resolveGsc(projectId, workspaceId) {
  const [project, integration] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true, name: true, websiteUrl: true },
    }),
    prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'google_search_console' } },
    }),
  ])
  if (!project)     return { error: { status: 404, body: { error: 'Proyecto no encontrado' } } }
  if (!integration) return { error: { status: 400, body: { error: 'Google Search Console no conectado para este proyecto.', code: 'NO_INTEGRATION' } } }
  if (integration.status !== 'active') {
    return { error: { status: 400, body: { error: 'La integración de Search Console expiró o tiene un error. Reconectala desde la pestaña SEO.', code: 'TOKEN_EXPIRED' } } }
  }
  const siteUrl = normalizeSiteUrl(integration.propertyId || project.websiteUrl)
  if (!siteUrl) {
    return { error: { status: 400, body: { error: 'No hay URL de sitio configurada. Agregala en la pestaña Info del proyecto.', code: 'NO_SITE_URL' } } }
  }
  return { project, integration, siteUrl }
}

// Marca la integración GSC como expirada cuando el token fue revocado
async function markExpiredIfTokenError(projectId, err) {
  const status = err.httpStatus ?? err.response?.status
  const isTokenErr = status === 401 ||
    err.code === 'TOKEN_EXPIRED' ||
    err.message?.includes('invalid_grant') ||
    err.message?.includes('Token has been expired') ||
    err.message?.includes('UNAUTHENTICATED')
  if (!isTokenErr) return false
  await prisma.projectIntegration.update({
    where: { projectId_type: { projectId, type: 'google_search_console' } },
    data:  { status: 'expired' },
  }).catch(() => {})
  return true
}

/**
 * GET /api/marketing/projects/:id/seo/opportunities
 * Oportunidades accionables derivadas de GSC (sin persistir, sin IA):
 *  - strikingDistance: queries en posición 4-20 (a un empujón del top 3)
 *  - lowCtr: páginas con muchas impresiones y CTR bajo
 *  - decay: queries y páginas que perdieron clicks/posición vs período anterior
 */
async function getOpportunities(req, res, next) {
  const projectId   = Number(req.params.id)
  const workspaceId = req.workspace.id
  try {
    const resolved = await resolveGsc(projectId, workspaceId)
    if (resolved.error) return res.status(resolved.error.status).json(resolved.error.body)
    const { integration, siteUrl, project } = resolved

    const cur  = defaultDates(28)
    const prev = previousPeriod(cur.startDate, cur.endDate)

    const accessToken = await getValidAccessToken(integration)
    const q = (body) => querySearchConsole(accessToken, siteUrl, { type: 'web', ...body })

    const [curQueries, prevQueries, curPages, prevPages] = await Promise.all([
      q({ startDate: cur.startDate,  endDate: cur.endDate,  dimensions: ['query'], rowLimit: 250 }),
      q({ startDate: prev.startDate, endDate: prev.endDate, dimensions: ['query'], rowLimit: 250 }).catch(() => []),
      q({ startDate: cur.startDate,  endDate: cur.endDate,  dimensions: ['page'],  rowLimit: 100 }),
      q({ startDate: prev.startDate, endDate: prev.endDate, dimensions: ['page'],  rowLimit: 100 }).catch(() => []),
    ])

    const curQ = curQueries.map(mapRow)
    const curP = curPages.map(mapRow)

    // Striking distance: posición 4-20 con impresiones relevantes, agrupadas por
    // intención (variantes casi idénticas colapsan en un solo cluster).
    const strikingCandidates = curQ
      .filter(r => r.position >= 3.5 && r.position <= 20 && r.impressions >= 20)
      .map(r => ({ query: r.key, position: parseFloat(r.position.toFixed(1)), impressions: r.impressions, clicks: r.clicks, ctr: r.ctr }))
    const strikingDistance = clusterQueries(strikingCandidates)

    // CTR bajo: páginas con muchas impresiones y CTR < 5%
    const lowCtr = curP
      .filter(r => r.impressions > 50 && r.ctr < 0.05)
      .map(r => ({ page: r.key, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, position: parseFloat(r.position.toFixed(1)) }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 15)

    // Content decay: cayeron clicks o posición vs período anterior
    const decayQueries = buildDecay(curQ, prevQueries.map(mapRow), 'query').slice(0, 20)
    const decayPages   = buildDecay(curP, prevPages.map(mapRow),   'page').slice(0, 15)

    res.json({
      connected: true,
      period: { current: cur, previous: prev },
      projectName: project.name,
      strikingDistance,
      lowCtr,
      decay: { queries: decayQueries, pages: decayPages },
      counts: {
        strikingDistance: strikingDistance.length,
        lowCtr:           lowCtr.length,
        decayQueries:     decayQueries.length,
        decayPages:       decayPages.length,
      },
    })
  } catch (err) {
    if (await markExpiredIfTokenError(projectId, err)) {
      return res.status(400).json({ error: 'El token de Google expiró. Reconectá Search Console.', code: 'TOKEN_EXPIRED' })
    }
    next(err)
  }
}

// Une período actual y anterior por clave; devuelve los que empeoraron, ordenados por clicks perdidos
function buildDecay(current, previous, label) {
  const prevMap = {}
  for (const r of previous) prevMap[r.key] = r
  const out = []
  for (const c of current) {
    const p = prevMap[c.key]
    if (!p || p.clicks < 3) continue // ignorar ruido sin histórico relevante
    const clicksDelta   = c.clicks   - p.clicks
    const positionDelta = parseFloat((c.position - p.position).toFixed(2)) // positivo = empeoró
    if (clicksDelta >= 0 && positionDelta <= 1) continue // no empeoró
    out.push({
      [label]:       c.key,
      position:      parseFloat(c.position.toFixed(1)),
      prevPosition:  parseFloat(p.position.toFixed(1)),
      positionDelta,
      clicks:        c.clicks,
      prevClicks:    p.clicks,
      clicksDelta,
      impressions:   c.impressions,
    })
  }
  return out.sort((a, b) => a.clicksDelta - b.clicksDelta) // más pérdida primero
}

// ─── Plan de acción ─────────────────────────────────────────────────────────

/**
 * GET /api/marketing/projects/:id/seo/action-plan
 * Wrapper delgado sobre computeSeoActionItems (extraído a seoActionPlan.service.js
 * para reusarlo también desde el panel cross-área "Hoy" — marketingPending.service.js).
 */
async function getActionPlan(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const result = await computeSeoActionItems({ projectId, workspaceId })
    if (!result) return res.status(404).json({ error: 'Proyecto no encontrado' })
    res.json(result)
  } catch (err) { next(err) }
}

module.exports = { getOpportunities, getActionPlan }
