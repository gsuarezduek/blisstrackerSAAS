// ─── SUBIDA DEL LADO DEL SERVIDOR ("direct upload") ─────────────────────────
// El flujo normal de Archivos es presign → PUT directo a R2 desde el browser →
// confirm. Un agente conectado por MCP no puede hacer ese PUT: un tool-call
// solo manda JSON, no bytes. Esta vía recibe el contenido en el propio request
// (`content` texto / `contentBase64` binario chico / `url` pública) y sube
// desde el servidor, con las mismas validaciones de tipo que el flujo normal.
//
// Extraído de tasks/attachments.controller.js (POST /tasks/:id/attachments/direct)
// para reutilizarlo tal cual en projects/projectFiles.controller.js
// (POST /projects/:id/files/direct) — lo que cambia entre los dos es la carpeta
// destino y los vínculos que se crean después, no cómo se resuelven los bytes.
const axios = require('axios')
const { assertPublicUrl } = require('./safeUrl')
const { detectImageType } = require('./imageType')
const { detectVideoType } = require('./mediaType')
const { detectDocumentType } = require('./documentType')
const { isDangerousMime } = require('./dangerousMime')

// El body JSON está topeado a 1MB (app.js), así que content/contentBase64 sirven
// para archivos chicos; los pesados (imágenes, videos) entran por url.
const DIRECT_MAX_BYTES = 25 * 1024 * 1024
const URL_MAX_REDIRECTS = 3
const MIME_BY_EXT = {
  md: 'text/markdown', markdown: 'text/markdown', txt: 'text/plain', csv: 'text/csv',
  tsv: 'text/tab-separated-values', json: 'application/json',
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

const httpError = (status, error, code) => Object.assign(new Error(error), { status, code, isOperational: true })

// Baja una URL pública siguiendo redirects a mano: cada salto pasa por assertPublicUrl
// (un redirect automático podría apuntar a la red interna — SSRF).
async function downloadPublicUrl(rawUrl) {
  let url = rawUrl
  for (let hop = 0; hop <= URL_MAX_REDIRECTS; hop++) {
    try { await assertPublicUrl(url) } catch (e) { throw httpError(400, `URL no permitida: ${e.message}`) }
    let res
    try {
      res = await axios.get(url, {
        responseType: 'arraybuffer', maxRedirects: 0, timeout: 30000,
        maxContentLength: DIRECT_MAX_BYTES, validateStatus: () => true,
      })
    } catch (e) {
      if (/maxContentLength/i.test(e.message)) throw httpError(413, `El archivo supera el máximo de ${DIRECT_MAX_BYTES / (1024 * 1024)}MB para esta vía.`)
      throw httpError(400, `No se pudo descargar la URL: ${e.message}`)
    }
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      url = new URL(res.headers.location, url).toString()
      continue
    }
    if (res.status !== 200) throw httpError(400, `La URL respondió ${res.status}`)
    const contentType = String(res.headers['content-type'] || '').split(';')[0].trim() || null
    return { buffer: Buffer.from(res.data), contentType }
  }
  throw httpError(400, 'Demasiados redirects')
}

/**
 * Resuelve los bytes + el tipo real de un "direct upload". Lanza errores
 * operacionales (`err.status`) que el controller traduce a la respuesta HTTP.
 *
 * @param {object} body - { name, content?, contentBase64?, url?, mimeType? }
 * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
 */
async function resolveDirectUpload({ name, content, contentBase64, url, mimeType: declaredRaw }) {
  const sources = [content, contentBase64, url].filter(v => typeof v === 'string' && v.length > 0)
  if (sources.length !== 1) throw httpError(400, 'Mandá exactamente uno de: content, contentBase64 o url')

  let buffer
  let sourceType = null
  if (content) buffer = Buffer.from(content, 'utf8')
  else if (contentBase64) buffer = Buffer.from(contentBase64.replace(/^data:[^,]*,/, ''), 'base64')
  else ({ buffer, contentType: sourceType } = await downloadPublicUrl(url))

  if (!buffer.length) throw httpError(400, 'El archivo está vacío')
  if (buffer.length > DIRECT_MAX_BYTES) {
    throw httpError(413, `El archivo supera el máximo de ${DIRECT_MAX_BYTES / (1024 * 1024)}MB para esta vía.`)
  }

  // Tipo: los magic bytes mandan; si no dicen nada, el mimeType declarado, el
  // Content-Type de la URL o la extensión del nombre.
  const ext = typeof name === 'string' && name.includes('.') ? name.split('.').pop().toLowerCase() : ''
  const declared = typeof declaredRaw === 'string' && declaredRaw.trim() ? declaredRaw.trim() : null
  const headerBuf = buffer.subarray(0, 32)
  const mimeType = detectImageType(headerBuf) || detectVideoType(headerBuf)
    || (detectDocumentType(headerBuf) === 'pdf' ? 'application/pdf' : null)
    || declared || (sourceType !== 'application/octet-stream' ? sourceType : null)
    || MIME_BY_EXT[ext] || (content ? 'text/plain' : 'application/octet-stream')
  if (isDangerousMime(mimeType)) throw httpError(400, 'Este tipo de archivo no está permitido.')

  return { buffer, mimeType }
}

module.exports = { resolveDirectUpload, downloadPublicUrl, httpError, DIRECT_MAX_BYTES, MIME_BY_EXT }
