const axios = require('axios')
const { computeInstagramMetrics } = require('./instagram.service')

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
 * @param {number} postsLimit — cantidad de posts recientes a traer
 */
async function runApifyInstagram(username, postsLimit = 12) {
  const token = process.env.APIFY_API_TOKEN
  if (!token) {
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
    throw scrapeError(`El proveedor de scraping falló: ${apifyMsg}`, 'SCRAPE_PROVIDER_ERROR', 502)
  }

  const item = items.find(i => i && (i.username || i.followersCount != null))
  if (!item) {
    throw scrapeError(`No se encontró el perfil @${username} (¿privado, inexistente o mal escrito?).`, 'PROFILE_NOT_FOUND', 404)
  }
  return item
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

  const media = (Array.isArray(item.latestPosts) ? item.latestPosts : []).map(p => ({
    id:            p.shortCode ?? p.id ?? null,
    like_count:    p.likesCount    ?? null,
    comments_count: p.commentsCount ?? null,
    timestamp:     p.timestamp     ?? null,
    media_type:    APIFY_TYPE_MAP[p.type] ?? 'IMAGE',
    media_url:     p.displayUrl    ?? null,
    thumbnail_url: p.displayUrl    ?? null,
    permalink:     p.url           ?? (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : null),
    caption:       p.caption       ?? null,
  }))

  return { profile, media, isPrivate: !!item.private }
}

/**
 * Scrapea un perfil público de Instagram y devuelve métricas en el shape de
 * fetchInstagramMetrics, más { isPrivate, scraped: true }.
 * @param {string} usernameOrUrl
 * @param {object} opts — { postsLimit, targetMonth }
 */
async function scrapeInstagramProfile(usernameOrUrl, opts = {}) {
  const username = parseInstagramUsername(usernameOrUrl)
  if (!username) throw scrapeError('Usuario o URL de Instagram inválido.', 'INVALID_USERNAME', 400)

  const item = await runApifyInstagram(username, opts.postsLimit ?? 12)
  const { profile, media, isPrivate } = normalizeApifyProfile(item)
  const metrics = computeInstagramMetrics(profile, media, opts.targetMonth ?? null)

  return { ...metrics, isPrivate, scraped: true }
}

module.exports = {
  parseInstagramUsername,
  scrapeInstagramProfile,
}
