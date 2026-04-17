/**
 * Extrae y parsea el JSON de una respuesta de Claude.
 *
 * Claude a veces devuelve el JSON envuelto en bloques markdown (```json ... ```)
 * o con texto introductorio antes del objeto. Esta función es tolerante a esos
 * formatos: elimina las fences, luego extrae lo que hay entre el primer { y
 * el último } antes de hacer JSON.parse.
 *
 * Lanza SyntaxError si no puede parsear el resultado.
 */
function parseAIJson(text) {
  // 1. Eliminar fences de markdown (con o sin "json", en cualquier posición)
  text = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()

  // 2. Extraer el objeto JSON (entre primer { y último })
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    text = text.slice(start, end + 1)
  }

  return JSON.parse(text)
}

module.exports = { parseAIJson }
