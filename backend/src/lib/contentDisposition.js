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

// Percent-encoding para el `filename*` de la RFC 5987: encodeURIComponent deja
// pasar `'`, `(`, `)` y `*`, que NO son attr-char válidos (un `'` suelto parte
// el valor en dos), y escapa de más `|`, `^` y `` ` ``, que sí lo son.
function encodeRFC5987(str) {
  return encodeURIComponent(str)
    .replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%(7C|60|5E)/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

function safeContentDisposition(fileName, { type = 'attachment' } = {}) {
  const name = (fileName && String(fileName).trim()) || 'archivo'
  const header = contentDisposition(name, { type })

  // `content-disposition` omite `filename*` cuando el nombre entra entero en
  // ISO-8859-1 (ej. "informe ñ.pdf"): la RFC permite latin-1 crudo en
  // `filename`, y eso alcanza cuando el header lo escribimos NOSOTROS (Node
  // serializa los headers en latin-1, así que la "ñ" sale como el byte 0xF1 y
  // el navegador la lee bien).
  //
  // Pero NO alcanza cuando el valor viaja dentro de una URL firmada de R2
  // (`ResponseContentDisposition`): ahí el SDK lo URL-encodea en UTF-8 y R2 lo
  // devuelve tal cual en el header, de modo que el navegador —que lo lee como
  // latin-1— muestra "Ã±". Agregamos `filename*` siempre que haya algo fuera
  // de ASCII imprimible: los navegadores lo prefieren sobre `filename` y lo
  // decodifican como UTF-8, así el nombre llega igual por los dos caminos.
  if (!/^[\x20-\x7e]*$/.test(name) && !header.includes("filename*=")) {
    return `${header}; filename*=UTF-8''${encodeRFC5987(name)}`
  }
  return header
}

module.exports = { safeContentDisposition }
