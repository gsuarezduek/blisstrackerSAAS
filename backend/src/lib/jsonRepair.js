// Parseo tolerante de JSON devuelto por Claude — comparten esto geoAudit.service.js
// y geoVisibility.service.js (y cualquier otro caller que le pida a la IA un JSON
// "puro"). Los LLM a veces devuelven JSON válido salvo por una coma colgante antes
// de un `}`/`]`; eso NO es el mismo bug que un JSON truncado por max_tokens (ese
// no tiene arreglo posible acá, hay que pedirle de nuevo con más tokens).

function sanitizeTrailingCommas(raw) {
  return raw.replace(/,(\s*[}\]])/g, '$1')
}

function parseLooseJson(rawText) {
  const raw = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  try {
    return JSON.parse(raw)
  } catch (err) {
    try {
      return JSON.parse(sanitizeTrailingCommas(raw))
    } catch {
      const parseErr = new Error(`No se pudo interpretar la respuesta de la IA: ${err.message}`)
      parseErr.rawText = raw
      throw parseErr
    }
  }
}

module.exports = { sanitizeTrailingCommas, parseLooseJson }
