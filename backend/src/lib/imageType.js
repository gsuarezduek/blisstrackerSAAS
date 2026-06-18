// Detección del tipo real de imagen por "magic bytes" (firma del archivo), sin dependencias.
// Se usa para validar subidas (logos, banners, avatares) sin confiar en la extensión del
// nombre ni en el Content-Type que manda el cliente — ambos falsificables. Bloquea de paso
// archivos SVG (que pueden contener <script> y causar XSS al servirse same-origin).
//
// Devuelve el MIME real ('image/png' | 'image/jpeg' | 'image/webp' | 'image/gif') o null.
function detectImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
    return 'image/png'
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg'
  }
  // GIF: "GIF87a" | "GIF89a"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 &&
      (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61) {
    return 'image/gif'
  }
  // WebP: "RIFF" .... "WEBP"
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return 'image/webp'
  }
  return null
}

// Valida un buffer contra una lista de MIMEs permitidos. Devuelve { ok, mimeType, error }.
function validateImageUpload(buf, allowedMimes) {
  const mimeType = detectImageType(buf)
  if (!mimeType || !allowedMimes.includes(mimeType)) {
    return { ok: false, error: 'El archivo no es una imagen válida o el formato no está permitido.' }
  }
  return { ok: true, mimeType }
}

module.exports = { detectImageType, validateImageUpload }
