const axios = require('axios')
const { computeInstagramMetrics } = require('./instagram.service')
const { computeLinkedinScrapeMetrics } = require('./linkedin.service')
const { computeFacebookScrapeMetrics } = require('./facebook.service')
const { sendPlatformNotification, platformCard } = require('./email.service')
const { getSetting } = require('../lib/platformSettings')

/**
 * Motor de scraping de redes sociales — abstraído por proveedor.
 *
 * Proveedor actual: Apify (https://apify.com). Requiere APIFY_API_TOKEN.
 * - Instagram: actor configurable con APIFY_INSTAGRAM_ACTOR (default
 *   apify~instagram-profile-scraper).
 * - LinkedIn (Company Pages): actor configurable desde SuperAdmin → Configuración
 *   (PlatformSetting apifyLinkedinActor) o, como fallback, la env APIFY_LINKEDIN_ACTOR.
 *   Sin ninguno de los dos, el scraping de LinkedIn devuelve SCRAPE_NOT_CONFIGURED.
 *
 * Todas las funciones devuelven datos en el MISMO shape que el fetch oficial de
 * cada red (fetchInstagramMetrics / fetchLinkedinMetrics) para reutilizar vistas,
 * snapshots e informes existentes. Lo que el scraping no puede ver (insights
 * privados) queda en null.
 */

const APIFY_BASE = 'https://api.apify.com/v2'

// Cantidad de publicaciones recientes a traer por scrape. Debe ser suficiente para
// cubrir un mes calendario completo (computeInstagramMetrics filtra por mes), así que
// se elige generoso. Configurable para cuentas muy activas vs. costo del proveedor.
const DEFAULT_POSTS_LIMIT = Number(process.env.APIFY_INSTAGRAM_POSTS_LIMIT) || 60

// Mapea el "type" de Apify al media_type interno usado por computeInstagramMetrics
const APIFY_TYPE_MAP = {
  Image:   'IMAGE',
  GraphImage: 'IMAGE',
  Video:   'VIDEO',
  GraphVideo: 'VIDEO',
  Sidecar: 'CAROUSEL_ALBUM',
  GraphSidecar: 'CAROUSEL_ALBUM',
}

function scrapeError(message, code, status = 400) {
  const err = new Error(message)
  err.code = code
  err.status = status
  return err
}

// Aviso de error de scraping al equipo BlissTracker (casilla platformAdminEmail).
// Throttle in-memory: a lo sumo un aviso por código cada 6h, para no saturar la
// casilla cuando el cron mensual itera muchas cuentas con el mismo problema
// (ej. la cuenta de Apify sin crédito falla en todas). Se resetea al reiniciar.
const SCRAPE_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000
const lastScrapeAlertAt = new Map() // code → timestamp ms

function alertScrapeFailure({ code, detail, username, workspaceId = null, context = null }) {
  const now  = Date.now()
  const last = lastScrapeAlertAt.get(code) || 0
  if (now - last < SCRAPE_ALERT_COOLDOWN_MS) return
  lastScrapeAlertAt.set(code, now)

  const subject = '⚠️ Error de scraping de RRSS (Apify) — BlissTracker'
  const bodyHtml = `
    <p style="color:#475569;margin:0 0 8px;">El scraping de redes sociales falló. Mientras no se resuelva, las métricas de Instagram y de competidores no se van a actualizar.</p>
    ${platformCard('Detalle del error', [
      ['Proveedor', 'Apify'],
      ['Tipo', code],
      ['Cuenta', username ? `@${username}` : '—'],
      ['Contexto', context],
      ['Mensaje', detail],
    ], '#dc2626')}
    <p style="color:#94a3b8;font-size:13px;margin:12px 0 0;">Revisá el saldo de la cuenta de Apify y el token <code>APIFY_API_TOKEN</code>. Para no saturar, este aviso se manda como máximo una vez cada 6 horas por tipo de error.</p>
  `
  // Fire-and-forget: sendPlatformNotification ya es no-op si la casilla está vacía
  // o el toggle está apagado, y nunca lanza.
  sendPlatformNotification('scrapeError', { subject, bodyHtml, workspaceId })
    .catch(err => console.error('[Scrape] No se pudo enviar el aviso de error:', err.message))
}

