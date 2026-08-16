// Helpers compartidos para inyectar el contenido de un ProjectBrief (answers JSON) en
// un prompt de IA. Extraído de contentBrief.service.js — lo usan todos los generadores
// que arman contexto de negocio/marca a partir de briefs (Content Brief, Ads Advisor, …).

/**
 * Vuelca los campos de un brief usando un mapa { key: 'Etiqueta legible' } — solo los
 * campos conocidos/etiquetados, en el orden del mapa, salteando los vacíos.
 */
function briefLines(answers, labels) {
  if (!answers || typeof answers !== 'object') return ''
  const lines = []
  for (const [k, label] of Object.entries(labels)) {
    const v = answers[k]
    if (v && String(v).trim()) lines.push(`- ${label}: ${String(v).trim()}`)
  }
  return lines.join('\n')
}

/**
 * Vuelca TODOS los valores no vacíos de un brief (sin conocer sus claves), concatenados
 * y truncados — útil para dar contexto de marca/tono sin tener que mapear cada campo.
 */
function briefDump(answers, maxChars = 1500) {
  if (!answers || typeof answers !== 'object') return ''
  const txt = Object.values(answers).filter(v => v && String(v).trim()).map(v => String(v).trim()).join(' · ')
  return txt.length > maxChars ? txt.slice(0, maxChars) + '…' : txt
}

module.exports = { briefLines, briefDump }
