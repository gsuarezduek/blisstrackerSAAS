// Similitud léxica simple (Jaccard sobre palabras), sin IA — determinística y barata,
// pensada para detectar cuando dos títulos de hallazgo generados por IA (GEO, Ads
// Advisor, RRSS Advisor) describen lo mismo aunque el análisis los haya redactado con
// otras palabras entre corridas. No pretende entender significado, solo solapamiento
// de vocabulario relevante.

function tokenize(str) {
  const normalized = String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/[^a-z0-9\s]/g, ' ')
  return new Set(normalized.split(/\s+/).filter(w => w.length > 2)) // descarta conectores cortos (de, la, el, y...)
}

function jaccardSimilarity(a, b) {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let intersection = 0
  for (const w of ta) if (tb.has(w)) intersection++
  const union = ta.size + tb.size - intersection
  return union === 0 ? 0 : intersection / union
}

module.exports = { jaccardSimilarity }
