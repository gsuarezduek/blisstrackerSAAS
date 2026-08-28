// Detección del tipo real de un documento por "magic bytes", mismo espíritu que
// lib/imageType.js/lib/mediaType.js — no confiamos en la extensión del nombre ni
// en el Content-Type declarado por el cliente.
//
// DOCX es un ZIP (formato OOXML): la firma `PK\x03\x04` identifica cualquier ZIP,
// no específicamente un .docx (podría ser un .xlsx/.pptx/ZIP genérico) — inspeccionar
// el listado interno del ZIP para confirmar `word/document.xml` sería más preciso,
// pero no vale la complejidad acá: `mammoth.extractRawText` ya lanza si el ZIP no
// es un Word válido, y ese error se captura en whatsappBotDocument.service.js
// marcando el documento como `status:'error'` sin romper la subida.
// TXT no tiene firma binaria: se acepta solo si el cliente lo declaró (por extensión)
// Y el contenido no tiene bytes nulos (heurística simple para descartar binarios).
function detectDocumentType(buf, declaredExt) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return null

  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return 'pdf' // "%PDF"
  }
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return 'docx' // "PK\x03\x04"
  }
  if (declaredExt === 'txt' && !buf.subarray(0, Math.min(buf.length, 1000)).includes(0)) {
    return 'txt'
  }
  return null
}

module.exports = { detectDocumentType }
