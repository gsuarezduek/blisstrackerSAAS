const axios = require('axios')
const prisma = require('../../lib/prisma')

// Caché in-memory de 5 min, mismo criterio que `getAccountsUsage` de Apify: el
// panel no tiene que pegarle a SerpAPI en cada render.
const ACCOUNT_TTL_MS = 5 * 60 * 1000
let accountCache = null // { data, expiresAt }

const SERP_ACCOUNT_URL = 'https://serpapi.com/account.json'

/** Primer día del mes en curso, en UTC — la ventana que reporta SerpAPI. */
function startOfMonth() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/**
 * GET /api/superadmin/serpapi-usage
 *
 * Dos mitades que hay que leer juntas:
 *
 *  1. `account`: el plan y las búsquedas que quedan, en vivo contra la cuenta de
 *     SerpAPI. Es el número autoritativo (el mismo que su dashboard), pero no dice
 *     QUIÉN las gastó.
 *  2. `consumption`: nuestra atribución, derivada de las filas que cada llamada
 *     deja en la base. No hay un `SerpUsageLog` — se cuentan los artefactos:
 *     1 SerpSnapshot = 1 búsqueda, 1 ContentGap = 1, 1 ContentBrief = 1 (ese
 *     último es best-effort en el servicio, así que puede sobrecontar si SerpAPI
 *     estaba caído cuando se generó el brief).
 *
 * Los dos números no tienen por qué coincidir exactamente, y eso es información:
 * si la cuenta marca mucho más de lo que atribuimos, hay consumo desde afuera de
 * la app (o reintentos que no dejaron fila).
 */
async function getSerpApiUsage(req, res, next) {
  try {
    const configured = !!process.env.SERP_API_KEY
    const now = Date.now()

    let account
    if (!configured) {
      account = { configured: false, error: 'NOT_CONFIGURED' }
    } else if (accountCache && accountCache.expiresAt > now) {
      account = accountCache.data
    } else {
      account = await fetchAccount()
      // Solo se cachea una lectura que salió bien. Cachear el error 5 minutos
      // dejaría el botón "Actualizar" sin efecto justo cuando hace falta —
      // y un 500 del proveedor suele durar segundos, no minutos.
      if (!account.error) accountCache = { data: account, expiresAt: now + ACCOUNT_TTL_MS }
    }

    res.json({ account, consumption: await buildConsumption() })
  } catch (err) { next(err) }
}

async function fetchAccount() {
  try {
    const { data } = await axios.get(SERP_ACCOUNT_URL, {
      params:  { api_key: process.env.SERP_API_KEY },
      timeout: 15000,
    })
    return {
      configured:       true,
      plan:             data.plan_name ?? null,
      searchesPerMonth: data.searches_per_month ?? null,
      thisMonthUsage:   data.this_month_usage ?? null,
      totalSearchesLeft: data.total_searches_left ?? null,
      planSearchesLeft: data.plan_searches_left ?? null,
      // La fecha de renovación es lo que convierte "quedan 40" en una decisión:
      // 40 para tres semanas es un problema, 40 para mañana no.
      resetAt:          data.next_hourly_reset ?? null,
      accountEmail:     data.account_email ?? null,
      error:            null,
    }
  } catch (err) {
    const status = err.response?.status
    return {
      configured: true,
      error: status === 401 || status === 403 ? 'UNAUTHORIZED' : 'UPSTREAM',
      errorDetail: status ? `HTTP ${status}` : err.message,
    }
  }
}

/**
 * Nuestro consumo del mes, atribuido por workspace y por fuente. Es el dato que
 * contesta "quién se está comiendo la cuota", que la API de SerpAPI no responde.
 */
async function buildConsumption() {
  const from = startOfMonth()

  const [snapshots, gaps, briefs, workspaces, trackedTotal] = await Promise.all([
    prisma.serpSnapshot.groupBy({
      by: ['workspaceId', 'projectId'],
      where: { capturedAt: { gte: from } },
      _count: { _all: true },
    }),
    prisma.contentGap.groupBy({
      by: ['workspaceId', 'projectId'],
      // Un análisis fallido también gastó la búsqueda: el SERP es el primer paso.
      where: { createdAt: { gte: from } },
      _count: { _all: true },
    }),
    prisma.contentBrief.groupBy({
      by: ['workspaceId', 'projectId'],
      where: { createdAt: { gte: from } },
      _count: { _all: true },
    }),
    prisma.workspace.findMany({ select: { id: true, name: true, slug: true } }),
    // Lo que va a costar el próximo lunes: el cron hace 1 búsqueda por keyword
    // trackeada. Es la proyección que permite decidir antes de quedarse sin cuota.
    prisma.trackedKeyword.count(),
  ])

  const wsMap = Object.fromEntries(workspaces.map(w => [w.id, w]))
  const rows = new Map()

  const add = (wsId, projectId, source, count) => {
    const key = `${wsId}::${projectId}`
    if (!rows.has(key)) {
      rows.set(key, {
        workspaceId: wsId,
        workspaceName: wsMap[wsId]?.name ?? `#${wsId}`,
        workspaceSlug: wsMap[wsId]?.slug ?? null,
        projectId,
        projectName: null,
        keywords: 0, contentGap: 0, contentBrief: 0, total: 0,
      })
    }
    const row = rows.get(key)
    row[source] += count
    row.total += count
  }

  for (const r of snapshots) add(r.workspaceId, r.projectId, 'keywords', r._count._all)
  for (const r of gaps)      add(r.workspaceId, r.projectId, 'contentGap', r._count._all)
  for (const r of briefs)    add(r.workspaceId, r.projectId, 'contentBrief', r._count._all)

  const projectIds = [...new Set([...rows.values()].map(r => r.projectId).filter(Boolean))]
  if (projectIds.length) {
    const projects = await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } })
    const projMap = Object.fromEntries(projects.map(p => [p.id, p.name]))
    for (const row of rows.values()) row.projectName = projMap[row.projectId] ?? null
  }

  const byProject = [...rows.values()].sort((a, b) => b.total - a.total)
  const bySource = {
    keywords:     byProject.reduce((s, r) => s + r.keywords, 0),
    contentGap:   byProject.reduce((s, r) => s + r.contentGap, 0),
    contentBrief: byProject.reduce((s, r) => s + r.contentBrief, 0),
  }

  return {
    month: `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}`,
    total: bySource.keywords + bySource.contentGap + bySource.contentBrief,
    bySource,
    byProject,
    // 1 búsqueda por keyword trackeada, una vez por mes (cron `serpSnapshot`,
    // día 2). Es el gasto automático completo: todo lo demás lo dispara alguien.
    monthlyCronCost: trackedTotal,
  }
}

module.exports = { getSerpApiUsage }
