// ═══════════════════════════════════════════════════════════════════════════════
// GEO — helpers y constantes compartidas
// ═══════════════════════════════════════════════════════════════════════════════

export const AI_META = {
  chatgpt:    { label: 'ChatGPT', color: 'bg-green-500' },
  gemini:     { label: 'Gemini', color: 'bg-blue-500' },
  claude:     { label: 'Claude', color: 'bg-orange-500' },
  grok:       { label: 'Grok', color: 'bg-gray-800 dark:bg-gray-300' },
  metaAi:     { label: 'Meta AI', color: 'bg-blue-600' },
  perplexity: { label: 'Perplexity', color: 'bg-teal-500' },
  copilot:    { label: 'Copilot', color: 'bg-indigo-500' },
}

export const COMPONENTS_META = [
  { key: 'citability', label: 'Citabilidad IA',     desc: 'Qué tan probable es que la IA cite tu sitio' },
  { key: 'brandAuthority',  label: 'Autoridad de Marca', desc: 'Reconocimiento y consistencia de la marca' },
  { key: 'eeat', label: 'E-E-A-T',            desc: 'Experiencia, autoridad y confiabilidad' },
  { key: 'technical', label: 'Técnico',            desc: 'Rendimiento, accesibilidad y rastreo' },
  { key: 'schema', label: 'Schema Markup',      desc: 'Datos estructurados y metadatos' },
  { key: 'platforms', label: 'Plataformas IA',     desc: 'Acceso para crawlers de IA (GPTBot, etc.)' },
]

export const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 }
export const SEVERITY_LABELS = { high: 'Alta', medium: 'Media', low: 'Baja' }
export const SEVERITY_COLORS = {
  high:   'bg-red-100    dark:bg-red-900/30  text-red-700    dark:text-red-400',
  medium: 'bg-amber-100  dark:bg-amber-900/30 text-amber-700  dark:text-amber-400',
  low:    'bg-blue-100   dark:bg-blue-900/30  text-blue-700   dark:text-blue-400',
}

// Bandas basadas en investigación Princeton KDD 2024
export function scoreBand(score) {
  if (score == null) return null
  if (score >= 86) return { label: 'Excelente', color: 'emerald' }
  if (score >= 68) return { label: 'Bueno',     color: 'green'   }
  if (score >= 36) return { label: 'Base',       color: 'amber'   }
  return                  { label: 'Crítico',    color: 'red'     }
}

export function scoreColor(score) {
  const band = scoreBand(score)
  if (!band) return 'text-gray-400'
  return { emerald: 'text-emerald-500', green: 'text-green-500', amber: 'text-amber-500', red: 'text-red-500' }[band.color]
}

export function scoreRing(score) {
  const band = scoreBand(score)
  if (!band) return 'border-gray-200 dark:border-gray-700'
  return { emerald: 'border-emerald-400', green: 'border-green-400', amber: 'border-amber-400', red: 'border-red-400' }[band.color]
}

export function scoreLabel(score) {
  return scoreBand(score)?.label ?? ''
}

export function scoreBarColor(score) {
  const band = scoreBand(score)
  if (!band) return 'bg-gray-300'
  return { emerald: 'bg-emerald-400', green: 'bg-green-400', amber: 'bg-amber-400', red: 'bg-red-400' }[band.color]
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
