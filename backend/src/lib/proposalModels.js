// Calidad de generación de propuestas: catálogo CURADO (no la lista completa de la API de
// modelos — trae versiones viejas y modelos chicos que no sirven para texto comercial).
// `standard` es el default; `max` usa un modelo más grande: escribe con mejor criterio comercial
// y más especificidad, pero tarda ~2.5x y cuesta bastante más por token.
const QUALITIES = {
  standard: { model: 'claude-sonnet-5' },
  max: { model: 'claude-opus-5' },
}

const DEFAULT_QUALITY = 'standard'

function resolveQuality(q) {
  const key = Object.prototype.hasOwnProperty.call(QUALITIES, q) ? q : DEFAULT_QUALITY
  return { quality: key, model: QUALITIES[key].model }
}

module.exports = { QUALITIES, DEFAULT_QUALITY, resolveQuality }
