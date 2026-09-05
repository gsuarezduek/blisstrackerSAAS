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
  alertScrapeFailure, parseSocialHandle, pick, toCount, normalizeGenericPost,
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

const FACEBOOK_POST_FIELDS = {
  id:        { aliases: ['postId', 'id', 'url', 'postUrl', 'link', 'permalink'] },
  text:      { aliases: ['text', 'message', 'content', 'caption', 'postText', 'description'], default: '' },
  likes:     { aliases: ['likes', 'likesCount', 'numLikes', 'reactionsCount', 'reactions', 'reactionsCount', 'totalReactionCount', 'likeCount'], count: true },
  comments:  { aliases: ['comments', 'commentsCount', 'numComments', 'commentCount'], count: true },
  shares:    { aliases: ['shares', 'sharesCount', 'numShares', 'shareCount', 'reshareCount'], count: true },
  timestamp: { aliases: ['timestamp', 'time', 'date', 'publishedAt', 'postedAt', 'createdAt', 'postedAtISO', 'publishTime'] },
  url:       { aliases: ['url', 'postUrl', 'link', 'permalink', 'postLink'] },
  imgSrc:    { aliases: ['image', 'imageUrl', 'thumbnail', 'imgSrc', 'mediaUrl', 'photo', 'fullPicture'] },
}

function normalizeFacebookPost(p) {
  return normalizeGenericPost(p, FACEBOOK_POST_FIELDS)
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

  const pageUrl = /^\d+$/.test(identifier)
    ? `https://www.facebook.com/profile.php?id=${identifier}`
    : `https://www.facebook.com/${identifier}/`
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
 * Diagnóstico: corre el scrape de Facebook y devuelve el output CRUDO de Apify
 * junto con lo normalizado/computado. Admin-only en el controller.
 */
async function debugScrapeFacebook(urlOrSlug, opts = {}) {
  const identifier = parseFacebookPage(urlOrSlug)
  if (!identifier) throw scrapeError('URL o nombre de página de Facebook inválido.', 'INVALID_USERNAME', 400)

  let cfgLimit = 0
  try { cfgLimit = Number(await getSetting('apifyFacebookPostsLimit')) || 0 } catch { /* DB no disponible */ }
  const postsLimit = opts.postsLimit ?? (cfgLimit > 0 ? cfgLimit : DEFAULT_FACEBOOK_POSTS_LIMIT)

  const items = await runApifyFacebook(identifier, { postsLimit, workspaceId: opts.workspaceId ?? null, projectId: opts.projectId ?? null, action: 'diagnostic', actionLabel: 'Facebook — diagnóstico' })
  const { profile, posts } = normalizeApifyFacebook(items, identifier)
  const metrics = computeFacebookScrapeMetrics(profile, posts, opts.targetMonth ?? null)

  return {
    identifier,
    itemCount: items.length,
    topLevelKeysFirstItem: items[0] && typeof items[0] === 'object' ? Object.keys(items[0]) : null,
    rawSample: items.slice(0, 2),
    normalized: {
      followers:     profile.followers_count,
      name:          profile.name,
      postsDetected: posts.length,
      firstPosts:    posts.slice(0, 3),
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
 * fetchFacebookMetrics, más { identifier, scraped: true, monthCoverageComplete }.
 * @param {string} urlOrSlug
 * @param {object} opts — { postsLimit, targetMonth, workspaceId, projectId, action, actionLabel }
 */
async function scrapeFacebookPage(urlOrSlug, opts = {}) {
  const identifier = parseFacebookPage(urlOrSlug)
  if (!identifier) throw scrapeError('URL o nombre de página de Facebook inválido.', 'INVALID_USERNAME', 400)

  let cfgLimit = 0
  try { cfgLimit = Number(await getSetting('apifyFacebookPostsLimit')) || 0 } catch { /* DB no disponible */ }
  const postsLimit = opts.postsLimit ?? (cfgLimit > 0 ? cfgLimit : DEFAULT_FACEBOOK_POSTS_LIMIT)
  const items = await runApifyFacebook(identifier, {
    postsLimit,
    workspaceId: opts.workspaceId ?? null,
    projectId:   opts.projectId ?? null,
    action:      opts.action ?? null,
    actionLabel: opts.actionLabel ?? null,
  })
  const { profile, posts } = normalizeApifyFacebook(items, identifier)
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

  return { ...metrics, identifier, scraped: true, monthCoverageComplete }
}

module.exports = { parseFacebookPage, scrapeFacebookPage, debugScrapeFacebook }
