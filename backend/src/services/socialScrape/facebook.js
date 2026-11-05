// ─── Facebook (Páginas, scraping público) ──────────────────────────────────────
// El scraping sólo accede a datos PÚBLICOS de la Página: seguidores / "me gusta",
// posts recientes (texto, reacciones, comentarios, compartidos), nombre y foto. NO
// expone reach, impresiones ni page views (eso es solo API oficial con read_insights).
// computeFacebookScrapeMetrics deja esos campos en null.

const { computeFacebookScrapeMetrics } = require('../facebook.service')
const { getSetting } = require('../../lib/platformSettings')
const { DEFAULT_TZ } = require('../../utils/dates')
const {
  scrapeError, getApifyTokens, runApifyActor, detectApifyDatasetError,
  alertScrapeFailure, parseSocialHandle, pick, toCount, normalizeGenericPost, mergeById,
} = require('./_shared')

const DEFAULT_FACEBOOK_POSTS_LIMIT = Number(process.env.APIFY_FACEBOOK_POSTS_LIMIT) || 30

/**
 * Extrae el identificador (slug o id numérico) de una Página de Facebook de una
 * URL o nombre. Acepta: "miempresa", "https://www.facebook.com/miempresa/",
 * "/miempresa/", "facebook.com/profile.php?id=123456".
 */
