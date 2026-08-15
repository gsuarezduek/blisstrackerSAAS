// Detección de video por "magic bytes", en el mismo espíritu que lib/imageType.js
// (que se deja intacto: bloquea SVG a propósito y lo usan avatares/logos/banners).
// Se usa para validar los assets del módulo Contenido sin confiar en la extensión
// del archivo ni en el Content-Type declarado por el cliente — ambos falsificables.
const { detectImageType } = require('./imageType')

// MP4/MOV comparten contenedor (ISO Base Media File Format): el primer box suele
// ser 'ftyp' en el offset 4..8, y el "major brand" en el offset 8..12 distingue
// el formato exacto — 'qt  ' es QuickTime/MOV; isom/mp42/mp41/avc1/iso2/etc. son
// MP4 genérico (no hace falta enumerarlos todos, cualquier brand que no sea 'qt  '
// se toma como MP4).
// WebM usa un contenedor distinto (Matroska/EBML), identificable por su header
// fijo 1A 45 DF A3 al inicio del archivo.
function detectVideoType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null

  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return 'video/webm'
  }

  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = buf.toString('ascii', 8, 12)
    return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4'
  }

  return null
}

// Valida una cabecera (buffer de bytes iniciales) contra un `kind` ('image' |
// 'video') y una whitelist de MIMEs. Mismo shape de retorno que
// validateImageUpload — se usa para el confirm del presigned upload, donde solo
// tenemos los primeros bytes del objeto (ver objectStorage.service.getObjectHead).
function validateMediaHeader(buf, kind, allowedMimes) {
  const mimeType = kind === 'video' ? detectVideoType(buf) : detectImageType(buf)
  if (!mimeType || !allowedMimes.includes(mimeType)) {
    return {
      ok: false,
      error: `El archivo no es un ${kind === 'video' ? 'video' : 'imagen'} válido o el formato no está permitido.`,
    }
  }
  return { ok: true, mimeType }
}

module.exports = { detectVideoType, validateMediaHeader }
