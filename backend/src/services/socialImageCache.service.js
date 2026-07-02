const axios = require('axios')
const prisma = require('../lib/prisma')
const objectStorage = require('./objectStorage.service')

// Las URLs de imágenes de los CDN de Instagram / Facebook / TikTok vienen firmadas
// y vencen (horas/días). Para que los top posts guardados en snapshots e informes
// no terminen con la imagen rota ("URL signature expired"), descargamos los bytes
// mientras la URL todavía es válida y los servimos desde nuestro backend.

const MAX_BYTES = 8 * 1024 * 1024 // 8 MB — imágenes de social, generosamente acotado
const RETRIES   = 3               // los CDN de IG/FB devuelven 403/timeout esporádicos
const RETRY_MS  = [600, 1800]     // backoff entre intentos

// Los CDN de Instagram/Facebook a veces rechazan UAs "de bot" con 403. Un UA de
// navegador real + Referer de instagram.com maximiza la tasa de descarga.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'Referer': 'https://www.instagram.com/',
}

function publicBase() {
  return (process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '')
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/** True si la URL ya apunta a nuestro cache (endpoint propio o bucket público). */
function isCachedUrl(url) {
  if (typeof url !== 'string') return false
  return url.includes('/api/social-image/') || objectStorage.isPublicUrl(url)
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

  let lastErr
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20000,
        maxContentLength: MAX_BYTES,
        headers: BROWSER_HEADERS,
      })

      const mimeType = String(resp.headers['content-type'] || '').split(';')[0].trim()
      if (!mimeType.startsWith('image/')) return url // no es imagen → no cachear

      const buffer = Buffer.from(resp.data)
      if (buffer.length === 0 || buffer.length > MAX_BYTES) return url

      // Con object storage configurado: subir a R2 y guardar solo la key (sin
      // bytes en DB). Sin configurar: legacy → bytes en DB.
      // En AMBOS casos la URL que devolvemos apunta a NUESTRO endpoint
      // (`/api/social-image/:id`), no al dominio del bucket: así las URLs
      // horneadas en snapshots/informes NO quedan atadas al dominio de R2. El
      // endpoint redirige a `R2_PUBLIC_BASE` (cambiable por env, sin regenerar
      // nada) cuando la fila tiene objectKey, o sirve los bytes legacy.
      const data = objectStorage.isConfigured()
        ? await (async () => {
            const { key, size } = await objectStorage.putObject(buffer, mimeType, { prefix: 'social' })
            return { workspaceId, sourceUrl: url, objectKey: key, sizeBytes: size, mimeType }
          })()
        : { workspaceId, sourceUrl: url, imageData: buffer, sizeBytes: buffer.length, mimeType }

      const row = await prisma.socialImage.create({ data, select: { id: true } })
      return `${publicBase()}/api/social-image/${row.id}`
    } catch (err) {
      lastErr = err
      // 404/403 firmados no se recuperan reintentando; sí los 5xx/timeout/red.
      const status = err.response?.status
      const retriable = !status || status >= 500 || err.code === 'ECONNABORTED' || err.code === 'ECONNRESET'
      if (retriable && attempt < RETRIES - 1) { await sleep(RETRY_MS[attempt]); continue }
      break
    }
  }
  console.warn(`[SocialImageCache] FALLO cacheo tras ${RETRIES} intentos (${lastErr?.response?.status || lastErr?.code || lastErr?.message}); se mantiene URL original que VENCERÁ: ${url.slice(0, 80)}`)
  return url
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