function parseFacebookPage(input) {
  if (!input) return null
  const s0 = String(input).trim()
  if (!s0) return null
  // facebook.com/profile.php?id=NNN → devolvemos el id numérico (caso especial,
  // no pasa por parseSocialHandle porque no es un slug sino un id de query string)
  const idMatch = s0.match(/facebook\.com\/profile\.php\?id=(\d+)/i)
  if (idMatch) return idMatch[1]

  const slug = parseSocialHandle(input, {
    urlRegex:     /(?:facebook|fb)\.com\/(?:pg\/)?([^/?#]+)/i,
    charsetRegex: /^[A-Za-z0-9\-._%]{1,120}$/, // slug de página (o id numérico)
  })
  // No tratar "profile.php" residual como slug
  if (slug === 'profile.php') return null
  return slug
}

// URL pública de la Página a partir del identificador (slug o id numérico).
function facebookPageUrl(identifier) {
  return /^\d+$/.test(identifier)
    ? `https://www.facebook.com/profile.php?id=${identifier}`
    : `https://www.facebook.com/${identifier}/`
}

const FACEBOOK_POST_FIELDS = {
  id:        { aliases: ['postId', 'id', 'url', 'postUrl', 'link', 'permalink'] },
  text:      { aliases: ['text', 'message', 'content', 'caption', 'postText', 'description'], default: '' },
  likes:     { aliases: ['likes', 'likesCount', 'numLikes', 'reactionsCount', 'reactions', 'reactionsCount', 'totalReactionCount', 'likeCount'], count: true },
  comments:  { aliases: ['comments', 'commentsCount', 'numComments', 'commentCount'], count: true },
  shares:    { aliases: ['shares', 'sharesCount', 'numShares', 'shareCount', 'reshareCount'], count: true },
  // `time` va antes que `timestamp` porque el actor de posts manda las dos y `time`
  // ya es ISO; `toTimestamp` (ts: true) igual arregla el epoch en segundos.
  timestamp: { aliases: ['time', 'timestamp', 'date', 'publishedAt', 'postedAt', 'createdAt', 'postedAtISO', 'publishTime'], ts: true },
  url:       { aliases: ['url', 'postUrl', 'link', 'permalink', 'postLink', 'topLevelUrl'] },
  imgSrc:    { aliases: ['image', 'imageUrl', 'thumbnail', 'imgSrc', 'mediaUrl', 'photo', 'fullPicture'] },
}

/**
 * Portada de un post de Facebook. El actor de posts no trae un campo plano de imagen:
 * manda `media: [{ thumbnail, photo_image: { uri }, url, ... }]` (y para un video, el
 * frame en `thumbnail`). Se usa como fallback de los alias planos de `imgSrc`.
 */
function facebookPostImage(p) {
  const media = Array.isArray(p?.media) ? p.media : []
  for (const m of media) {
    if (typeof m === 'string') return m
    const u = m?.thumbnail ?? m?.photo_image?.uri ?? m?.image?.uri ?? m?.imageUrl ?? m?.url ?? null
    if (u) return u
  }
  return null
}

function normalizeFacebookPost(p) {
  const out = normalizeGenericPost(p, FACEBOOK_POST_FIELDS)
  if (!out.imgSrc) out.imgSrc = facebookPostImage(p)
  return out
}

/**
 * ¿Este item del dataset es un POST (y no la ficha de la página)? El actor de posts y
 * el de páginas comparten varias claves (`pageName`, `facebookId`, `pageAdLibrary`),
 * así que el corte es: tiene identidad de post (`postId`/`feedbackId`/`topLevelUrl`) o
 * fecha+contenido, y no es la ficha (que trae `followers`/`likes` de página sin postId).
 */
function looksLikeFacebookPost(i) {
  if (!i || typeof i !== 'object' || i.error) return false
  if (i.postId != null || i.feedbackId != null || i.topLevelUrl != null) return true
  const hasDate    = i.time != null || i.timestamp != null || i.publishedAt != null
  const hasContent = i.text != null || i.message != null || i.likes != null ||
                     i.reactionsCount != null || i.commentsCount != null || i.comments != null
  const isPageCard = i.followers != null || i.followersCount != null || i.fanCount != null
  return hasDate && hasContent && !isPageCard
}

// Posts crudos de un dataset del actor de posts (descarta la ficha de página si el
// actor mezcla, y los items de error que ya se chequearon arriba).
function pickFacebookPosts(items) {
  return (Array.isArray(items) ? items : []).filter(looksLikeFacebookPost)
}

function facebookProfileFrom(o, identifier) {
  return {
    id:              pick(o, ['pageId', 'id', 'facebookId', 'entityUrn']),
    followers_count: toCount(pick(o, ['followers', 'followersCount', 'followerCount', 'numFollowers'])),
    fan_count:       toCount(pick(o, ['likes', 'likesCount', 'fanCount', 'pageLikes'])) || null,
    name:            pick(o, ['name', 'pageName', 'title', 'companyName']) ?? identifier,
  }
}

/**
 * Normaliza la respuesta del actor de Facebook al shape { profile, posts }.
 * Tolera dos formas comunes de actor:
 *  (A) "detalle de página": 1 item con followers + array de posts anidado.
 *  (B) "posts de página": N items, cada uno un post (con página anidada opcional).
 */
function normalizeApifyFacebook(items, identifier) {
  if (!Array.isArray(items) || items.length === 0) {
    return { profile: facebookProfileFrom({}, identifier), posts: [] }
  }

  // (A) item de página con posts anidados
  const detail = items.find(i => i && (i.followers != null || i.followersCount != null || i.likes != null || i.fanCount != null) &&
    (Array.isArray(i.posts) || Array.isArray(i.latestPosts) || Array.isArray(i.updates)))
  if (detail) {
    const postsArr = detail.posts ?? detail.latestPosts ?? detail.updates ?? []
    return { profile: facebookProfileFrom(detail, identifier), posts: postsArr.map(normalizeFacebookPost) }
  }

  // (B) items que son posts
  const looksLikePosts = items.every(i => i && (i.text != null || i.message != null ||
    i.likesCount != null || i.reactionsCount != null || i.postUrl != null || i.postId != null))
  if (looksLikePosts) {
    const first = items[0]
    const page = first.page ?? first.pageInfo ?? first.author ?? first.pageDetails ?? {}
    return { profile: facebookProfileFrom(page, identifier), posts: items.map(normalizeFacebookPost) }
  }

  // (C) item de página sin posts (solo seguidores/nombre)
  const page = items.find(i => i && (i.followers != null || i.followersCount != null || i.likes != null || i.name != null || i.pageName != null))
  if (page) {
    const postsArr = page.posts ?? page.latestPosts ?? []
    return { profile: facebookProfileFrom(page, identifier), posts: postsArr.map(normalizeFacebookPost) }
  }

  return { profile: facebookProfileFrom(items[0], identifier), posts: [] }
}

/**
 * Corre el actor de Facebook en Apify (sincrónico) y devuelve los items crudos.
 * Actor: PlatformSetting apifyFacebookActor (SuperAdmin → Configuración) → env
 * APIFY_FACEBOOK_ACTOR. Sin ninguno → SCRAPE_NOT_CONFIGURED.
 */
async function runApifyFacebook(identifier, opts = {}) {
  const { postsLimit = DEFAULT_FACEBOOK_POSTS_LIMIT, workspaceId = null, projectId = null, action = null, actionLabel = null } = opts
  const tokens = await getApifyTokens()
  if (tokens.length === 0) {
    alertScrapeFailure({ code: 'SCRAPE_NOT_CONFIGURED', detail: 'Falta APIFY_API_TOKEN en el servidor.', username: identifier, workspaceId, actionLabel })
    throw scrapeError('El scraping no está configurado en el servidor (falta APIFY_API_TOKEN).', 'SCRAPE_NOT_CONFIGURED', 503)
  }
  let actor = ''
  try { actor = (await getSetting('apifyFacebookActor')) || '' } catch { /* DB no disponible → env */ }
  actor = actor.trim() || process.env.APIFY_FACEBOOK_ACTOR
  if (!actor) {
    alertScrapeFailure({ code: 'SCRAPE_NOT_CONFIGURED', detail: 'Falta configurar el actor de Facebook (setting apifyFacebookActor o env APIFY_FACEBOOK_ACTOR).', username: identifier, workspaceId, actionLabel })
    throw scrapeError('El scraping de Facebook no está configurado: falta elegir el actor de Apify (SuperAdmin → Configuración → "Actor de Apify para Facebook", o la variable de entorno APIFY_FACEBOOK_ACTOR).', 'SCRAPE_NOT_CONFIGURED', 503)
  }
  const actorId = actor.replace('/', '~')

  const pageUrl = facebookPageUrl(identifier)
  // Input tolerante: distintos actores aceptan distintas claves; la mayoría ignora
  // las que no conoce. Si tu actor usa otra clave, ajustá acá (punto único).
  const input = {
    identifier:  [identifier],
    pageName:    [identifier],
    page:        identifier,
    pageUrl,
    pageUrls:    [pageUrl],
    urls:        [pageUrl],
    startUrls:   [{ url: pageUrl }],
    maxPosts:    postsLimit,
    resultsLimit: postsLimit,
    limit:       postsLimit,
  }

  const attribution = { workspaceId, projectId, platform: 'facebook', action }
  let items
  try {
    items = await runApifyActor(actorId, input, { tokens, isDatasetError: detectApifyDatasetError, attribution })
  } catch (err) {
    const apifyMsg = err.response?.data?.error?.message || err.message
    alertScrapeFailure({ code: 'SCRAPE_PROVIDER_ERROR', detail: apifyMsg, username: identifier, workspaceId, actionLabel })
    throw scrapeError(`El proveedor de scraping falló: ${apifyMsg}`, 'SCRAPE_PROVIDER_ERROR', 502)
  }

  console.log(`[Scrape] Facebook ${identifier} · actor=${actorId} · items=${items.length}${items[0] && typeof items[0] === 'object' ? ` · keys[0]=${Object.keys(items[0]).slice(0, 20).join(',')}` : ''}`)

  const errItem   = items.find(i => i && typeof i === 'object' && typeof i.error === 'string')
  const hasUsable = items.some(i => i && typeof i === 'object' && !i.error)
  if (errItem && !hasUsable) {
    alertScrapeFailure({ code: 'SCRAPE_PROVIDER_ERROR', detail: errItem.error, username: identifier, workspaceId, actionLabel })
    throw scrapeError(`El proveedor de scraping devolvió un error: ${errItem.error}`, 'SCRAPE_PROVIDER_ERROR', 502)
  }

  if (items.length === 0) {
    throw scrapeError(`No se encontró la página "${identifier}" en Facebook (¿URL/nombre mal escrito o página inexistente?).`, 'PROFILE_NOT_FOUND', 404)
  }
  return items
}

/**
 * Resuelve el actor de POSTS de Facebook (2ª llamada). PlatformSetting
 * `apifyFacebookPostsActor` → env `APIFY_FACEBOOK_POSTS_ACTOR`. Devuelve '' si está
 * explícitamente desactivado ("none"/"off"/"disabled") o si no hay ninguno de los dos
 * (comportamiento anterior: solo la ficha de la página). Mismo patrón que Instagram.
 */
async function resolveFacebookPostsActor() {
  let setting = ''
  try { setting = (await getSetting('apifyFacebookPostsActor')) || '' } catch { /* DB no disponible → env */ }
  const raw = (setting.trim() || process.env.APIFY_FACEBOOK_POSTS_ACTOR || '').trim()
  if (!raw) return ''
  if (['none', 'off', 'disabled'].includes(raw.toLowerCase())) return ''
  return raw.replace('/', '~')
}

/**
 * Corre el actor de POSTS de Facebook (2ª llamada) y devuelve los posts CRUDOS.
 * Existe porque el actor de Páginas típico (`apify~facebook-pages-scraper`) devuelve
 * SOLO la ficha de la página — seguidores, categoría, teléfono, horarios — y ningún
 * post, así que `postsThisMonth`/engagement quedaban en 0 por falta de datos, no por
 * un mapeo mal hecho. Los posts de una Página son otro actor
 * (recomendado `apify~facebook-posts-scraper`).
 * Best-effort: devuelve null si no hay actor configurado o no hay tokens; si el actor
 * falla, lanza un error estructurado que el caller atrapa (los seguidores de la 1ª
 * llamada no se pierden).
 * @returns {Array|null} posts crudos
 */
async function runApifyFacebookPosts(identifier, opts = {}) {
  const { postsLimit = DEFAULT_FACEBOOK_POSTS_LIMIT, workspaceId = null, projectId = null, action = null, actionLabel = null } = opts
  const tokens = await getApifyTokens()
  if (tokens.length === 0) return null

  const actorId = await resolveFacebookPostsActor()
  if (!actorId) return null                              // 2ª llamada desactivada

  const pageUrl = facebookPageUrl(identifier)
  // Mismo input tolerante que la 1ª llamada: `apify~facebook-posts-scraper` usa
  // `startUrls` + `resultsLimit`, otros actores usan otras claves y las ignoran.
  const input = {
    startUrls:    [{ url: pageUrl }],
    resultsLimit: postsLimit,
    pageUrls:     [pageUrl],
    urls:         [pageUrl],
    pageName:     [identifier],
    maxPosts:     postsLimit,
    limit:        postsLimit,
  }

  const attribution = { workspaceId, projectId, platform: 'facebook', action }
  let items
  try {
    items = await runApifyActor(actorId, input, { tokens, isDatasetError: detectApifyDatasetError, attribution })
  } catch (err) {
    const apifyMsg = err.response?.data?.error?.message || err.message
    alertScrapeFailure({ code: 'SCRAPE_PROVIDER_ERROR', detail: `Actor de posts FB: ${apifyMsg}`, username: identifier, workspaceId, actionLabel })
    throw scrapeError(`El actor de posts de Facebook falló: ${apifyMsg}`, 'SCRAPE_PROVIDER_ERROR', 502)
  }

  const errItem   = items.find(i => i && typeof i === 'object' && typeof i.error === 'string')
  const posts     = pickFacebookPosts(items)
  if (errItem && posts.length === 0) {
    alertScrapeFailure({ code: 'SCRAPE_PROVIDER_ERROR', detail: `Actor de posts FB: ${errItem.error}`, username: identifier, workspaceId, actionLabel })
    throw scrapeError(`El actor de posts de Facebook devolvió un error: ${errItem.error}`, 'SCRAPE_PROVIDER_ERROR', 502)
  }
  console.log(`[Scrape] Facebook posts ${identifier} · actor=${actorId} · items=${items.length} · posts=${posts.length}`)
  return posts
}

/**
 * Trae los posts de la 2ª llamada ya normalizados y fusionados con los que haya traído
 * el actor de página (dedup por id, los del actor de posts ganan por ser más completos).
 * Best-effort: cualquier falla deja los posts de la 1ª llamada intactos.
 * @returns {{ posts: Array, postsActorUsed: boolean, error: string|null }}
 */
async function withFacebookPostsActor(identifier, pagePosts, opts = {}) {
  try {
    const rawPosts = await runApifyFacebookPosts(identifier, opts)
    if (!Array.isArray(rawPosts) || rawPosts.length === 0) return { posts: pagePosts, postsActorUsed: false, error: null }
    const actorPosts = rawPosts.map(normalizeFacebookPost)
    return { posts: mergeById(actorPosts, pagePosts), postsActorUsed: true, error: null }
  } catch (err) {
    console.warn(`[Scrape] Facebook ${identifier}: 2ª llamada (posts) falló, uso los posts del actor de página:`, err.message)
    return { posts: pagePosts, postsActorUsed: false, error: err.message }
  }
}

/**
 * Diagnóstico: corre las DOS llamadas de Facebook (actor de página + actor de posts)
 * por separado y devuelve el output CRUDO de Apify de cada una junto con lo
 * normalizado/computado, para ver de dónde salen (o no salen) los posts.
 * Admin-only en el controller.
 */
async function debugScrapeFacebook(urlOrSlug, opts = {}) {
  const identifier = parseFacebookPage(urlOrSlug)
  if (!identifier) throw scrapeError('URL o nombre de página de Facebook inválido.', 'INVALID_USERNAME', 400)

  let cfgLimit = 0
  try { cfgLimit = Number(await getSetting('apifyFacebookPostsLimit')) || 0 } catch { /* DB no disponible */ }
  const postsLimit = opts.postsLimit ?? (cfgLimit > 0 ? cfgLimit : DEFAULT_FACEBOOK_POSTS_LIMIT)
  const targetMonth = opts.targetMonth ?? null
  const runOpts = { postsLimit, workspaceId: opts.workspaceId ?? null, projectId: opts.projectId ?? null, action: 'diagnostic', actionLabel: 'Facebook — diagnóstico' }

  const monthOf = (ts) => {
    if (!ts) return null
    const d = new Date(new Date(ts).toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
    return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const describe = (arr) => ({
    count:    arr.length,
    inTarget: targetMonth ? arr.filter(p => monthOf(p.timestamp) === targetMonth).length : null,
    posts:    arr.slice(0, 20).map(p => ({ id: p.id, timestamp: p.timestamp, month: monthOf(p.timestamp), likes: p.likes, comments: p.comments, inTarget: targetMonth ? monthOf(p.timestamp) === targetMonth : null })),
  })

  const items = await runApifyFacebook(identifier, runOpts)
  const { profile, posts: pagePosts } = normalizeApifyFacebook(items, identifier)

  // 2ª llamada por separado (no por `withFacebookPostsActor`) para poder mostrar su
  // crudo y su error aunque la fusión se caiga al camino de la 1ª.
  let rawPosts = null
  let postsActorError = null
  try {
    rawPosts = await runApifyFacebookPosts(identifier, runOpts)
  } catch (err) {
    postsActorError = err.message
  }
  const actorPosts = Array.isArray(rawPosts) ? rawPosts.map(normalizeFacebookPost) : []
  const merged     = mergeById(actorPosts, pagePosts)
  const metrics    = computeFacebookScrapeMetrics(profile, merged, targetMonth)

  return {
    identifier,
    itemCount: items.length,
    topLevelKeysFirstItem: items[0] && typeof items[0] === 'object' ? Object.keys(items[0]) : null,
    rawSample: items.slice(0, 2),
    postsActor: {
      configured:    (await resolveFacebookPostsActor()) !== '',
      error:         postsActorError,
      rawItemCount:  Array.isArray(rawPosts) ? rawPosts.length : null,
      rawSample:     Array.isArray(rawPosts) ? rawPosts.slice(0, 1) : null,
      topLevelKeys:  Array.isArray(rawPosts) && rawPosts[0] && typeof rawPosts[0] === 'object' ? Object.keys(rawPosts[0]) : null,
    },
    fuentes: {
      pagina: describe(pagePosts),
      posts:  describe(actorPosts),
      fusion: describe(merged),
    },
    normalized: {
      followers:     profile.followers_count,
      name:          profile.name,
      postsDetected: merged.length,
      firstPosts:    merged.slice(0, 3),
    },
    metricsSummary: {
      followersCount: metrics.followersCount,
      postsThisMonth: metrics.postsThisMonth,
      totalLikes:     metrics.totalLikes,
      engagementRate: metrics.engagementRate,
    },
  }
}

/**
 * Scrapea una Página pública de Facebook y devuelve métricas en el shape de
 * fetchFacebookMetrics, más { identifier, scraped: true, monthCoverageComplete,
 * postsActorUsed }.
 * @param {string} urlOrSlug
 * @param {object} opts — { postsLimit, targetMonth, workspaceId, projectId, action, actionLabel, skipPostsActor }
 */
async function scrapeFacebookPage(urlOrSlug, opts = {}) {
  const identifier = parseFacebookPage(urlOrSlug)
  if (!identifier) throw scrapeError('URL o nombre de página de Facebook inválido.', 'INVALID_USERNAME', 400)

  let cfgLimit = 0
  try { cfgLimit = Number(await getSetting('apifyFacebookPostsLimit')) || 0 } catch { /* DB no disponible */ }
  const postsLimit = opts.postsLimit ?? (cfgLimit > 0 ? cfgLimit : DEFAULT_FACEBOOK_POSTS_LIMIT)
  const runOpts = {
    postsLimit,
    workspaceId: opts.workspaceId ?? null,
    projectId:   opts.projectId ?? null,
    action:      opts.action ?? null,
    actionLabel: opts.actionLabel ?? null,
  }
  const items = await runApifyFacebook(identifier, runOpts)
  const { profile, posts: pagePosts } = normalizeApifyFacebook(items, identifier)

  // 2ª llamada (si hay actor de posts configurado): el actor de Páginas típico
  // devuelve SOLO la ficha de la página — seguidores sí, posts nunca —, así que sin
  // esto `postsThisMonth`/engagement quedan en 0. `skipPostsActor` fuerza el scrape
  // "simple" (lo usan los competidores, para no duplicar el costo de Apify).
  let posts = pagePosts
  let postsActorUsed = false
  if (!opts.skipPostsActor) {
    const res = await withFacebookPostsActor(identifier, pagePosts, runOpts)
    posts = res.posts
    postsActorUsed = res.postsActorUsed
  }

  const metrics = computeFacebookScrapeMetrics(profile, posts, opts.targetMonth ?? null)

  let monthCoverageComplete = true
  if (opts.targetMonth && posts.length > 0) {
    const monthOf = (ts) => {
      const d = new Date(new Date(ts).toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
      return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    const reachedBeforeMonth = posts.some(p => p.timestamp && monthOf(p.timestamp) && monthOf(p.timestamp) < opts.targetMonth)
    const hitCap = posts.length >= postsLimit
    monthCoverageComplete = reachedBeforeMonth || !hitCap
    if (!monthCoverageComplete) {
      console.warn(`[Scrape] Facebook ${identifier}: posible mes incompleto (${posts.length} posts traídos, tope ${postsLimit}). Subí APIFY_FACEBOOK_POSTS_LIMIT si la página postea mucho.`)
    }
  }

  return { ...metrics, identifier, scraped: true, monthCoverageComplete, postsActorUsed }
}

module.exports = {
  parseFacebookPage,
  scrapeFacebookPage,
  debugScrapeFacebook,
  // exportados para los tests del mapeo de posts (el punto único de ajuste si se
  // cambia de actor)
  normalizeApifyFacebook,
  normalizeFacebookPost,
  pickFacebookPosts,
}
