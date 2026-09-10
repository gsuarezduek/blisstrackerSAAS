const contentDisposition = require('content-disposition')

// Arma el header Content-Disposition de forma segura para cualquier nombre de
// archivo. `res.setHeader`/`res.set` de Express rechazan con ERR_INVALID_CHAR
// (crashea el request) cualquier valor de header con un carácter de control
// (\r, \n…) o de código > 0xFF — algo fácil de pisar armando el string a mano
// interpolando el nombre real del archivo, que lo elige el usuario que subió
// (tildes, "ñ", emoji, etc. rompen el interpolado directo).
// Usa el mismo paquete que Express usa internamente en res.attachment()/
// res.download() (RFC 6266): fallback ASCII para navegadores viejos +
// filename*=UTF-8''<percent-encoded> con el nombre completo para el resto.
function safeContentDisposition(fileName, { type = 'attachment' } = {}) {
  const name = (fileName && String(fileName).trim()) || 'archivo'
  return contentDisposition(name, { type })
}

module.exports = { safeContentDisposition }
