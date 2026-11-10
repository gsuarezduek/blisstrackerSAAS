// Inventario SEO del blog: la lista de notas publicadas con sus métricas de
// Search Console, el refresco de esas métricas, la importación inicial desde el
// sitio y el vínculo entre traducciones.
//
// Vive en Contenido y no en Marketing porque el dato es la PIEZA: una nota es
// una pieza más del calendario, con URL y keyword. Marketing lee el sitio
// entero (Search Console, canibalización, keywords); acá se mira nota por nota,
// que es la unidad con la que el equipo decide qué escribir y qué actualizar.

const crypto = require('crypto')
const prisma = require('../../lib/prisma')
const { isValidStatus, isValidLanguage, statusMeta } = require('../../lib/contentCatalog')
const { trendOf } = require('../../lib/contentSeo')
const { buildTextSearchFilters } = require('../../lib/textSearch')
const { syncProjectContentSeo } = require('../../services/contentSeoStats.service')
const { importPublishedPieces } = require('../../services/contentImport.service')
const { emitTo } = require('../../lib/socket')
const {
  resolveCtx, formatSeoStat, emitPieceUpdated, loadPiece, formatPiece,
  loadTranslationGroups, siblingsFrom,
} = require('./_shared')

// Tope de notas del inventario en una respuesta. El blog de un cliente tiene
// decenas o unos cientos de notas, no miles: por eso se ordena y se filtra en
// memoria (ver `sortRows`) en vez de pelear con un orderBy sobre la relación.
const MAX_ROWS = 500

const SORTS = new Set(['clicks', 'impressions', 'position', 'published', 'title'])
const TRENDS = new Set(['sube', 'baja', 'estable', 'nuevo'])

function safeArr(json) {
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : [] } catch { return [] }
}

const ROW_SELECT = {
  id: true, title: true, status: true, language: true,
  publishedUrl: true, publishedAt: true, scheduledDate: true,
  seoKeyword: true, seoKeywords: true, translationGroupId: true,
  owner: { select: { id: true, name: true, avatar: true } },
  seoStat: true,
}

function formatRow(p, siblings) {
  return {
    id:           p.id,
    title:        p.title,
    status:       p.status,
    statusLabel:  statusMeta(p.status)?.label ?? p.status,
    language:     p.language,
    publishedUrl: p.publishedUrl,
    publishedAt:  p.publishedAt,
    scheduledDate: p.scheduledDate,
    seoKeyword:   p.seoKeyword,
    seoKeywords:  safeArr(p.seoKeywords),
    owner:        p.owner ? { id: p.owner.id, name: p.owner.name, avatar: p.owner.avatar } : null,
    translations: siblings,
    seo:          p.seoStat ? formatSeoStat(p.seoStat) : null,
    trend:        trendOf(p.seoStat),
  }
}

/**
 * GET /api/contenido/projects/:id/seo/inventory
 * Query: language, status, trend, alert, q, sort (clicks|impressions|position|
 * published|title), dir (asc|desc).
 *
 * Lo que define al inventario es tener URL publicada, no el estado ni el tipo:
 * una nota publicada hace dos años y una que se publicó ayer se miden igual, y
 * una pieza marcada "publicado" sin URL no tiene nada que medir.
 */
