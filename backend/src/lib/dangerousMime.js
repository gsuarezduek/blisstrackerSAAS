// Denylist de MIME types que un navegador puede ejecutar como HTML/script al
// servirse same-origin (XSS vía archivo subido por un usuario). El Content-Type
// HTTP no distingue mayúsculas/minúsculas ni importa el parámetro ";charset=...",
// así que todo chequeo contra esta lista tiene que normalizar primero — comparar
// el string crudo (ej. "TEXT/HTML") deja pasar el mismo tipo bloqueado.
const DANGEROUS_MIME_TYPES = ['text/html', 'application/xhtml+xml', 'image/svg+xml']

function normalizeMime(mimeType) {
  return String(mimeType || '').split(';')[0].trim().toLowerCase()
}

function isDangerousMime(mimeType) {
  return DANGEROUS_MIME_TYPES.includes(normalizeMime(mimeType))
}

module.exports = { DANGEROUS_MIME_TYPES, normalizeMime, isDangerousMime }
