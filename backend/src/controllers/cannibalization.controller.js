const prisma = require('../lib/prisma')
const { runCannibalizationAnalysis } = require('../services/cannibalization.service')
const { canWrite } = require('../lib/projectAccess')
const { summarizeConflicts } = require('../lib/cannibalAnalysis')
const { ACTIONS, splitByResolution, publicResolution } = require('../lib/cannibalResolution')
const { splitByLive } = require('../lib/cannibalLive')
const { splitBrandConflicts, suggestBrandTerms } = require('../lib/cannibalBrand')
const { requestAgentId, requestAgentName } = require('./tasks/_shared')

const VALID_RANGES = ['30d', '90d', '180d']
const MAX_PROTECTED_URLS = 200
const MAX_BRAND_TERMS    = 50
const MAX_BRAND_TERM_LENGTH = 120
const MAX_URL_LENGTH = 2048
const MAX_QUERY_LENGTH = 300
const MAX_NOTE_LENGTH  = 500
const MAX_RESOLUTION_URLS = 20

// Filas de resolución con el autor resuelto — mismo include en todas las lecturas.
const RESOLUTION_INCLUDE = {
  resolvedBy:      { select: { name: true } },
  resolvedByAgent: { select: { label: true } },
}
// (`resolvedByAgentId`/`resolvedByAgentName` no hacen falta acá: con `include`, Prisma ya
// devuelve todos los escalares de la fila. agentLabel los necesita para distinguir "no fue
// un agente" de "fue un agente cuyo token se llama igual que su dueño".)

/**
 * POST /api/marketing/projects/:id/cannibal
 * Body: { dateRange?, language? }
 * Crea un CannibalReport en estado "running" y dispara el análisis async.
 */
