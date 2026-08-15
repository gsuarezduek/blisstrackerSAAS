/**
 * Abstracción de object storage (Cloudflare R2, S3-compatible).
 *
 * Único punto del código que conoce el SDK de S3. Si se cambia de proveedor en
 * el futuro, se toca solo este archivo. Sigue el patrón del repo (Stripe/Apify):
 * si las env vars no están configuradas, `isConfigured()` devuelve false y los
 * llamadores caen a su comportamiento legacy (guardar el blob en la DB).
 *
 * Env vars (todas requeridas para activar R2):
 *   R2_ACCOUNT_ID         — account id de Cloudflare (subdominio del endpoint)
 *   R2_ACCESS_KEY_ID      — credencial S3 del bucket (R2 API Token)
 *   R2_SECRET_ACCESS_KEY  — secret de la credencial S3
 *   R2_BUCKET             — nombre del bucket
 *   R2_PUBLIC_BASE        — URL pública base del bucket SIN slash final
 *                           (dominio propio recomendado, ej. https://cdn.blisstracker.app,
 *                            o el dominio r2.dev del bucket)
 */
const { randomUUID } = require('crypto')
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_BASE,
} = process.env

let _client = null

function isConfigured() {
  return Boolean(
    R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_BASE
  )
}

function getClient() {
  if (_client) return _client
  if (!isConfigured()) throw new Error('Object storage (R2) no configurado')
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })
  return _client
}

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
  'video/mp4':       'mp4',
  'video/quicktime': 'mov',
  'video/webm':      'webm',
}

/** URL pública absoluta de un objeto a partir de su key. */
function publicUrl(key) {
  return `${R2_PUBLIC_BASE.replace(/\/$/, '')}/${key}`
}

/** True si la URL ya apunta a nuestro bucket público (idempotencia). */
function isPublicUrl(url) {
  return Boolean(R2_PUBLIC_BASE) && typeof url === 'string' && url.startsWith(R2_PUBLIC_BASE.replace(/\/$/, ''))
}

/**
 * Sube un buffer al bucket bajo `<prefix>/<uuid>.<ext>` y devuelve key + url + tamaño.
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {object} opts
 * @param {string} opts.prefix — carpeta lógica dentro del bucket (default 'social')
 * @returns {Promise<{ key: string, url: string, size: number }>}
 */
async function putObject(buffer, mimeType, { prefix = 'social' } = {}) {
  const ext = EXT_BY_MIME[mimeType] || 'bin'
  const key = `${prefix}/${randomUUID()}.${ext}`
  await getClient().send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    // Cache largo: las imágenes son inmutables (key única por subida).
    CacheControl: 'public, max-age=31536000, immutable',
  }))
  return { key, url: publicUrl(key), size: buffer.length }
}

/**
 * Borra objetos del bucket en lotes (la API de S3 acepta hasta 1000 por request).
 * No lanza: devuelve cuántos se borraron y loguea los fallos.
 * @param {string[]} keys
 * @returns {Promise<{ deleted: number }>}
 */
async function deleteObjects(keys) {
  const valid = (keys || []).filter(Boolean)
  if (valid.length === 0 || !isConfigured()) return { deleted: 0 }
  const client = getClient()
  let deleted = 0
  const BATCH = 1000
  for (let i = 0; i < valid.length; i += BATCH) {
    const slice = valid.slice(i, i + BATCH)
    try {
      const res = await client.send(new DeleteObjectsCommand({
        Bucket: R2_BUCKET,
        Delete: { Objects: slice.map(Key => ({ Key })), Quiet: true },
      }))
      deleted += slice.length - (res.Errors?.length || 0)
      if (res.Errors?.length) {
        console.warn(`[objectStorage] ${res.Errors.length} objeto(s) no se pudieron borrar:`, res.Errors.map(e => e.Key))
      }
    } catch (err) {
      console.warn('[objectStorage] Error borrando lote de objetos:', err.message)
    }
  }
  return { deleted }
}

/** Borra un solo objeto. No lanza — mismo criterio best-effort que deleteObjects. */
async function deleteObject(key) {
  if (!key || !isConfigured()) return
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
  } catch (err) {
    console.warn('[objectStorage] Error borrando objeto:', key, err.message)
  }
}

/** Key nueva bajo un prefijo. El cliente NUNCA elige la key — evita path traversal / colisiones. */
function buildKey(prefix, mimeType) {
  const ext = EXT_BY_MIME[mimeType] || 'bin'
  return `${prefix}/${randomUUID()}.${ext}`
}

/**
 * URL firmada para que el navegador haga PUT directo al bucket (subida de
 * imagen/video sin pasar por nuestro backend). Firma solo Content-Type, no
 * Content-Length: firmar el length obliga a que el header que manda el browser
 * calce exacto con lo firmado, lo cual es frágil entre proveedores S3-compatibles.
 * El tope de tamaño se valida DESPUÉS con headObject(), sobre el objeto ya
 * subido — R2 no cobra ingress, así que el peor caso es ancho de banda
 * desperdiciado una vez, acotado por el expiry.
 */
async function presignPut(key, mimeType, { expiresIn = 600 } = {}) {
  const cmd = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: mimeType })
  return getSignedUrl(getClient(), cmd, { expiresIn })
}

/**
 * Metadata real del objeto ya subido (tamaño y content-type que R2 registró).
 * Devuelve null si el objeto no existe (upload nunca confirmado/abandonado).
 */
async function headObject(key) {
  try {
    const res = await getClient().send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    return { size: res.ContentLength, contentType: res.ContentType }
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return null
    throw err
  }
}

/**
 * Primeros `bytes` del objeto, vía ranged GET — para validar magic bytes sin
 * bajar el archivo completo (puede pesar hasta 150MB).
 */
async function getObjectHead(key, bytes = 32) {
  const res = await getClient().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key, Range: `bytes=0-${bytes - 1}` }))
  const chunks = []
  for await (const chunk of res.Body) chunks.push(chunk)
  return Buffer.concat(chunks)
}

module.exports = {
  isConfigured, putObject, deleteObjects, deleteObject, publicUrl, isPublicUrl,
  buildKey, presignPut, headObject, getObjectHead,
}