async function getInventory(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const { workspaceId, projectId } = ctx

    const where = { projectId, workspaceId, deletedAt: null, publishedUrl: { not: null } }
    const { language, status, q } = req.query
    if (language && isValidLanguage(language)) where.language = language
    // 'none' = sin idioma cargado, que es justo lo que hay que completar: sin
    // él la nota no entra en ningún filtro por idioma y queda invisible.
    else if (language === 'none') where.language = null
    if (status && isValidStatus(status)) where.status = status
    if (q && String(q).trim()) {
      where.AND = buildTextSearchFilters(String(q).trim(), ['title', 'publishedUrl', 'seoKeyword'])
    }

    const [pieces, integration] = await Promise.all([
      prisma.contentPiece.findMany({ where, select: ROW_SELECT, take: MAX_ROWS }),
      prisma.projectIntegration.findUnique({
        where:  { projectId_type: { projectId, type: 'google_search_console' } },
        select: { status: true },
      }),
    ])

    const groups = await loadTranslationGroups(projectId, workspaceId, pieces.map(p => p.translationGroupId))
    let rows = pieces.map(p => formatRow(p, siblingsFrom(groups, p)))

    const trend = req.query.trend
    if (TRENDS.has(trend)) rows = rows.filter(r => r.trend === trend)
    if (req.query.alert === '1') rows = rows.filter(r => (r.seo?.alerts?.length ?? 0) > 0)

    rows = sortRows(rows, req.query.sort, req.query.dir)

    const lastSyncAt = pieces.reduce((max, p) => {
      const at = p.seoStat?.fetchedAt
      return at && (!max || at > max) ? at : max
    }, null)
    // Todas las filas se escriben en el mismo refresco, así que la ventana de
    // cualquiera de ellas es la ventana del inventario.
    const anyStat = pieces.find(p => p.seoStat)?.seoStat ?? null

    res.json({
      pieces: rows,
      total:  rows.length,
      // Sin Search Console conectado el inventario sigue sirviendo (es el
      // listado de lo publicado), pero no hay métricas: la vista lo dice en vez
      // de mostrar ceros que parecen un blog que no rankea.
      searchConsole: integration?.status === 'active' ? 'active' : (integration ? integration.status : 'missing'),
      lastSyncAt,
      period: anyStat ? { start: anyStat.periodStart, end: anyStat.periodEnd } : null,
      counts: {
        total:      rows.length,
        withUrl:    rows.length,
        withAlerts: rows.filter(r => (r.seo?.alerts?.length ?? 0) > 0).length,
        byLanguage: rows.reduce((acc, r) => {
          const key = r.language || 'none'
          acc[key] = (acc[key] ?? 0) + 1
          return acc
        }, {}),
      },
    })
  } catch (err) { next(err) }
}

/**
 * Orden de la tabla. En memoria y no en SQL porque el inventario entra entero
 * en una respuesta (MAX_ROWS) y porque hay que ordenar por campos que no son
 * columnas de ContentPiece (los de la relación con las métricas).
 *
 * Las notas sin métricas van SIEMPRE al final, ordene como ordene: una nota sin
 * medir no es "la que menos clics tiene", es una de la que no se sabe nada.
 */
function sortRows(rows, sort, dir) {
  const key = SORTS.has(sort) ? sort : 'clicks'
  const desc = dir !== 'asc'

  const value = r => {
    if (key === 'title')     return r.title?.toLowerCase() ?? ''
    if (key === 'published') return r.publishedAt ? new Date(r.publishedAt).getTime() : null
    if (!r.seo) return null
    // La posición se lee al revés (1 es mejor que 50): sin esto "ordenar por
    // posición, mejor primero" mostraba las peores arriba.
    if (key === 'position') return r.seo.position > 0 ? -r.seo.position : null
    return r.seo[key]
  }

  return [...rows].sort((a, b) => {
    const va = value(a), vb = value(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (va === vb) return 0
    const cmp = va > vb ? 1 : -1
    return desc ? -cmp : cmp
  })
}

/**
 * POST /api/contenido/projects/:id/seo/refresh
 * Body: { force }. Escritura (consume cuota de la API del cliente).
 */
async function refreshSeo(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return

    const result = await syncProjectContentSeo({
      projectId:   ctx.projectId,
      workspaceId: ctx.workspaceId,
      force:       req.body?.force === true,
    })
    res.json(result)
  } catch (err) {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message, code: err.code })
    next(err)
  }
}

/**
 * POST /api/contenido/projects/:id/seo/import
 * Body: { source: 'wordpress'|'sitemap', url?, filter?, defaultLanguage?, dryRun? }
 */
async function importFromSite(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return

    const source = req.body?.source === 'sitemap' ? 'sitemap' : 'wordpress'
    const defaultLanguage = isValidLanguage(req.body?.defaultLanguage) ? req.body.defaultLanguage : null

    const result = await importPublishedPieces({
      projectId:   ctx.projectId,
      workspaceId: ctx.workspaceId,
      userId:      req.user.userId,
      source,
      url:         typeof req.body?.url === 'string' ? req.body.url.trim() : null,
      filter:      typeof req.body?.filter === 'string' ? req.body.filter.trim() : null,
      defaultLanguage,
      dryRun:      req.body?.dryRun === true,
    })

    // Una importación crea piezas: el mismo evento que ya escucha la vista
    // alcanza para que se recargue sola en todas las pestañas abiertas. Sin
    // `piece` porque son muchas — los handlers lo usan sólo como disparador de
    // un reload (ver useContentSocket.js), no mergean el payload.
    if (!result.dryRun && result.created.length > 0) {
      emitTo(`workspace:${ctx.workspaceId}`, 'content:piece:created', { projectId: ctx.projectId, piece: null })
    }
    res.json(result)
  } catch (err) {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message, code: err.code })
    next(err)
  }
}