async function runAnalysis(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const dateRange   = VALID_RANGES.includes(req.body?.dateRange) ? req.body.dateRange : '90d'
    const language    = typeof req.body?.language === 'string' && req.body.language.length <= 20
      ? req.body.language.trim().toLowerCase() || null
      : null

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const report = await prisma.cannibalReport.create({
      data: { projectId, workspaceId, dateRange, status: 'pending' },
    })

    setImmediate(() => runCannibalizationAnalysis(report.id, projectId, workspaceId, dateRange, language))

    res.status(201).json({ reportId: report.id, status: 'pending' })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/cannibal
 * Devuelve los últimos reportes del proyecto (sin los JSON pesados, para listar).
 */
async function listReports(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const limit       = Math.min(Number(req.query.limit) || 10, 50)

    const reports = await prisma.cannibalReport.findMany({
      where:   { projectId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      select: {
        id: true, status: true, dateRange: true, languageFilter: true,
        totalConflicts: true, criticalCount: true, warningCount: true, lowCount: true,
        trafficAtRisk: true, hreflangCount: true, indexedByMistakeCount: true,
        errorMsg: true, createdAt: true, updatedAt: true,
      },
    })

    res.json({ reports })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/cannibal/:rid
 * Devuelve detalle completo de un reporte (incluye los 3 JSON parseados).
 */
async function getReport(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const rid         = Number(req.params.rid)

    const report = await prisma.cannibalReport.findFirst({
      where: { id: rid, projectId, workspaceId },
    })
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado' })

    let conflicts = []
    try { conflicts = JSON.parse(report.conflicts || '[]') } catch { /* ignore */ }
    let hreflangIssues = []
    try { hreflangIssues = JSON.parse(report.hreflangIssues || '[]') } catch { /* ignore */ }
    let indexedByMistake = []
    try { indexedByMistake = JSON.parse(report.indexedByMistake || '[]') } catch { /* ignore */ }

    // Los conflictos ya arreglados se descuentan ACÁ y no en el JSON guardado: marcar
    // uno como resuelto (o desmarcarlo) tiene efecto al instante, sin esperar un run
    // nuevo. Los conteos se recalculan sobre los abiertos para que el encabezado no
    // contradiga a la lista; un conflicto REABIERTO cuenta como abierto y se lleva el
    // historial del arreglo anterior.
    const resolutions = await prisma.cannibalResolution.findMany({
      where: { projectId, workspaceId }, include: RESOLUTION_INCLUDE,
    })

    // Búsquedas de marca: se separan con los términos VIGENTES, no con los que había
    // cuando corrió el análisis — así confirmar o borrar un término se ve al instante y
    // una mala clasificación se corrige sin re-correr nada.
    const brandProject = await prisma.project.findFirst({
      where:  { id: projectId, workspaceId },
      select: { cannibalBrandTerms: true, cannibalBrandUrl: true },
    })
    let brandTerms = []
    try { brandTerms = JSON.parse(brandProject?.cannibalBrandTerms || '[]') } catch { /* ignore */ }
    const { conflicts: nonBrand, brandQueries } = splitBrandConflicts(conflicts, {
      brandTerms, brandUrl: brandProject?.cannibalBrandUrl ?? null,
    })

    const { open, resolved } = splitByResolution(nonBrand, resolutions)
    // Lo que el propio sitio ya resolvió (301, canonical, noindex, 404 verificados en
    // vivo durante el run) sale de los pendientes igual que una resolución manual, y por
    // el mismo motivo: se aplica en lectura, así que nada queda escondido para siempre.
    const { pending, fixedLive } = splitByLive(open)

    res.json({
      ...report,
      ...summarizeConflicts(pending),
      totalConflicts:     pending.length,
      detectedConflicts:  conflicts.length,
      resolvedCount:      resolved.length,
      fixedLiveCount:     fixedLive.length,
      brandQueryCount:    brandQueries.length,
      conflicts:          pending,
      resolvedConflicts:  resolved,
      fixedLiveConflicts: fixedLive,
      brandQueries,
      hreflangIssues,
      indexedByMistake,
    })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/marketing/projects/:id/cannibal/:rid
 */
async function deleteReport(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const rid         = Number(req.params.rid)

    const report = await prisma.cannibalReport.findFirst({
      where: { id: rid, projectId, workspaceId },
    })
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado' })

    await prisma.cannibalReport.delete({ where: { id: rid } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/cannibal/brand-terms
 * Los términos de marca confirmados + la URL que debería ganarlas, y — si se pide
 * `?suggest=1` — sugerencias sacadas de búsquedas REALES de Search Console.
 *
 * Nada se aplica sin confirmación: esto solo propone. Los términos no se derivan del
 * dominio porque un token del dominio puede ser la keyword genérica del rubro
 * ("car" está dentro de "mdzrentacar") o un sinónimo de la ciudad ("mdz" es el código
 * IATA del aeropuerto de Mendoza) — ver lib/cannibalBrand.js.
 */
async function getBrandTerms(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where:  { id: projectId, workspaceId },
      select: { name: true, websiteUrl: true, cannibalBrandTerms: true, cannibalBrandUrl: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    let terms = []
    try { terms = JSON.parse(project.cannibalBrandTerms || '[]') } catch { /* ignore */ }

    const payload = { terms, brandUrl: project.cannibalBrandUrl ?? null, suggestions: [] }
    if (req.query.suggest) {
      // Best-effort: sin Search Console conectado (o si falla) se devuelven los términos
      // cargados y `suggestions: []`, nunca un error — la pantalla sigue siendo usable.
      try {
        payload.suggestions = await loadBrandSuggestions(projectId, workspaceId, project, terms)
      } catch (err) {
        console.error('[Cannibalization] No se pudieron sugerir términos de marca:', err.message)
        payload.suggestionsError = 'No se pudieron leer las búsquedas de Search Console para sugerir términos.'
      }
    }
    res.json(payload)
  } catch (err) { next(err) }
}

// Últimos 90 días de queries de Search Console → sugerencias de términos de marca.
async function loadBrandSuggestions(projectId, workspaceId, project, existing) {
  const integration = await prisma.projectIntegration.findUnique({
    where:  { projectId_type: { projectId, type: 'google_search_console' } },
  })
  if (!integration) return []

  const { getValidAccessToken } = require('../services/tokenRefresh.service')
  const { querySearchConsole }  = require('../services/googleSearchConsole.service')
  const { normalizeSiteUrl }    = require('../utils/seo')

  const accessToken = await getValidAccessToken(integration)
  // Misma fuente que el análisis (ver cannibalization.service.js): la propiedad de GSC y,
  // si no hay, la web del proyecto.
  const siteUrl     = normalizeSiteUrl(integration.propertyId || project.websiteUrl || '')
  if (!siteUrl) return []

  const end   = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 90)

  const rows = await querySearchConsole(accessToken, siteUrl, {
    startDate:  start.toISOString().slice(0, 10),
    endDate:    end.toISOString().slice(0, 10),
    type:       'web',
    dimensions: ['query'],
    rowLimit:   2000,
  })

  return suggestBrandTerms(
    (rows || []).map(r => ({ query: r.keys[0], impressions: r.impressions })),
    { projectName: project.name, websiteUrl: project.websiteUrl, existing },
  )
}

/**
 * PUT /api/marketing/projects/:id/cannibal/brand-terms
 * Body: { terms: string[], brandUrl?: string|null } — reemplaza la lista completa.
 * Config sensible (saca búsquedas del análisis): mismo `canWrite` que las URLs protegidas.
 */
async function setBrandTerms(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId }, select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) {
      return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

    const body = Array.isArray(req.body?.terms) ? req.body.terms : []
    const terms = [...new Set(body.map(t => String(t || '').trim()).filter(Boolean))].slice(0, MAX_BRAND_TERMS)
    for (const t of terms) {
      if (t.length > MAX_BRAND_TERM_LENGTH) {
        return res.status(400).json({ error: `Término demasiado largo: ${t.slice(0, 40)}...` })
      }
    }

    let brandUrl = null
    if (typeof req.body?.brandUrl === 'string' && req.body.brandUrl.trim()) {
      brandUrl = req.body.brandUrl.trim().slice(0, MAX_URL_LENGTH)
      if (!/^https?:\/\//i.test(brandUrl)) {
        return res.status(400).json({ error: 'La URL de marca tiene que empezar con http:// o https://' })
      }
    }

    await prisma.project.update({
      where: { id: projectId },
      data:  { cannibalBrandTerms: JSON.stringify(terms), cannibalBrandUrl: brandUrl },
    })
    res.json({ terms, brandUrl })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/cannibal/protected-urls
 * Lectura abierta a cualquier miembro del workspace (mismo criterio que el resto de este controller).
 */
async function getProtectedUrls(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where:  { id: projectId, workspaceId },
      select: { cannibalProtectedUrls: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    let urls = []
    try { urls = JSON.parse(project.cannibalProtectedUrls || '[]') } catch { /* ignore */ }
    res.json({ urls })
  } catch (err) { next(err) }
}

/**
 * PUT /api/marketing/projects/:id/cannibal/protected-urls
 * Body: { urls: string[] } — reemplaza la lista completa. Config sensible
 * (decide qué URLs nunca se tocan): admin/owner o miembro del equipo del
 * proyecto, mismo criterio que saveLinks/saveInfo (canWrite).
 */
async function setProtectedUrls(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    if (!(await canWrite(req, projectId))) {
      return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

    const body = Array.isArray(req.body?.urls) ? req.body.urls : []
    const cleaned = [...new Set(body.map(u => String(u || '').trim()).filter(Boolean))].slice(0, MAX_PROTECTED_URLS)
    for (const u of cleaned) {
      if (u.length > MAX_URL_LENGTH) {
        return res.status(400).json({ error: `URL demasiado larga: ${u.slice(0, 50)}...` })
      }
    }

    await prisma.project.update({
      where: { id: projectId },
      data:  { cannibalProtectedUrls: JSON.stringify(cleaned) },
    })
    res.json({ urls: cleaned })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/cannibal/resolutions
 * Conflictos marcados como resueltos (y los que volvieron). Lectura abierta a
 * cualquier miembro del workspace, mismo criterio que el resto de este controller.
 */
async function listResolutions(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId }, select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const rows = await prisma.cannibalResolution.findMany({
      where:   { projectId, workspaceId },
      include: RESOLUTION_INCLUDE,
      orderBy: { resolvedAt: 'desc' },
    })
    res.json({ resolutions: rows.map(publicResolution) })
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/cannibal/resolutions
 * Body: { query, language?, action?, note?, resolvedAt?, mainUrl?, urls? }
 *
 * Marca un conflicto como resuelto. Upsert por (query, idioma): volver a marcar el
 * mismo conflicto actualiza la nota/acción/fecha y, si había vuelto, lo cierra de
 * nuevo conservando `reopenCount` — el historial de que ya se había arreglado una vez
 * es justo lo que delata un 301 que no quedó aplicado.
 *
 * Escritura de configuración que cambia lo que el análisis reporta: admin/owner o
 * miembro del equipo del proyecto, mismo criterio que las URLs protegidas.
 */
async function resolveConflict(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId }, select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) {
      return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

    // Minúsculas: Search Console devuelve las queries así, y la verificación filtra por
    // `query equals <esto>` — una keyword guardada con otra forma no matchearía ninguna
    // fila y el conflicto no se reabriría nunca. Es además la identidad del unique.
    const query = String(req.body?.query ?? '').trim().toLowerCase()
    if (!query) return res.status(400).json({ error: 'Falta la keyword del conflicto' })
    if (query.length > MAX_QUERY_LENGTH) return res.status(400).json({ error: 'Keyword demasiado larga' })

    const language = String(req.body?.language ?? 'default').trim().toLowerCase().slice(0, 20) || 'default'
    const action   = ACTIONS.includes(req.body?.action) ? req.body.action : 'otro'
    const note     = typeof req.body?.note === 'string' && req.body.note.trim()
      ? req.body.note.trim().slice(0, MAX_NOTE_LENGTH)
      : null

    // La fecha del arreglo puede ser anterior a hoy (se marca después de hacerlo), pero
    // nunca futura: es la que define la ventana de datos contra la que se verifica.
    let resolvedAt = new Date()
    if (req.body?.resolvedAt) {
      const parsed = new Date(req.body.resolvedAt)
      if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: 'Fecha inválida' })
      resolvedAt = parsed > new Date() ? new Date() : parsed
    }

    const urls = Array.isArray(req.body?.urls)
      ? [...new Set(req.body.urls.map(u => String(u || '').trim()).filter(Boolean))]
          .filter(u => u.length <= MAX_URL_LENGTH)
          .slice(0, MAX_RESOLUTION_URLS)
      : []
    const mainUrl = typeof req.body?.mainUrl === 'string' && req.body.mainUrl.trim().length <= MAX_URL_LENGTH
      ? req.body.mainUrl.trim() || null
      : null

    const author = {
      resolvedById:        req.user.userId,
      resolvedByAgentId:   requestAgentId(req),
      resolvedByAgentName: requestAgentName(req),
    }

    const row = await prisma.cannibalResolution.upsert({
      where:  { projectId_query_language: { projectId, query, language } },
      create: {
        projectId, workspaceId, query, language, action, note, resolvedAt,
        mainUrl, urls: JSON.stringify(urls), ...author,
      },
      update: {
        action, note, resolvedAt, mainUrl, urls: JSON.stringify(urls), ...author,
        // Vuelve a estar resuelto; la evidencia de la reapertura anterior ya no aplica
        // a este arreglo, pero reopenCount queda como historial.
        status: 'resolved', reopenedAt: null, reopenEvidence: null, lastCheckedAt: null,
      },
      include: RESOLUTION_INCLUDE,
    })

    res.status(201).json({ resolution: publicResolution(row) })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/marketing/projects/:id/cannibal/resolutions/:rid
 * Desmarca: el conflicto vuelve a la lista de abiertos en la próxima lectura.
 */
async function unresolveConflict(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const rid         = Number(req.params.rid)

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId }, select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) {
      return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

    const { count } = await prisma.cannibalResolution.deleteMany({ where: { id: rid, projectId, workspaceId } })
    if (count === 0) return res.status(404).json({ error: 'Resolución no encontrada' })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = {
  runAnalysis, listReports, getReport, deleteReport, getProtectedUrls, setProtectedUrls,
  getBrandTerms, setBrandTerms,
  listResolutions, resolveConflict, unresolveConflict,
}
