const axios = require('axios')
const { computeInstagramMetrics } = require('./instagram.service')
const { sendPlatformNotification, platformCard } = require('./email.service')

/**
 * Motor de scraping de redes sociales — abstraído por proveedor.
 *
 * Proveedor actual: Apify (https://apify.com). Requiere APIFY_API_TOKEN.
 * El actor de Instagram se puede sobreescribir con APIFY_INSTAGRAM_ACTOR
 * (default: apify~instagram-profile-scraper).
 *
 * Todas las funciones devuelven datos en el MISMO shape que
 * instagram.service.fetchInstagramMetrics para reutilizar vistas, snapshots
 * e informes existentes.
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

  const actor = process.env.APIFY_INSTAGRAM_ACTOR || 'apify~instagram-profile-scraper'
  const url   = `${APIFY_BASE}/acts/${actor}/run-sync-get-dataset-items`

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

  const media = (Array.isArray(item.latestPosts) ? item.latestPosts : []).map(p => {
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
  })

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

  const postsLimit = opts.postsLimit ?? DEFAULT_POSTS_LIMIT
  const item = await runApifyInstagram(username, {
    postsLimit,
    workspaceId: opts.workspaceId ?? null,
    context: opts.context ?? null,
  })
  const { profile, media, isPrivate } = normalizeApifyProfile(item)
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

  return { ...metrics, isPrivate, scraped: true, monthCoverageComplete }
}

module.exports = {
  parseInstagramUsername,
  scrapeInstagramProfile,
}
