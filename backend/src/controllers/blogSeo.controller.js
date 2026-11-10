// Inventario del blog (Marketing → GEO / SEO → Contenido SEO): la lista de notas
// publicadas con sus métricas de Search Console, el refresco de esas métricas, la
// importación inicial desde el sitio, los datos SEO de cada nota (URL, idioma,
// keywords) y el vínculo entre traducciones.
//
// Una nota ES una pieza de Contenido (`ContentPiece` con `publishedUrl`), pero lo
// que se hace acá es trabajo de SEO, así que vive en Marketing y pide lo de
// Marketing: el flag, el acceso por rol y Marketing prendido en la cuenta (ver
// marketing.routes.js). Contenido no muestra ni edita nada de esto — su ficha de
// pieza es la de producción y aprobación.

const crypto = require('crypto')
const prisma = require('../lib/prisma')
const { isValidStatus, isValidLanguage, statusMeta } = require('../lib/contentCatalog')
const { deltaPct, trendOf } = require('../lib/contentSeo')
const { buildTextSearchFilters } = require('../lib/textSearch')
const { syncProjectContentSeo } = require('../services/contentSeoStats.service')
const { importPublishedPieces } = require('../services/contentImport.service')
const { emitTo } = require('../lib/socket')
const { resolveCtx } = require('./content/_shared')

// Tope de notas del inventario en una respuesta. El blog de un cliente tiene
// decenas o unos cientos de notas, no miles: por eso se ordena y se filtra en
// memoria (ver `sortRows`) en vez de pelear con un orderBy sobre la relación.
const MAX_ROWS = 500

const SORTS = new Set(['clicks', 'impressions', 'position', 'published', 'title'])
const TRENDS = new Set(['sube', 'baja', 'estable', 'nuevo'])

function safeArr(json) {
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : [] } catch { return [] }
}

// Tope de keywords secundarias por nota. No es una restricción técnica: una
// lista de 40 keywords no es un foco, es un deseo, y la alerta de solapamiento
// la vuelve ruido (cada keyword declarada es un choque potencial con otra nota).
const MAX_SEO_KEYWORDS = 10
const MAX_URL = 2000

/**
 * Métricas de Search Console de una nota, listas para la tabla: los números de
 * la ventana actual, la variación contra la anterior ya calculada (null =
 * no había período anterior con qué comparar, ver ContentPieceSeoStat) y las
 * alertas que dejó el último refresh.
 */
function formatSeoStat(st) {
  return {
    matched:     st.matchedUrl != null,
    periodStart: st.periodStart,
    periodEnd:   st.periodEnd,
    clicks:      st.clicks,
    impressions: st.impressions,
    ctr:         st.ctr,
    position:    st.position,
    prevClicks:      st.prevClicks,
    prevImpressions: st.prevImpressions,
    prevPosition:    st.prevPosition,
    delta: {
      clicks:      deltaPct(st.clicks, st.prevClicks),
      impressions: deltaPct(st.impressions, st.prevImpressions),
      // La posición NO va en porcentaje sino en posiciones, y con el signo
      // dado vuelta: en Search Console un número más chico es mejor, así que
      // +2 acá significa "subió 2 puestos" y no "empeoró un 2%".
      position: st.prevPosition != null ? Number((st.prevPosition - st.position).toFixed(1)) : null,
    },
    trend:      trendOf(st),
    topQueries: safeArr(st.topQueries),
    alerts:     safeArr(st.alerts),
    fetchedAt:  st.fetchedAt,
  }
}

/**
 * Las otras versiones de cada nota (ver `translationGroupId`), para un conjunto
 * de piezas, en UN solo query. El grupo no es una relación de Prisma —es un id
 * compartido—, así que resolverlo fila por fila serían N queries por listado.
 * Devuelve Map<groupId, [{id,title,language,publishedUrl,status}]>.
 */
async function loadTranslationGroups(projectId, workspaceId, groupIds) {
  const ids = [...new Set(groupIds.filter(Boolean))]
  if (ids.length === 0) return new Map()
  const rows = await prisma.contentPiece.findMany({
    where:  { projectId, workspaceId, deletedAt: null, translationGroupId: { in: ids } },
    select: { id: true, title: true, language: true, publishedUrl: true, status: true, translationGroupId: true },
    orderBy: { language: 'asc' },
  })
  const map = new Map()
  for (const r of rows) {
    const list = map.get(r.translationGroupId) ?? []
    list.push({ id: r.id, title: r.title, language: r.language, publishedUrl: r.publishedUrl, status: r.status })
    map.set(r.translationGroupId, list)
  }
  return map
}

/** Las traducciones de UNA pieza: su grupo, menos ella misma. */
function siblingsFrom(groups, piece) {
  if (!piece.translationGroupId) return []
  return (groups.get(piece.translationGroupId) ?? []).filter(s => s.id !== piece.id)
}

/**
 * Valida y normaliza los datos SEO editables de una nota. Sólo estos cuatro:
 * el resto de la pieza (título, estado, copy, fechas) es de Contenido y no se
 * toca desde acá. Devuelve { data } o { error }.
 */