/**
 * Extrae el username de Instagram de una URL o handle.
 * Acepta: "miusuario", "@miusuario", "https://instagram.com/miusuario/", etc.
 */
function parseInstagramUsername(input) {
  if (!input) return null
  let s = String(input).trim()
  if (!s) return null
  // URL completa
  const urlMatch = s.match(/instagram\.com\/([^/?#]+)/i)
  if (urlMatch) s = urlMatch[1]
  // quitar @ y query/hash residual
  s = s.replace(/^@/, '').replace(/[/?#].*$/, '').trim()
  // username válido de IG: letras, números, punto y guion bajo
  if (!/^[A-Za-z0-9._]{1,30}$/.test(s)) return null
  return s.toLowerCase()
}

/**
 * Corre el actor de Instagram en Apify (sincrónico) y devuelve el primer item.
 * @param {string} username
 * @param {object} opts — { postsLimit, workspaceId, context } (workspaceId/context solo enriquecen el aviso de error)
 */
async function runApifyInstagram(username, opts = {}) {
  const { postsLimit = DEFAULT_POSTS_LIMIT, workspaceId = null, context = null } = opts
  const token = process.env.APIFY_API_TOKEN
  if (!token) {
    alertScrapeFailure({ code: 'SCRAPE_NOT_CONFIGURED', detail: 'Falta APIFY_API_TOKEN en el servidor.', username, workspaceId, context })
    throw scrapeError(
      'El scraping no está configurado en el servidor (falta APIFY_API_TOKEN).',
      'SCRAPE_NOT_CONFIGURED',
      503,
    )
  }

  // Actor: PlatformSetting (editable desde SuperAdmin → Configuración) → env →
  // default. El default oficial cubre el caso estándar sin configurar nada.
  let actor = ''
  try { actor = (await getSetting('apifyInstagramActor')) || '' } catch { /* DB no disponible → env */ }
  actor = actor.trim() || process.env.APIFY_INSTAGRAM_ACTOR || 'apify~instagram-profile-scraper'
  // En la API de Apify el ID del actor va con "~" (no "/"). Aceptamos "usuario/actor".
  const actorId = actor.replace('/', '~')
  const url     = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items`

  let items
  try {
    const { data } = await axios.post(
      url,
      { usernames: [username], resultsLimit: postsLimit },
      { params: { token }, timeout: 180000 },
    )
    items = Array.isArray(data) ? data : []
  } catch (err) {
    const apifyMsg = err.response?.data?.error?.message || err.message
    alertScrapeFailure({ code: 'SCRAPE_PROVIDER_ERROR', detail: apifyMsg, username, workspaceId, context })
    throw scrapeError(`El proveedor de scraping falló: ${apifyMsg}`, 'SCRAPE_PROVIDER_ERROR', 502)
  }

  const item = items.find(i => i && (i.username || i.followersCount != null))
  if (!item) {
    throw scrapeError(`No se encontró el perfil @${username} (¿privado, inexistente o mal escrito?).`, 'PROFILE_NOT_FOUND', 404)
  }
  return item
}

/**
 * Resuelve el actor de posts de Instagram (2ª llamada). PlatformSetting →
 * env → default oficial. Devuelve '' si está explícitamente desactivado
 * ("none"/"off") o si no hay ni setting ni env (comportamiento anterior).
 */
async function resolveInstagramPostsActor() {
  let setting = ''
  try { setting = (await getSetting('apifyInstagramPostsActor')) || '' } catch { /* DB no disponible → env */ }
  const raw = (setting.trim() || process.env.APIFY_INSTAGRAM_POSTS_ACTOR || '').trim()
  if (!raw) return ''                                   // sin configurar → no hay 2ª llamada
  if (['none', 'off', 'disabled'].includes(raw.toLowerCase())) return ''  // desactivado explícito
  return raw.replace('/', '~')
}

/**
 * Corre el actor de posts de Instagram (2ª llamada) y devuelve el array crudo de
 * publicaciones (mismo shape por-post que `latestPosts`). Best-effort: si el actor
 * no está configurado devuelve null; si falla, lanza un error estructurado que el
 * caller atrapa para caer al `latestPosts` del perfil (fallback no destructivo).
 * @returns {Array|null}
 */
async function runApifyInstagramPosts(username, opts = {}) {
  const { postsLimit = DEFAULT_POSTS_LIMIT, workspaceId = null, context = null } = opts
  const token = process.env.APIFY_API_TOKEN
  if (!token) return null

  const actorId = await resolveInstagramPostsActor()
  if (!actorId) return null                              // 2ª llamada desactivada

  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items`
  try {
    const { data } = await axios.post(
      url,
      { username: [username], resultsLimit: postsLimit },
      { params: { token }, timeout: 180000 },
    )
    const items = Array.isArray(data) ? data : []
    // El actor de posts devuelve un item por publicación. Descartamos items que no
    // sean posts (por si algún actor mezcla un item de perfil).
    return items.filter(i => i && (i.shortCode || i.id) && (i.timestamp || i.type))
  } catch (err) {
    const apifyMsg = err.response?.data?.error?.message || err.message
    alertScrapeFailure({ code: 'SCRAPE_PROVIDER_ERROR', detail: `Actor de posts IG: ${apifyMsg}`, username, workspaceId, context })
    throw scrapeError(`El actor de posts de Instagram falló: ${apifyMsg}`, 'SCRAPE_PROVIDER_ERROR', 502)
  }
}

// Mejor imagen de portada disponible para un post de Apify.
// Para videos/reels el cover puede venir en displayUrl, images[] o thumbnail*.
function bestPostImage(p) {
  if (p.displayUrl) return p.displayUrl
  if (Array.isArray(p.images) && p.images.length) {
    const first = p.images[0]
    if (first) return typeof first === 'string' ? first : (first.url ?? first.src ?? null)
  }
  return p.thumbnailSrc ?? p.thumbnailUrl ?? p.thumbnail ?? p.imageUrl ?? null
}

/**
 * Normaliza un post crudo de Apify (ya sea de `latestPosts` del actor de perfil o
 * de un item del actor de posts — comparten el mismo shape por publicación) al
 * media interno usado por computeInstagramMetrics.
 */
function normalizeApifyPost(p) {
  const cover = bestPostImage(p)
  return {
    id:            p.shortCode ?? p.id ?? null,
    like_count:    p.likesCount    ?? null,
    comments_count: p.commentsCount ?? null,
    timestamp:     p.timestamp     ?? null,
    media_type:    APIFY_TYPE_MAP[p.type] ?? 'IMAGE',
    media_url:     cover,
    thumbnail_url: cover,
    permalink:     p.url           ?? (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : null),
    caption:       p.caption       ?? null,
  }
}

/**
 * Fusiona dos listas de media (perfil + actor de posts) deduplicando por id.
 * Prioriza la publicación de `primary` cuando el id se repite (más completa).
 */
function mergeMediaById(primary = [], secondary = []) {
  const byId = new Map()
  for (const m of secondary) if (m.id) byId.set(m.id, m)
  for (const m of primary)   if (m.id) byId.set(m.id, m)
  // Posts sin id (raro) se conservan tal cual.
  const noId = [...primary, ...secondary].filter(m => !m.id)
  return [...byId.values(), ...noId]
}

/**
 * Normaliza un item de perfil de Apify al shape interno { profile, media }.
 */
function normalizeApifyProfile(item) {
  const profile = {
    followers_count:     item.followersCount ?? 0,
    media_count:         item.postsCount ?? (Array.isArray(item.latestPosts) ? item.latestPosts.length : 0),
    name:                item.fullName ?? null,
    username:            item.username ?? null,
    profile_picture_url: item.profilePicUrlHD ?? item.profilePicUrl ?? null,
    biography:           item.biography ?? null,
    website:             item.externalUrl ?? null,
  }

  const media = (Array.isArray(item.latestPosts) ? item.latestPosts : []).map(normalizeApifyPost)

  return { profile, media, isPrivate: !!item.private }
}

/**
 * Scrapea un perfil público de Instagram y devuelve métricas en el shape de
 * fetchInstagramMetrics, más { isPrivate, scraped: true }.
 * @param {string} usernameOrUrl
 * @param {object} opts — { postsLimit, targetMonth, workspaceId, context }
 */
async function scrapeInstagramProfile(usernameOrUrl, opts = {}) {
  const username = parseInstagramUsername(usernameOrUrl)
  if (!username) throw scrapeError('Usuario o URL de Instagram inválido.', 'INVALID_USERNAME', 400)

  // Tope de posts: PlatformSetting (>0) → env/default. Editable desde SuperAdmin.
  let cfgLimit = 0
  try { cfgLimit = Number(await getSetting('apifyInstagramPostsLimit')) || 0 } catch { /* DB no disponible */ }
  const postsLimit = opts.postsLimit ?? (cfgLimit > 0 ? cfgLimit : DEFAULT_POSTS_LIMIT)
  const item = await runApifyInstagram(username, {
    postsLimit,
    workspaceId: opts.workspaceId ?? null,
    context: opts.context ?? null,
  })
  const { profile, media: profileMedia, isPrivate } = normalizeApifyProfile(item)

  // 2ª llamada (si hay actor de posts configurado): el `latestPosts` del actor de
  // perfil viene capado y desordenado, así que perdemos publicaciones del mes en
  // cuentas activas. El actor de posts trae la lista completa y ordenada; la
  // fusionamos con la del perfil (dedup por id). Best-effort: si falla, seguimos
  // con la del perfil (no rompe seguidores ni el resto).
  // `skipPostsActor` fuerza el scrape "simple" (solo actor de perfil, sin 2ª
  // llamada) — lo usan los competidores (para no duplicar costo) y el scrape
  // suplementario de collabs en las cuentas conectadas por token.
  let media = profileMedia
  let postsActorUsed = false
  if (!opts.skipPostsActor) {
    try {
      const rawPosts = await runApifyInstagramPosts(username, {
        postsLimit,
        workspaceId: opts.workspaceId ?? null,
        context: opts.context ?? null,
      })
      if (Array.isArray(rawPosts) && rawPosts.length > 0) {
        const postsMedia = rawPosts.map(normalizeApifyPost)
        media = mergeMediaById(postsMedia, profileMedia)
        postsActorUsed = true
      }
    } catch (err) {
      console.warn(`[Scrape] @${username}: 2ª llamada (posts) falló, uso latestPosts del perfil:`, err.message)
    }
  }

  const metrics = computeInstagramMetrics(profile, media, opts.targetMonth ?? null)

  // Cobertura del mes: si todas las publicaciones traídas caen dentro del mes objetivo
  // y se alcanzó el tope de scrape, puede haber más posts del mes sin contabilizar.
  let monthCoverageComplete = true
  if (opts.targetMonth && media.length > 0) {
    const monthOf = (ts) => {
      const d = new Date(new Date(ts).toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    const reachedBeforeMonth = media.some(m => m.timestamp && monthOf(m.timestamp) < opts.targetMonth)
    const hitCap = media.length >= postsLimit
    monthCoverageComplete = reachedBeforeMonth || !hitCap
    if (!monthCoverageComplete) {
      console.warn(`[Scrape] @${username}: posible mes incompleto (${media.length} posts traídos, tope ${postsLimit}). Subí APIFY_INSTAGRAM_POSTS_LIMIT si la cuenta postea mucho.`)
    }
  }

  return { ...metrics, isPrivate, scraped: true, monthCoverageComplete, postsActorUsed }
}

/**
 * Scrape "simple" de un perfil público de Instagram que devuelve el array de media
 * CRUDO normalizado (sin computar métricas), para fusionarlo con otra fuente. Lo usa
 * el merge de collabs en las cuentas conectadas por API oficial/token (el grid
 * público incluye las publicaciones en colaboración, que la Graph API no expone en
 * `/me/media`). Best-effort: nunca corre el actor de posts (scrape simple).
 * @returns {{ media: Array, isPrivate: boolean, username: string }}
 */
async function scrapeInstagramMediaRaw(usernameOrUrl, opts = {}) {
  const username = parseInstagramUsername(usernameOrUrl)
  if (!username) throw scrapeError('Usuario o URL de Instagram inválido.', 'INVALID_USERNAME', 400)

  let cfgLimit = 0
  try { cfgLimit = Number(await getSetting('apifyInstagramPostsLimit')) || 0 } catch { /* DB no disponible */ }
  const postsLimit = opts.postsLimit ?? (cfgLimit > 0 ? cfgLimit : DEFAULT_POSTS_LIMIT)

  const item = await runApifyInstagram(username, {
    postsLimit,
    workspaceId: opts.workspaceId ?? null,
    context: opts.context ?? 'Instagram — scrape de collabs',
  })
  const { media, isPrivate } = normalizeApifyProfile(item)
  return { media, isPrivate, username }
}

// ─── LinkedIn (Company Pages, scraping público) ────────────────────────────────
// El scraping sólo accede a datos PÚBLICOS de la Company Page: seguidores, posts
// recientes (texto, reacciones, comentarios, compartidos), nombre y logo. NO
// expone impresiones, clicks, CTR, page views ni demographics (eso es solo API
// oficial). computeLinkedinScrapeMetrics deja esos campos en null.

const DEFAULT_LINKEDIN_POSTS_LIMIT = Number(process.env.APIFY_LINKEDIN_POSTS_LIMIT) || 30

// Devuelve el primer valor no nulo/no vacío entre varios nombres de campo posibles
// (los actores de LinkedIn de Apify no comparten un esquema único).
function pick(obj, keys) {
  if (!obj) return null
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k]
  }
  return null
}

// Convierte un conteo a número, tolerando strings como "1,234", "12K" o "1.2M".
function toCount(v) {
  if (v == null) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v).trim().replace(/,/g, '')
  const m = s.match(/^([\d.]+)\s*([KkMm])?/)
  if (!m) return 0
  let n = parseFloat(m[1])
  if (!Number.isFinite(n)) return 0
  const suffix = m[2]?.toLowerCase()
  if (suffix === 'k') n *= 1e3
  if (suffix === 'm') n *= 1e6
  return Math.round(n)
}

/**
 * Extrae el identificador (slug) de una Company Page de LinkedIn de una URL o nombre.
 * Acepta: "miempresa", "https://www.linkedin.com/company/miempresa/", "/company/miempresa/".
 */
function parseLinkedinCompany(input) {
  if (!input) return null
  let s = String(input).trim()
  if (!s) return null
  const urlMatch = s.match(/linkedin\.com\/(?:company|showcase|school)\/([^/?#]+)/i)
  if (urlMatch) s = urlMatch[1]
  s = s.replace(/^@/, '').replace(/[/?#].*$/, '').trim()
  // Slug de company: letras, números, guiones, puntos (más permisivo que IG)
  if (!/^[A-Za-z0-9\-._%]{1,120}$/.test(s)) return null
  return s.toLowerCase()
}

function normalizeLinkedinPost(p) {
  return {
    id:        pick(p, ['urn', 'activityUrn', 'shareUrn', 'postUrn', 'id']) ?? pick(p, ['url', 'postUrl', 'link']),
    urn:       pick(p, ['urn', 'activityUrn', 'shareUrn', 'postUrn']),
    text:      pick(p, ['text', 'commentary', 'content', 'caption', 'postText', 'description']) ?? '',
    likes:     toCount(pick(p, ['likes', 'numLikes', 'likesCount', 'reactionsCount', 'reactions', 'totalReactionCount', 'numReactions', 'likeCount'])),
    comments:  toCount(pick(p, ['comments', 'numComments', 'commentsCount', 'commentCount'])),
    shares:    toCount(pick(p, ['shares', 'numShares', 'sharesCount', 'reposts', 'repostsCount', 'shareCount'])),
    timestamp: pick(p, ['timestamp', 'postedAtTimestamp', 'postedAt', 'publishedAt', 'date', 'postedAtISO', 'time', 'createdAt']),
    url:       pick(p, ['url', 'postUrl', 'link', 'postLink']),
    imgSrc:    pick(p, ['image', 'imageUrl', 'thumbnail', 'imgSrc', 'mediaUrl']),
  }
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
  const { postsLimit = DEFAULT_LINKEDIN_POSTS_LIMIT, workspaceId = null, context = null } = opts
  const token = process.env.APIFY_API_TOKEN
  if (!token) {
    alertScrapeFailure({ code: 'SCRAPE_NOT_CONFIGURED', detail: 'Falta APIFY_API_TOKEN en el servidor.', username: identifier, workspaceId, context })
    throw scrapeError('El scraping no está configurado en el servidor (falta APIFY_API_TOKEN).', 'SCRAPE_NOT_CONFIGURED', 503)
  }
  // Actor: prioriza el PlatformSetting (editable desde SuperAdmin → Configuración,
  // para probar/cambiar de actor sin redeploy); si está vacío, cae a la env var.
  let actor = ''
  try { actor = (await getSetting('apifyLinkedinActor')) || '' } catch { /* DB no disponible → env */ }
  actor = actor.trim() || process.env.APIFY_LINKEDIN_ACTOR
  if (!actor) {
    alertScrapeFailure({ code: 'SCRAPE_NOT_CONFIGURED', detail: 'Falta configurar el actor de LinkedIn (setting apifyLinkedinActor o env APIFY_LINKEDIN_ACTOR).', username: identifier, workspaceId, context })
    throw scrapeError('El scraping de LinkedIn no está configurado: falta elegir el actor de Apify (SuperAdmin → Configuración → "Actor de Apify para LinkedIn", o la variable de entorno APIFY_LINKEDIN_ACTOR).', 'SCRAPE_NOT_CONFIGURED', 503)
  }
  // En la API de Apify el ID del actor va con "~" (no "/"). Aceptamos la forma
  // "usuario/actor" que muestra la UI de Apify y la normalizamos.
  const actorId = actor.replace('/', '~')

  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items`
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

  let items
  try {
    const { data } = await axios.post(url, input, { params: { token }, timeout: 180000 })
    items = Array.isArray(data) ? data : []
  } catch (err) {
    const apifyMsg = err.response?.data?.error?.message || err.message
    alertScrapeFailure({ code: 'SCRAPE_PROVIDER_ERROR', detail: apifyMsg, username: identifier, workspaceId, context })
    throw scrapeError(`El proveedor de scraping falló: ${apifyMsg}`, 'SCRAPE_PROVIDER_ERROR', 502)
  }

  console.log(`[Scrape] LinkedIn ${identifier} · actor=${actorId} · items=${items.length}${items[0] && typeof items[0] === 'object' ? ` · keys[0]=${Object.keys(items[0]).slice(0, 20).join(',')}` : ''}`)

  // Algunos actores no devuelven HTTP error: meten un item `{ error: "..." }` en
  // el dataset (ej. "You have used up your credits"). Lo detectamos y lo
  // surfaceamos como error real en vez de contarlo como 0 datos.
  const errItem  = items.find(i => i && typeof i === 'object' && typeof i.error === 'string')
  const hasUsable = items.some(i => i && typeof i === 'object' && !i.error)
  if (errItem && !hasUsable) {
    alertScrapeFailure({ code: 'SCRAPE_PROVIDER_ERROR', detail: errItem.error, username: identifier, workspaceId, context })
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

  const items = await runApifyLinkedin(identifier, { postsLimit, workspaceId: opts.workspaceId ?? null, context: 'LinkedIn — diagnóstico' })
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
 * @param {object} opts — { postsLimit, targetMonth, workspaceId, context }
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
    context: opts.context ?? null,
  })
  const { profile, posts } = normalizeApifyCompany(items, identifier)
  const metrics = computeLinkedinScrapeMetrics(profile, posts, opts.targetMonth ?? null)

  // Cobertura del mes: si todos los posts traídos caen dentro del mes objetivo y se
  // alcanzó el tope de scrape, puede haber más posts del mes sin contabilizar.
  let monthCoverageComplete = true
  if (opts.targetMonth && posts.length > 0) {
    const monthOf = (ts) => {
      const d = new Date(new Date(ts).toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
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

// ─── Facebook (Páginas, scraping público) ──────────────────────────────────────
// El scraping sólo accede a datos PÚBLICOS de la Página: seguidores / "me gusta",
// posts recientes (texto, reacciones, comentarios, compartidos), nombre y foto. NO
// expone reach, impresiones ni page views (eso es solo API oficial con read_insights).
// computeFacebookScrapeMetrics deja esos campos en null.

const DEFAULT_FACEBOOK_POSTS_LIMIT = Number(process.env.APIFY_FACEBOOK_POSTS_LIMIT) || 30

/**
 * Extrae el identificador (slug o id numérico) de una Página de Facebook de una
 * URL o nombre. Acepta: "miempresa", "https://www.facebook.com/miempresa/",
 * "/miempresa/", "facebook.com/profile.php?id=123456".
 */
function parseFacebookPage(input) {
  if (!input) return null
  let s = String(input).trim()
  if (!s) return null
  // facebook.com/profile.php?id=NNN → devolvemos el id numérico
  const idMatch = s.match(/facebook\.com\/profile\.php\?id=(\d+)/i)
  if (idMatch) return idMatch[1]
  const urlMatch = s.match(/(?:facebook|fb)\.com\/(?:pg\/)?([^/?#]+)/i)
  if (urlMatch) s = urlMatch[1]
  s = s.replace(/^@/, '').replace(/[/?#].*$/, '').trim()
  // Slug de página: letras, números, puntos, guiones (o id numérico)
  if (!/^[A-Za-z0-9\-._%]{1,120}$/.test(s)) return null
  // No tratar "profile.php" residual como slug
  if (s.toLowerCase() === 'profile.php') return null
  return s.toLowerCase()
}

function normalizeFacebookPost(p) {
  return {
    id:        pick(p, ['postId', 'id', 'url', 'postUrl', 'link', 'permalink']),
    text:      pick(p, ['text', 'message', 'content', 'caption', 'postText', 'description']) ?? '',
    likes:     toCount(pick(p, ['likes', 'likesCount', 'numLikes', 'reactionsCount', 'reactions', 'reactionsCount', 'totalReactionCount', 'likeCount'])),
    comments:  toCount(pick(p, ['comments', 'commentsCount', 'numComments', 'commentCount'])),
    shares:    toCount(pick(p, ['shares', 'sharesCount', 'numShares', 'shareCount', 'reshareCount'])),
    timestamp: pick(p, ['timestamp', 'time', 'date', 'publishedAt', 'postedAt', 'createdAt', 'postedAtISO', 'publishTime']),
    url:       pick(p, ['url', 'postUrl', 'link', 'permalink', 'postLink']),
    imgSrc:    pick(p, ['image', 'imageUrl', 'thumbnail', 'imgSrc', 'mediaUrl', 'photo', 'fullPicture']),
  }
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
  const { postsLimit = DEFAULT_FACEBOOK_POSTS_LIMIT, workspaceId = null, context = null } = opts
  const token = process.env.APIFY_API_TOKEN
  if (!token) {
    alertScrapeFailure({ code: 'SCRAPE_NOT_CONFIGURED', detail: 'Falta APIFY_API_TOKEN en el servidor.', username: identifier, workspaceId, context })
    throw scrapeError('El scraping no está configurado en el servidor (falta APIFY_API_TOKEN).', 'SCRAPE_NOT_CONFIGURED', 503)
  }
  let actor = ''
  try { actor = (await getSetting('apifyFacebookActor')) || '' } catch { /* DB no disponible → env */ }
  actor = actor.trim() || process.env.APIFY_FACEBOOK_ACTOR
  if (!actor) {
    alertScrapeFailure({ code: 'SCRAPE_NOT_CONFIGURED', detail: 'Falta configurar el actor de Facebook (setting apifyFacebookActor o env APIFY_FACEBOOK_ACTOR).', username: identifier, workspaceId, context })
    throw scrapeError('El scraping de Facebook no está configurado: falta elegir el actor de Apify (SuperAdmin → Configuración → "Actor de Apify para Facebook", o la variable de entorno APIFY_FACEBOOK_ACTOR).', 'SCRAPE_NOT_CONFIGURED', 503)
  }
  const actorId = actor.replace('/', '~')

  const url     = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items`
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

  let items
  try {
    const { data } = await axios.post(url, input, { params: { token }, timeout: 180000 })
    items = Array.isArray(data) ? data : []
  } catch (err) {
    const apifyMsg = err.response?.data?.error?.message || err.message
    alertScrapeFailure({ code: 'SCRAPE_PROVIDER_ERROR', detail: apifyMsg, username: identifier, workspaceId, context })
    throw scrapeError(`El proveedor de scraping falló: ${apifyMsg}`, 'SCRAPE_PROVIDER_ERROR', 502)
  }

  console.log(`[Scrape] Facebook ${identifier} · actor=${actorId} · items=${items.length}${items[0] && typeof items[0] === 'object' ? ` · keys[0]=${Object.keys(items[0]).slice(0, 20).join(',')}` : ''}`)

  const errItem   = items.find(i => i && typeof i === 'object' && typeof i.error === 'string')
  const hasUsable = items.some(i => i && typeof i === 'object' && !i.error)
  if (errItem && !hasUsable) {
    alertScrapeFailure({ code: 'SCRAPE_PROVIDER_ERROR', detail: errItem.error, username: identifier, workspaceId, context })
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

  const items = await runApifyFacebook(identifier, { postsLimit, workspaceId: opts.workspaceId ?? null, context: 'Facebook — diagnóstico' })
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
 * @param {object} opts — { postsLimit, targetMonth, workspaceId, context }
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
    context: opts.context ?? null,
  })
  const { profile, posts } = normalizeApifyFacebook(items, identifier)
  const metrics = computeFacebookScrapeMetrics(profile, posts, opts.targetMonth ?? null)

  let monthCoverageComplete = true
  if (opts.targetMonth && posts.length > 0) {
    const monthOf = (ts) => {
      const d = new Date(new Date(ts).toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
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

module.exports = {
  parseInstagramUsername,
  scrapeInstagramProfile,
  scrapeInstagramMediaRaw,
  mergeMediaById,
  parseLinkedinCompany,
  scrapeLinkedinCompany,
  debugScrapeLinkedin,
  parseFacebookPage,
  scrapeFacebookPage,
  debugScrapeFacebook,
}
