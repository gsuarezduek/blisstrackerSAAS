const axios = require('axios')
const prisma = require('../lib/prisma')

// Las URLs de imágenes de los CDN de Instagram / Facebook / TikTok vienen firmadas
// y vencen (horas/días). Para que los top posts guardados en snapshots e informes
// no terminen con la imagen rota ("URL signature expired"), descargamos los bytes
// mientras la URL todavía es válida y los servimos desde nuestro backend.

const MAX_BYTES = 8 * 1024 * 1024 // 8 MB — imágenes de social, generosamente acotado

function publicBase() {
  return (process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '')
}

/** True si la URL ya apunta a nuestro propio cache (idempotencia). */
function isCachedUrl(url) {
  return typeof url === 'string' && url.includes('/api/social-image/')
}

/**
 * Descarga una imagen de un CDN y la persiste en SocialImage.
 * Devuelve una URL absoluta a nuestro backend, o la URL original si algo falla
 * (fallback no destructivo: al menos en vivo la imagen sigue funcionando).
 *
 * @param {string|null} url
 * @param {number} workspaceId
 * @returns {Promise<string|null>}
 */
async function cacheSocialImage(url, workspaceId) {
  if (!url || typeof url !== 'string') return url ?? null
  if (isCachedUrl(url)) return url // ya cacheada

  try {
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxContentLength: MAX_BYTES,
      // Algunos CDN devuelven 403 sin un UA "de navegador"
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlissTracker/1.0)' },
    })

    const mimeType = String(resp.headers['content-type'] || '').split(';')[0].trim()
    if (!mimeType.startsWith('image/')) return url // no es imagen → no cachear

    const buffer = Buffer.from(resp.data)
    if (buffer.length === 0 || buffer.length > MAX_BYTES) return url

    const row = await prisma.socialImage.create({
      data: { workspaceId, sourceUrl: url, imageData: buffer, mimeType },
      select: { id: true },
    })

    return `${publicBase()}/api/social-image/${row.id}`
  } catch (err) {
    console.warn(`[SocialImageCache] No se pudo cachear imagen (${err.message}); se mantiene URL original`)
    return url
  }
}

/**
 * Recorre un array de objetos y reemplaza el campo de imagen indicado por su
 * versión cacheada. No muta el array original; devuelve copias de los objetos.
 *
 * @param {Array<object>} items
 * @param {string} field        — nombre del campo con la URL (ej: 'imgSrc', 'coverUrl')
 * @param {number} workspaceId
 * @returns {Promise<Array<object>>}
 */
async function cacheImagesInArray(items, field, workspaceId) {
  if (!Array.isArray(items) || items.length === 0) return items
  const out = []
  for (const item of items) {
    if (item && item[field]) {
      out.push({ ...item, [field]: await cacheSocialImage(item[field], workspaceId) })
    } else {
      out.push(item)
    }
  }
  return out
}

module.exports = { cacheSocialImage, cacheImagesInArray, isCachedUrl }
