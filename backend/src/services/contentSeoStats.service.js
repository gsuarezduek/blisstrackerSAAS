// Cruce del inventario de notas con Search Console: para cada pieza con URL
// publicada, cómo le fue en los últimos 28 días, cómo venía en los 28
// anteriores, sus 5 consultas principales y las alertas que salen de comparar
// las dos ventanas.
//
// ── Por qué 3 queries y no una por nota ─────────────────────────────────────
// Pedirle a Search Console los datos de CADA nota por separado serían 65 (o
// 300) requests por refresh, con su rate limit y su latencia. En vez de eso se
// pide el sitio entero agrupado por página (una query por ventana) más una por
// página+consulta, y el match nota↔URL se hace acá en memoria. El costo no
// depende de cuántas notas tenga el blog.

const prisma = require('../lib/prisma')
const { querySearchConsole } = require('./googleSearchConsole.service')
const { getValidAccessToken } = require('./tokenRefresh.service')
const { normalizeSiteUrl } = require('../utils/seo')
const {
  normalizeUrl, buildKeywordOwners, computeAlerts,
} = require('../lib/contentSeo')

// Search Console publica con 2-3 días de atraso: una ventana que llegue hasta
// hoy mete dos días vacíos que se leen como una caída. Mismo criterio que
// MIN_VERIFY_DAYS en lib/cannibalResolution.js.
const LAG_DAYS    = 3
const WINDOW_DAYS = 28 // el período del pedido: "los últimos 28 días"

const GSC_ROW_LIMIT   = 25000 // tope de la API por request
const TOP_QUERIES     = 5

// Tope de refrescos: un refresh son 3 queries a Search Console, y la vista lo
// dispara sola al abrirse. Sin esto, tener el inventario abierto en dos
// pestañas gasta la cuota de la API del cliente.
const MIN_INTERVAL_MS = 10 * 60 * 1000

// Un refresh por proyecto a la vez (mismo criterio en memoria que los locks de
// los crons): dos corriendo juntos harían el doble de requests para escribir
// exactamente lo mismo.
const running = new Map()

function err(message, httpStatus, code) {
  return Object.assign(new Error(message), { httpStatus, code })
}

/** "YYYY-MM-DD" a `days` días de hoy (negativo = hacia atrás). */
function dayStr(offsetDays) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

/**
 * Las dos ventanas de 28 días: la actual (terminando donde hay datos) y la
 * inmediatamente anterior, para la variación.
 */
function windows() {
  const end   = dayStr(-LAG_DAYS)
  const start = dayStr(-LAG_DAYS - WINDOW_DAYS + 1)
  const prevEnd   = dayStr(-LAG_DAYS - WINDOW_DAYS)
  const prevStart = dayStr(-LAG_DAYS - WINDOW_DAYS * 2 + 1)
  return { start, end, prevStart, prevEnd }
}

function metricsOf(row) {
  return {
    clicks:      Math.round(row.clicks ?? 0),
    impressions: Math.round(row.impressions ?? 0),
    ctr:         row.ctr ?? 0,
    position:    row.position ?? 0,
  }
}

/** Mapa URL normalizada → métricas, a partir de filas con dimensions ['page']. */
function byPage(rows) {
  const map = new Map()
  for (const row of rows) {
    const page = row.keys?.[0]
    if (!page) continue
    map.set(normalizeUrl(page), metricsOf(row))
  }
  return map
}

/** Mapa URL normalizada → top consultas, a partir de dimensions ['page','query']. */
function queriesByPage(rows) {
  const map = new Map()
  for (const row of rows) {
    const [page, query] = row.keys ?? []
    if (!page || !query) continue
    const key = normalizeUrl(page)
    const list = map.get(key) ?? []
    list.push({ query, ...metricsOf(row) })
    map.set(key, list)
  }
  for (const [key, list] of map) {
    list.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    map.set(key, list.slice(0, TOP_QUERIES))
  }
  return map
}

function safeArr(json) {
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : [] } catch { return [] }
}

/**
 * Queries que el equipo ya marcó como resueltas en Canibalización. Volver a
 * alertarlas desde el inventario sería pedir dos veces el mismo trabajo — el
 * módulo de canibalización es el dueño de ese veredicto, acá sólo se respeta.
 */
async function resolvedCannibalQueries(projectId) {
  const rows = await prisma.cannibalResolution.findMany({
    where:  { projectId, status: 'resolved' },
    select: { query: true },
  })
  return new Set(rows.map(r => String(r.query).trim().toLowerCase()))
}

/**
 * Integración de Search Console del proyecto + el sitio sobre el que consultar.
 * Mismo criterio que searchConsole.controller.js: el Site URL guardado en la
 * integración manda sobre el websiteUrl del proyecto.
 */
async function resolveSite(projectId, workspaceId) {
  const [integration, project] = await Promise.all([
    prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'google_search_console' } },
    }),
    prisma.project.findFirst({
      where:  { id: projectId, workspaceId },
      select: { websiteUrl: true },
    }),
  ])

  if (!integration || integration.status !== 'active') {
    throw err('Search Console no está conectado para este proyecto.', 400, 'NO_SEARCH_CONSOLE')
  }
  const siteUrl = normalizeSiteUrl(integration.propertyId || project?.websiteUrl)
  if (!siteUrl) {
    throw err('No hay URL de sitio configurada. Agregala en la ficha del proyecto → Ajustes.', 400, 'NO_SITE_URL')
  }
  return { integration, siteUrl }
}