function buildSeoData(body = {}) {
  const data = {}

  if (body.publishedUrl !== undefined) {
    const url = typeof body.publishedUrl === 'string' ? body.publishedUrl.trim() : ''
    if (url && !/^https?:\/\//i.test(url)) return { error: 'La URL tiene que empezar con http:// o https://' }
    if (url.length > MAX_URL) return { error: 'URL demasiado larga' }
    data.publishedUrl = url || null
  }

  // La keyword se recorta: se compara contra lo que devuelve Search Console, y
  // un espacio al final la convierte en otra keyword que no matchea con nada.
  if (body.seoKeyword !== undefined) {
    const kw = typeof body.seoKeyword === 'string' ? body.seoKeyword.trim() : ''
    data.seoKeyword = kw || null
  }

  // Idioma: '' o null lo borra, y un valor fuera del catálogo es un error del
  // cliente, no algo a ignorar — guardarlo dejaría una nota que ningún filtro
  // del inventario encuentra.
  if (body.language !== undefined) {
    if (body.language === null || body.language === '') data.language = null
    else if (!isValidLanguage(body.language)) return { error: 'Idioma inválido' }
    else data.language = body.language
  }

  if (body.seoKeywords !== undefined) {
    if (!Array.isArray(body.seoKeywords)) return { error: 'seoKeywords debe ser un array' }
    // Dedup ANTES del tope: si no, tres copias de la misma keyword se gastan
    // tres de los diez lugares.
    const clean = [...new Set(
      body.seoKeywords.map(k => String(k ?? '').trim()).filter(Boolean),
    )].slice(0, MAX_SEO_KEYWORDS)
    data.seoKeywords = JSON.stringify(clean)
  }

  return { data }
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

/** Una nota en la misma forma que una fila del inventario (con sus traducciones). */
async function loadNote(pid, projectId, workspaceId) {
  const piece = await prisma.contentPiece.findFirst({
    where:  { id: Number(pid), projectId, workspaceId, deletedAt: null },
    select: ROW_SELECT,
  })
  if (!piece) return null
  const groups = await loadTranslationGroups(projectId, workspaceId, [piece.translationGroupId])
  return formatRow(piece, siblingsFrom(groups, piece))
}

/**
 * GET /api/marketing/projects/:id/blog/inventory
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
 * POST /api/marketing/projects/:id/blog/refresh
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
 * POST /api/marketing/projects/:id/blog/import
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

    // Una importación crea piezas de Contenido: el mismo evento que ya escucha
    // el calendario alcanza para que se recargue solo en las pestañas abiertas.
    // Sin `piece` porque son muchas — los handlers lo usan sólo como disparador
    // de un reload (ver useContentSocket.js), no mergean el payload.
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
 * POST /api/marketing/projects/:id/blog/notes/:pid/translations
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

    res.json(await loadNote(pid, projectId, workspaceId))
  } catch (err) { next(err) }
}

/**
 * DELETE /api/marketing/projects/:id/blog/notes/:pid/translations
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

    res.json({ unlinked: true, note: await loadNote(piece.id, projectId, workspaceId) })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/blog/notes/:pid
 * Ficha SEO de una nota: lo mismo que su fila del inventario. Sirve también para
 * piezas que todavía no tienen URL (es lo que se ve justo antes de cargársela).
 */
async function getNote(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const note = await loadNote(req.params.pid, ctx.projectId, ctx.workspaceId)
    if (!note) return res.status(404).json({ error: 'Pieza no encontrada' })
    res.json(note)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/marketing/projects/:id/blog/notes/:pid
 * Body: { publishedUrl?, language?, seoKeyword?, seoKeywords? } — los datos SEO
 * de la nota. Cargarle la URL a una pieza es lo que la suma al inventario, y
 * sacársela la saca (sus métricas se limpian en el próximo refresco).
 */
async function updateNote(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { workspaceId, projectId } = ctx

    const { data, error } = buildSeoData(req.body)
    if (error) return res.status(400).json({ error })
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nada para actualizar' })

    const piece = await prisma.contentPiece.findFirst({
      where:  { id: Number(req.params.pid), projectId, workspaceId, deletedAt: null },
      select: { id: true },
    })
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })

    await prisma.contentPiece.update({ where: { id: piece.id }, data })
    res.json(await loadNote(piece.id, projectId, workspaceId))
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/blog/pieces?q=&withoutUrl=1
 * Buscador de piezas del proyecto por título, para dos cosas del inventario:
 * sumar una nota que ya existe en Contenido (`withoutUrl=1`: las que todavía no
 * tienen URL) y elegir la otra versión al vincular una traducción. Devuelve lo
 * mínimo — es un selector, no un listado de Contenido.
 */
async function searchPieces(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const q = String(req.query.q ?? '').trim()
    if (!q) return res.json({ pieces: [] })

    const where = {
      projectId: ctx.projectId, workspaceId: ctx.workspaceId, deletedAt: null,
      AND: buildTextSearchFilters(q, ['title', 'publishedUrl']),
    }
    if (req.query.withoutUrl === '1') where.publishedUrl = null

    const pieces = await prisma.contentPiece.findMany({
      where,
      select:  { id: true, title: true, status: true, language: true, publishedUrl: true, scheduledDate: true },
      orderBy: { updatedAt: 'desc' },
      take:    10,
    })
    res.json({
      pieces: pieces.map(p => ({ ...p, statusLabel: statusMeta(p.status)?.label ?? p.status })),
    })
  } catch (err) { next(err) }
}

module.exports = {
  getInventory,
  getNote,
  updateNote,
  searchPieces,
  refreshSeo,
  importFromSite,
  linkTranslation,
  unlinkTranslation,
  // expuestos para los tests
  sortRows,
  buildSeoData,
  MAX_SEO_KEYWORDS,
}
