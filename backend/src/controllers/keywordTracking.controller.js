const prisma   = require('../lib/prisma')
const { normalizeSiteUrl }          = require('../utils/seo')
const { querySearchConsole }        = require('../services/googleSearchConsole.service')
const { getValidAccessToken }       = require('../services/tokenRefresh.service')
const {
  saveMonthKeywordRankings,
  generateKeywordAnalysis,
  currentMonthStr,
} = require('../services/keywordTracking.service')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function prevMonth(month) {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}

function monthBounds(month) {
  const [y, m] = month.split('-').map(Number)
  const pad     = n => String(n).padStart(2, '0')
  const lastDay = new Date(y, m, 0).getDate()
  return { startDate: `${y}-${pad(m)}-01`, endDate: `${y}-${pad(m)}-${pad(lastDay)}` }
}

// ─── GET /projects/:id/keywords ───────────────────────────────────────────────

async function listKeywords(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const month     = currentMonthStr()
    const prevM     = prevMonth(month)

    const tracked = await prisma.trackedKeyword.findMany({
      where: { projectId, workspaceId },
      include: {
        rankings: {
          where: { month: { in: [month, prevM] } },
          orderBy: { month: 'desc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const result = tracked.map(kw => {
      const curr = kw.rankings.find(r => r.month === month)
      const prev = kw.rankings.find(r => r.month === prevM)
      const delta = curr && prev && prev.position > 0
        ? parseFloat((prev.position - curr.position).toFixed(2))  // negativo = empeoró, positivo = mejoró
        : null
      return {
        id:               kw.id,
        query:            kw.query,
        currentMonth:     month,
        currentPosition:  curr?.position  ?? null,
        previousPosition: prev?.position  ?? null,
        delta,
        clicks:           curr?.clicks      ?? 0,
        impressions:      curr?.impressions  ?? 0,
        ctr:              curr?.ctr          ?? 0,
        hasAnalysis:      !!kw.analysisContent,
        analysisUpdatedAt: kw.analysisUpdatedAt,
        createdAt:        kw.createdAt,
      }
    })

    res.json(result)
  } catch (err) { next(err) }
}

// ─── POST /projects/:id/keywords ──────────────────────────────────────────────

async function addKeyword(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { query }   = req.body

    if (!query?.trim()) return res.status(400).json({ error: 'query requerida' })

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    // Upsert — si ya existe la devuelve sin error
    const kw = await prisma.trackedKeyword.upsert({
      where: { projectId_query: { projectId, query: query.trim().toLowerCase() } },
      create: { projectId, workspaceId, query: query.trim().toLowerCase() },
      update: {},
    })

    // Guarda ranking del mes actual inmediatamente (async, no bloquea respuesta)
    const month = currentMonthStr()
    saveMonthKeywordRankings(projectId, workspaceId, month).catch(err =>
      console.error('[KeywordTracking] Error guardando ranking al agregar:', err.message)
    )

    res.status(201).json({ id: kw.id, query: kw.query, createdAt: kw.createdAt })
  } catch (err) { next(err) }
}

// ─── DELETE /projects/:id/keywords/:kwId ─────────────────────────────────────

async function removeKeyword(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const kwId        = Number(req.params.kwId)

    const kw = await prisma.trackedKeyword.findFirst({
      where: { id: kwId, projectId, workspaceId },
    })
    if (!kw) return res.status(404).json({ error: 'Keyword no encontrada' })

    await prisma.trackedKeyword.delete({ where: { id: kwId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ─── GET /projects/:id/keywords/suggest ──────────────────────────────────────

async function suggestKeywords(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

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
      return res.status(400).json({
        error: 'Google Search Console no está conectado para este proyecto.',
        status: 'no_integration',
      })
    }

    const siteUrl = normalizeSiteUrl(integration.propertyId || project.websiteUrl)
    if (!siteUrl) {
      return res.status(400).json({
        error: 'No hay URL de sitio configurada.',
        status: 'no_site_url',
      })
    }

    // Top 25 queries del mes actual
    const month = currentMonthStr()
    const { startDate, endDate } = monthBounds(month)
    const accessToken = await getValidAccessToken(integration)

    let rows = []
    try {
      rows = await querySearchConsole(accessToken, siteUrl, {
        startDate,
        endDate,
        type: 'web',
        dimensions: ['query'],
        rowLimit: 25,
      })
    } catch (err) {
      return res.status(502).json({ error: `Error al consultar Search Console: ${err.message}` })
    }

    // Keywords ya trackeadas
    const tracked = await prisma.trackedKeyword.findMany({
      where: { projectId, workspaceId },
      select: { query: true },
    })
    const trackedSet = new Set(tracked.map(k => k.query.toLowerCase()))

    const queries = rows.map(r => ({
      query:          r.keys[0],
      clicks:         Math.round(r.clicks),
      impressions:    Math.round(r.impressions),
      ctr:            r.ctr,
      position:       r.position,
      alreadyTracked: trackedSet.has(r.keys[0].toLowerCase()),
    }))

    res.json({ queries })
  } catch (err) { next(err) }
}

// ─── GET /projects/:id/keywords/:kwId/history ─────────────────────────────────

async function getHistory(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const kwId        = Number(req.params.kwId)

    const kw = await prisma.trackedKeyword.findFirst({
      where: { id: kwId, projectId, workspaceId },
      include: {
        rankings: { orderBy: { month: 'asc' } },
      },
    })
    if (!kw) return res.status(404).json({ error: 'Keyword no encontrada' })

    res.json({
      id:               kw.id,
      query:            kw.query,
      hasAnalysis:      !!kw.analysisContent,
      analysisContent:  kw.analysisContent ? JSON.parse(kw.analysisContent) : null,
      analysisUpdatedAt: kw.analysisUpdatedAt,
      rankings:         kw.rankings,
    })
  } catch (err) { next(err) }
}

// ─── POST /projects/:id/keywords/:kwId/analysis ───────────────────────────────

async function generateAnalysis(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const kwId        = Number(req.params.kwId)

    const kw = await prisma.trackedKeyword.findFirst({
      where: { id: kwId, projectId, workspaceId },
    })
    if (!kw) return res.status(404).json({ error: 'Keyword no encontrada' })

    // Cooldown de 1h
    if (kw.analysisUpdatedAt) {
      const diffMs   = Date.now() - new Date(kw.analysisUpdatedAt).getTime()
      const waitMins = Math.ceil((60 * 60 * 1000 - diffMs) / 60000)
      if (waitMins > 0) {
        return res.status(429).json({
          error: `Análisis generado recientemente. Podés actualizarlo en ${waitMins} min.`,
          waitMins,
        })
      }
    }

    const analysis = await generateKeywordAnalysis(kwId, workspaceId)
    res.json({ analysis })
  } catch (err) { next(err) }
}

module.exports = {
  listKeywords,
  addKeyword,
  removeKeyword,
  suggestKeywords,
  getHistory,
  generateAnalysis,
}
