// ─── LinkedIn (Company Pages, scraping público) ────────────────────────────────
// El scraping sólo accede a datos PÚBLICOS de la Company Page: seguidores, posts
// recientes (texto, reacciones, comentarios, compartidos), nombre y logo. NO
// expone impresiones, clicks, CTR, page views ni demographics (eso es solo API
// oficial). computeLinkedinScrapeMetrics deja esos campos en null.

const { computeLinkedinScrapeMetrics } = require('../linkedin.service')
const { getSetting } = require('../../lib/platformSettings')
const { DEFAULT_TZ } = require('../../utils/dates')
const {
  scrapeError, getApifyTokens, runApifyActor, detectApifyDatasetError,
  alertScrapeFailure, parseSocialHandle, pick, toCount, normalizeGenericPost,
} = require('./_shared')

const DEFAULT_LINKEDIN_POSTS_LIMIT = Number(process.env.APIFY_LINKEDIN_POSTS_LIMIT) || 30

/**
 * Extrae el identificador (slug) de una Company Page de LinkedIn de una URL o nombre.
 * Acepta: "miempresa", "https://www.linkedin.com/company/miempresa/", "/company/miempresa/".
 */
function parseLinkedinCompany(input) {
  return parseSocialHandle(input, {
    urlRegex:     /linkedin\.com\/(?:company|showcase|school)\/([^/?#]+)/i,
    charsetRegex: /^[A-Za-z0-9\-._%]{1,120}$/, // slug de company: más permisivo que IG
  })
}

const LINKEDIN_POST_FIELDS = {
  id:        { aliases: ['urn', 'activityUrn', 'shareUrn', 'postUrn', 'id', 'url', 'postUrl', 'link'] },
  urn:       { aliases: ['urn', 'activityUrn', 'shareUrn', 'postUrn'] },
  text:      { aliases: ['text', 'commentary', 'content', 'caption', 'postText', 'description'], default: '' },
  likes:     { aliases: ['likes', 'numLikes', 'likesCount', 'reactionsCount', 'reactions', 'totalReactionCount', 'numReactions', 'likeCount'], count: true },
  comments:  { aliases: ['comments', 'numComments', 'commentsCount', 'commentCount'], count: true },
  shares:    { aliases: ['shares', 'numShares', 'sharesCount', 'reposts', 'repostsCount', 'shareCount'], count: true },
  timestamp: { aliases: ['timestamp', 'postedAtTimestamp', 'postedAt', 'publishedAt', 'date', 'postedAtISO', 'time', 'createdAt'] },
  url:       { aliases: ['url', 'postUrl', 'link', 'postLink'] },
  imgSrc:    { aliases: ['image', 'imageUrl', 'thumbnail', 'imgSrc', 'mediaUrl'] },
}

function normalizeLinkedinPost(p) {
  return normalizeGenericPost(p, LINKEDIN_POST_FIELDS)
}

function linkedinProfileFrom(o, identifier) {
  return {
    id:              pick(o, ['id', 'companyId', 'entityUrn']),
    followers_count: toCount(pick(o, ['followerCount', 'followersCount', 'followers', 'numFollowers'])),
    name:            pick(o, ['name', 'companyName', 'title', 'localizedName']) ?? identifier,
    vanityName:      pick(o, ['universalName', 'vanityName', 'publicIdentifier']) ?? identifier,
    logo_url:        pick(o, ['logoUrl', 'logo', 'profilePicture', 'logoResolutionResult', 'image']),
  }
}

/**
 * Normaliza la respuesta del actor de LinkedIn al shape { profile, posts }.
 * Tolera dos formas comunes de actor:
 *  (A) "detalle de empresa": 1 item con followers + array de posts anidado.
 *  (B) "posts de empresa": N items, cada uno un post (con company anidada opcional).
 */
function normalizeApifyCompany(items, identifier) {
  if (!Array.isArray(items) || items.length === 0) {
    return { profile: linkedinProfileFrom({}, identifier), posts: [] }
  }

  // (A) item de empresa con posts anidados
  const detail = items.find(i => i && (i.followerCount != null || i.followersCount != null || i.followers != null) &&
    (Array.isArray(i.posts) || Array.isArray(i.updates) || Array.isArray(i.latestPosts) || Array.isArray(i.companyUpdates)))
  if (detail) {
    const postsArr = detail.posts ?? detail.updates ?? detail.latestPosts ?? detail.companyUpdates ?? []
    return { profile: linkedinProfileFrom(detail, identifier), posts: postsArr.map(normalizeLinkedinPost) }
  }

  // (B) items que son posts
  const looksLikePosts = items.every(i => i && (i.text != null || i.commentary != null ||
    i.reactionsCount != null || i.numLikes != null || i.postUrl != null || i.activityUrn != null))
  if (looksLikePosts) {
    const first = items[0]
    const company = first.company ?? first.author ?? first.companyDetails ?? first.actor ?? {}
    return { profile: linkedinProfileFrom(company, identifier), posts: items.map(normalizeLinkedinPost) }
  }

  // (C) item de empresa sin posts (solo seguidores/nombre)
  const company = items.find(i => i && (i.followerCount != null || i.followersCount != null || i.name != null || i.companyName != null))
  if (company) {
    const postsArr = company.posts ?? company.updates ?? company.latestPosts ?? []
    return { profile: linkedinProfileFrom(company, identifier), posts: postsArr.map(normalizeLinkedinPost) }
  }

  return { profile: linkedinProfileFrom(items[0], identifier), posts: [] }
}

/**
 * Corre el actor de LinkedIn en Apify (sincrónico) y devuelve el array de items
 * crudos del dataset. Requiere APIFY_API_TOKEN y APIFY_LINKEDIN_ACTOR.
 */
async function runApifyLinkedin(identifier, opts = {}) {
  const { postsLimit = DEFAULT_LINKEDIN_POSTS_LIMIT, workspaceId = null, projectId = null, action = null, actionLabel = null } = opts
  const tokens = await getApifyTokens()
  if (tokens.length === 0) {
    alertScrapeFailure({ code: 'SCRAPE_NOT_CONFIGURED', detail: 'Falta APIFY_API_TOKEN en el servidor.', username: identifier, workspaceId, actionLabel })
    throw scrapeError('El scraping no está configurado en el servidor (falta APIFY_API_TOKEN).', 'SCRAPE_NOT_CONFIGURED', 503)
  }
  // Actor: prioriza el PlatformSetting (editable desde SuperAdmin → Configuración,
  // para probar/cambiar de actor sin redeploy); si está vacío, cae a la env var.
  let actor = ''
  try { actor = (await getSetting('apifyLinkedinActor')) || '' } catch { /* DB no disponible → env */ }
  actor = actor.trim() || process.env.APIFY_LINKEDIN_ACTOR
  if (!actor) {
    alertScrapeFailure({ code: 'SCRAPE_NOT_CONFIGURED', detail: 'Falta configurar el actor de LinkedIn (setting apifyLinkedinActor o env APIFY_LINKEDIN_ACTOR).', username: identifier, workspaceId, actionLabel })
    throw scrapeError('El scraping de LinkedIn no está configurado: falta elegir el actor de Apify (SuperAdmin → Configuración → "Actor de Apify para LinkedIn", o la variable de entorno APIFY_LINKEDIN_ACTOR).', 'SCRAPE_NOT_CONFIGURED', 503)
  }
  // En la API de Apify el ID del actor va con "~" (no "/"). Aceptamos la forma
  // "usuario/actor" que muestra la UI de Apify y la normalizamos.
  const actorId = actor.replace('/', '~')

  const companyUrl = `https://www.linkedin.com/company/${identifier}/`
  // Input tolerante: distintos actores aceptan distintas claves; la mayoría ignora
  // las que no conoce. Si tu actor usa otra clave, ajustá acá (punto único).
  const input = {
    identifier:  [identifier],
    companyName: [identifier],
    company:     identifier,
    companyUrl,
    companyUrls: [companyUrl],
    urls:        [companyUrl],
    startUrls:   [{ url: companyUrl }],
    maxPosts:    postsLimit,
    limit:       postsLimit,
  }

  const attribution = { workspaceId, projectId, platform: 'linkedin', action }
  let items
  try {
    items = await runApifyActor(actorId, input, { tokens, isDatasetError: detectApifyDatasetError, attribution })
  } catch (err) {
    const apifyMsg = err.response?.data?.error?.message || err.message
    alertScrapeFailure({ code: 'SCRAPE_PROVIDER_ERROR', detail: apifyMsg, username: identifier, workspaceId, actionLabel })
    throw scrapeError(`El proveedor de scraping falló: ${apifyMsg}`, 'SCRAPE_PROVIDER_ERROR', 502)
  }

  console.log(`[Scrape] LinkedIn ${identifier} · actor=${actorId} · items=${items.length}${items[0] && typeof items[0] === 'object' ? ` · keys[0]=${Object.keys(items[0]).slice(0, 20).join(',')}` : ''}`)

  // Algunos actores no devuelven HTTP error: meten un item `{ error: "..." }` en
  // el dataset (ej. "You have used up your credits"). Lo detectamos y lo
  // surfaceamos como error real en vez de contarlo como 0 datos.
  const errItem  = items.find(i => i && typeof i === 'object' && typeof i.error === 'string')
  const hasUsable = items.some(i => i && typeof i === 'object' && !i.error)
  if (errItem && !hasUsable) {
    alertScrapeFailure({ code: 'SCRAPE_PROVIDER_ERROR', detail: errItem.error, username: identifier, workspaceId, actionLabel })
    throw scrapeError(`El proveedor de scraping devolvió un error: ${errItem.error}`, 'SCRAPE_PROVIDER_ERROR', 502)
  }

  if (items.length === 0) {
    throw scrapeError(`No se encontró la empresa "${identifier}" en LinkedIn (¿URL/nombre mal escrito o página inexistente?).`, 'PROFILE_NOT_FOUND', 404)
  }
  return items
}

/**
 * Diagnóstico: corre el scrape de LinkedIn y devuelve el output CRUDO de Apify
 * junto con lo normalizado/computado, para inspeccionar por qué un actor devuelve
 * datos en 0 (input incorrecto vs. shape de campos distinto). Admin-only en el controller.
 */
async function debugScrapeLinkedin(urlOrSlug, opts = {}) {
  const identifier = parseLinkedinCompany(urlOrSlug)
  if (!identifier) throw scrapeError('URL o nombre de empresa de LinkedIn inválido.', 'INVALID_USERNAME', 400)

  let cfgLimit = 0
  try { cfgLimit = Number(await getSetting('apifyLinkedinPostsLimit')) || 0 } catch { /* DB no disponible */ }
  const postsLimit = opts.postsLimit ?? (cfgLimit > 0 ? cfgLimit : DEFAULT_LINKEDIN_POSTS_LIMIT)

  const items = await runApifyLinkedin(identifier, { postsLimit, workspaceId: opts.workspaceId ?? null, projectId: opts.projectId ?? null, action: 'diagnostic', actionLabel: 'LinkedIn — diagnóstico' })
  const { profile, posts } = normalizeApifyCompany(items, identifier)
  const metrics = computeLinkedinScrapeMetrics(profile, posts, opts.targetMonth ?? null)

  return {
    identifier,
    itemCount: items.length,
    topLevelKeysFirstItem: items[0] && typeof items[0] === 'object' ? Object.keys(items[0]) : null,
    rawSample: items.slice(0, 2),               // primeros 2 items crudos, completos (para ver todos los campos)
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
 * Scrapea una Company Page pública de LinkedIn y devuelve métricas en el shape de
 * fetchLinkedinMetrics, más { identifier, scraped: true, monthCoverageComplete }.
 * @param {string} urlOrSlug
 * @param {object} opts — { postsLimit, targetMonth, workspaceId, projectId, action, actionLabel }
 */
async function scrapeLinkedinCompany(urlOrSlug, opts = {}) {
  const identifier = parseLinkedinCompany(urlOrSlug)
  if (!identifier) throw scrapeError('URL o nombre de empresa de LinkedIn inválido.', 'INVALID_USERNAME', 400)

  // Límite de posts: PlatformSetting (>0) → env/default. Editable desde SuperAdmin.
  let cfgLimit = 0
  try { cfgLimit = Number(await getSetting('apifyLinkedinPostsLimit')) || 0 } catch { /* DB no disponible */ }
  const postsLimit = opts.postsLimit ?? (cfgLimit > 0 ? cfgLimit : DEFAULT_LINKEDIN_POSTS_LIMIT)
  const items = await runApifyLinkedin(identifier, {
    postsLimit,
    workspaceId: opts.workspaceId ?? null,
    projectId:   opts.projectId ?? null,
    action:      opts.action ?? null,
    actionLabel: opts.actionLabel ?? null,
  })
  const { profile, posts } = normalizeApifyCompany(items, identifier)
  const metrics = computeLinkedinScrapeMetrics(profile, posts, opts.targetMonth ?? null)

  // Cobertura del mes: si todos los posts traídos caen dentro del mes objetivo y se
  // alcanzó el tope de scrape, puede haber más posts del mes sin contabilizar.
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
      console.warn(`[Scrape] LinkedIn ${identifier}: posible mes incompleto (${posts.length} posts traídos, tope ${postsLimit}). Subí APIFY_LINKEDIN_POSTS_LIMIT si la página postea mucho.`)
    }
  }

  return { ...metrics, identifier, scraped: true, monthCoverageComplete }
}

module.exports = { parseLinkedinCompany, scrapeLinkedinCompany, debugScrapeLinkedin }