/**
 * POST /api/contenido/projects/:id/pieces/:pid/translations
 * Body: { pieceId } — marca las dos piezas como traducciones de la misma nota.
 *
 * Unir dos notas que ya tenían grupo FUSIONA los dos grupos (y no mueve una
 * sola pieza): si la versión en inglés ya estaba unida a la portuguesa,
 * vincularla con la española tiene que dejar las tres juntas, que es lo que la
 * persona está diciendo al vincularlas.
 */
async function linkTranslation(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { workspaceId, projectId } = ctx

    const otherId = Number(req.body?.pieceId)
    const pid = Number(req.params.pid)
    if (!Number.isInteger(otherId) || otherId <= 0) return res.status(400).json({ error: 'pieceId inválido' })
    if (otherId === pid) return res.status(400).json({ error: 'Una nota no es traducción de sí misma' })

    const pieces = await prisma.contentPiece.findMany({
      where:  { id: { in: [pid, otherId] }, projectId, workspaceId, deletedAt: null },
      select: { id: true, translationGroupId: true },
    })
    if (pieces.length !== 2) return res.status(404).json({ error: 'Pieza no encontrada' })

    const existing = pieces.map(p => p.translationGroupId).filter(Boolean)
    const groupId = existing[0] ?? `tg-${crypto.randomUUID()}`
    const toMerge = [...new Set(existing)].filter(g => g !== groupId)

    if (toMerge.length > 0) {
      await prisma.contentPiece.updateMany({
        where: { projectId, workspaceId, translationGroupId: { in: toMerge } },
        data:  { translationGroupId: groupId },
      })
    }
    await prisma.contentPiece.updateMany({
      where: { id: { in: [pid, otherId] }, projectId, workspaceId },
      data:  { translationGroupId: groupId },
    })

    const fresh = await loadPiece(pid, projectId, workspaceId)
    const formatted = formatPiece(fresh)
    emitPieceUpdated(workspaceId, projectId, formatted)
    const groups = await loadTranslationGroups(projectId, workspaceId, [groupId])
    res.json({ ...formatted, translations: siblingsFrom(groups, fresh) })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/contenido/projects/:id/pieces/:pid/translations
 * Saca a la pieza de su grupo. Si queda una sola, se le limpia el grupo también:
 * un grupo de uno no es un grupo, y dejarlo haría que la próxima nota que entre
 * al grupo "herede" un vínculo que nadie pidió.
 */
async function unlinkTranslation(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { workspaceId, projectId } = ctx

    const piece = await prisma.contentPiece.findFirst({
      where:  { id: Number(req.params.pid), projectId, workspaceId, deletedAt: null },
      select: { id: true, translationGroupId: true },
    })
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })
    if (!piece.translationGroupId) return res.json({ unlinked: false })

    const groupId = piece.translationGroupId
    await prisma.contentPiece.update({ where: { id: piece.id }, data: { translationGroupId: null } })

    const left = await prisma.contentPiece.findMany({
      where:  { projectId, workspaceId, deletedAt: null, translationGroupId: groupId },
      select: { id: true },
    })
    if (left.length === 1) {
      await prisma.contentPiece.update({ where: { id: left[0].id }, data: { translationGroupId: null } })
    }

    const fresh = await loadPiece(piece.id, projectId, workspaceId)
    emitPieceUpdated(workspaceId, projectId, formatPiece(fresh))
    res.json({ unlinked: true })
  } catch (err) { next(err) }
}

module.exports = {
  getInventory,
  refreshSeo,
  importFromSite,
  linkTranslation,
  unlinkTranslation,
  // expuesto para los tests
  sortRows,
}
