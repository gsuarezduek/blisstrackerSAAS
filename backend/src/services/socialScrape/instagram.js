const { computeInstagramMetrics } = require('../instagram.service')
const { getSetting } = require('../../lib/platformSettings')
const { DEFAULT_TZ } = require('../../utils/dates')
const { scrapeError, getApifyTokens, runApifyActor, alertScrapeFailure, parseSocialHandle } = require('./_shared')

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

/**
 * Extrae el username de Instagram de una URL o handle.
 * Acepta: "miusuario", "@miusuario", "https://instagram.com/miusuario/", etc.
 */
function parseInstagramUsername(input) {
  return parseSocialHandle(input, {
    urlRegex:     /instagram\.com\/([^/?#]+)/i,
    charsetRegex: /^[A-Za-z0-9._]{1,30}$/, // username válido de IG: letras, números, punto y guion bajo
  })
}

/**
 * Corre el actor de Instagram en Apify (sincrónico) y devuelve el primer item.
 * @param {string} username
 * @param {object} opts — { postsLimit, workspaceId, projectId, action, actionLabel } (workspaceId/projectId/actionLabel solo enriquecen el aviso de error; workspaceId/projectId/action además atribuyen el consumo en ApifyUsageLog)
 */
async function runApifyInstagram(username, opts = {}) {
  const { postsLimit = DEFAULT_POSTS_LIMIT, workspaceId = null, projectId = null, action = null, actionLabel = null } = opts
  const tokens = await getApifyTokens()
  if (tokens.length === 0) {
    alertScrapeFailure({ code: 'SCRAPE_NOT_CONFIGURED', detail: 'Falta APIFY_API_TOKEN en el servidor.', username, workspaceId, actionLabel })
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

  const attribution = { workspaceId, projectId, platform: 'instagram', action }
  let items
  try {
    items = await runApifyActor(actorId, { usernames: [username], resultsLimit: postsLimit }, { tokens, attribution })
  } catch (err) {
    const apifyMsg = err.response?.data?.error?.message || err.message
    alertScrapeFailure({ code: 'SCRAPE_PROVIDER_ERROR', detail: apifyMsg, username, workspaceId, actionLabel })
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
  const { postsLimit = DEFAULT_POSTS_LIMIT, workspaceId = null, projectId = null, action = null, actionLabel = null } = opts
  const tokens = await getApifyTokens()
  if (tokens.length === 0) return null

  const actorId = await resolveInstagramPostsActor()
  if (!actorId) return null                              // 2ª llamada desactivada

  const attribution = { workspaceId, projectId, platform: 'instagram', action }
  try {
    const items = await runApifyActor(actorId, { username: [username], resultsLimit: postsLimit }, { tokens, attribution })
    // El actor de posts devuelve un item por publicación. Descartamos items que no
    // sean posts (por si algún actor mezcla un item de perfil).
    return items.filter(i => i && (i.shortCode || i.id) && (i.timestamp || i.type))
  } catch (err) {
    const apifyMsg = err.response?.data?.error?.message || err.message
    alertScrapeFailure({ code: 'SCRAPE_PROVIDER_ERROR', detail: `Actor de posts IG: ${apifyMsg}`, username, workspaceId, actionLabel })
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
    ownerUsername: p.ownerUsername ?? null,   // autor real del post (≠ cuenta → collab/etiquetado)
    productType:   p.productType ?? p.product_type ?? null,
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
 * @param {object} opts — { postsLimit, targetMonth, workspaceId, projectId, action, actionLabel }
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
    projectId:   opts.projectId ?? null,
    action:      opts.action ?? null,
    actionLabel: opts.actionLabel ?? null,
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
        projectId:   opts.projectId ?? null,
        action:      opts.action ?? null,
        actionLabel: opts.actionLabel ?? null,
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
      const d = new Date(new Date(ts).toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
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
 * Diagnóstico: corre las 2 llamadas de Instagram (actor de perfil + actor de posts)
 * por separado y muestra, por fuente, cuántos posts trae cada una y cuántos caen en
 * el mes objetivo, más el resultado de la fusión — para confirmar que la fusión
 * captura todas las publicaciones del mes. Mismo patrón que debugScrapeLinkedin/Facebook.
 */
async function debugScrapeInstagram(usernameOrUrl, opts = {}) {
  const username = parseInstagramUsername(usernameOrUrl)
  if (!username) throw scrapeError('Usuario o URL de Instagram inválido.', 'INVALID_USERNAME', 400)

  let cfgLimit = 0
  try { cfgLimit = Number(await getSetting('apifyInstagramPostsLimit')) || 0 } catch { /* DB no disponible */ }
  const postsLimit = opts.postsLimit ?? (cfgLimit > 0 ? cfgLimit : DEFAULT_POSTS_LIMIT)
  const targetMonth = opts.targetMonth ?? null

  const monthOf = (ts) => {
    if (!ts) return null
    const d = new Date(new Date(ts).toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
    return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const describe = (media) => ({
    count: media.length,
    inTarget: targetMonth ? media.filter(m => monthOf(m.timestamp) === targetMonth).length : null,
    posts: media.map(m => ({ id: m.id, type: m.media_type, timestamp: m.timestamp, month: monthOf(m.timestamp), inTarget: targetMonth ? monthOf(m.timestamp) === targetMonth : null })),
  })

  const item = await runApifyInstagram(username, { postsLimit, workspaceId: opts.workspaceId ?? null, projectId: opts.projectId ?? null, action: 'diagnostic', actionLabel: 'Instagram — diagnóstico' })
  const { profile, media: profileMedia, isPrivate } = normalizeApifyProfile(item)

  let postsMedia = []
  let postsActorError = null
  try {
    const rawPosts = await runApifyInstagramPosts(username, { postsLimit, workspaceId: opts.workspaceId ?? null, projectId: opts.projectId ?? null, action: 'diagnostic', actionLabel: 'Instagram — diagnóstico' })
    postsMedia = Array.isArray(rawPosts) ? rawPosts.map(normalizeApifyPost) : []
  } catch (err) {
    postsActorError = err.message
  }

  const merged = mergeMediaById(postsMedia, profileMedia)

  return {
    username,
    isPrivate,
    followersCount: profile.followers_count,
    postsActorConfigured: (await resolveInstagramPostsActor()) !== '',
    postsActorError,
    perfil:  describe(profileMedia),
    posts:   describe(postsMedia),
    fusion:  describe(merged),
  }
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
    projectId:   opts.projectId ?? null,
    action:      opts.action ?? 'collab_merge',
    actionLabel: opts.actionLabel ?? 'Instagram — scrape de collabs',
  })
  const { media, isPrivate } = normalizeApifyProfile(item)
  return { media, isPrivate, username }
}

module.exports = {
  parseInstagramUsername,
  scrapeInstagramProfile,
  scrapeInstagramMediaRaw,
  debugScrapeInstagram,
  mergeMediaById,
}