/**
 * Refresca las métricas de todas las notas publicadas de un proyecto.
 *
 * @param {number}  projectId
 * @param {number}  workspaceId
 * @param {boolean} force — saltea el intervalo mínimo entre refrescos (el botón
 *   "Actualizar"; el refresco automático de la vista nunca lo manda).
 * @returns {{ synced:number, matched:number, skipped?:boolean, periodStart:string, periodEnd:string }}
 */
async function syncProjectContentSeo({ projectId, workspaceId, force = false }) {
  if (running.get(projectId)) return { synced: 0, matched: 0, skipped: true, reason: 'running' }

  const { start, end, prevStart, prevEnd } = windows()

  if (!force) {
    const last = await prisma.contentPieceSeoStat.findFirst({
      where:   { projectId },
      orderBy: { fetchedAt: 'desc' },
      select:  { fetchedAt: true },
    })
    if (last && Date.now() - last.fetchedAt.getTime() < MIN_INTERVAL_MS) {
      return { synced: 0, matched: 0, skipped: true, reason: 'cooldown', periodStart: start, periodEnd: end }
    }
  }

  running.set(projectId, true)
  try {
    const pieces = await prisma.contentPiece.findMany({
      where:  { projectId, workspaceId, deletedAt: null, publishedUrl: { not: null } },
      select: { id: true, title: true, publishedUrl: true, seoKeyword: true, seoKeywords: true },
      orderBy: { createdAt: 'asc' },
    })

    // Una pieza a la que le sacaron la URL deja de ser parte del inventario: su
    // fila de métricas no tiene a qué referirse.
    await prisma.contentPieceSeoStat.deleteMany({
      where: { projectId, pieceId: { notIn: pieces.map(p => p.id) } },
    })
    if (pieces.length === 0) {
      return { synced: 0, matched: 0, periodStart: start, periodEnd: end }
    }

    const { integration, siteUrl } = await resolveSite(projectId, workspaceId)
    const accessToken = await getValidAccessToken(integration)

    const base = { type: 'web' }
    const [currentRows, prevRows, queryRows] = await Promise.all([
      querySearchConsole(accessToken, siteUrl, {
        ...base, startDate: start, endDate: end, dimensions: ['page'], rowLimit: GSC_ROW_LIMIT,
      }),
      querySearchConsole(accessToken, siteUrl, {
        ...base, startDate: prevStart, endDate: prevEnd, dimensions: ['page'], rowLimit: GSC_ROW_LIMIT,
      }),
      querySearchConsole(accessToken, siteUrl, {
        ...base, startDate: start, endDate: end, dimensions: ['page', 'query'], rowLimit: GSC_ROW_LIMIT,
      }),
    ])

    const current = byPage(currentRows)
    const previous = byPage(prevRows)
    const topQueriesMap = queriesByPage(queryRows)

    const normalized = pieces.map(p => ({
      ...p,
      seoKeywords: safeArr(p.seoKeywords),
    }))
    const keywordOwner    = buildKeywordOwners(normalized)
    const resolvedQueries = await resolvedCannibalQueries(projectId)

    let matched = 0
    for (const piece of normalized) {
      const key  = normalizeUrl(piece.publishedUrl)
      const cur  = current.get(key) ?? null
      const prev = previous.get(key) ?? null
      const topQueries = topQueriesMap.get(key) ?? []
      if (cur) matched++

      const metrics = cur ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 }
      const ownKeywords = [piece.seoKeyword, ...piece.seoKeywords].filter(Boolean)
      // Sin datos en la ventana actual no hay caída ni CTR que juzgar, pero el
      // solapamiento de keywords declaradas sigue valiendo: es un dato del
      // inventario, no una medición.
      const alerts = computeAlerts({
        pieceId: piece.id,
        current: metrics,
        previous: cur ? prev : null,
        topQueries,
        ownKeywords,
        keywordOwner,
        resolvedQueries,
      })

      const data = {
        workspaceId, projectId,
        matchedUrl:  cur ? key : null,
        periodStart: start, periodEnd: end,
        ...metrics,
        prevClicks:      prev?.clicks      ?? null,
        prevImpressions: prev?.impressions ?? null,
        prevCtr:         prev?.ctr         ?? null,
        prevPosition:    prev?.position    ?? null,
        topQueries: JSON.stringify(topQueries),
        alerts:     JSON.stringify(alerts),
        fetchedAt:  new Date(),
      }

      await prisma.contentPieceSeoStat.upsert({
        where:  { pieceId: piece.id },
        update: data,
        create: { ...data, pieceId: piece.id },
      })
    }

    return { synced: pieces.length, matched, periodStart: start, periodEnd: end }
  } finally {
    running.delete(projectId)
  }
}

module.exports = {
  syncProjectContentSeo,
  // expuestos para los tests
  windows,
  byPage,
  queriesByPage,
  MIN_INTERVAL_MS,
  WINDOW_DAYS,
}
