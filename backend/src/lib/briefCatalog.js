// Catálogo de tipos de briefs por proyecto.
// El backend solo necesita validar el `type`; las preguntas/campos viven en el
// espejo del frontend (frontend/src/components/briefs/briefCatalog.js) para el render.
// El Brief de Marca ("marca") es el documento madre; el resto son específicos por servicio.
// "memoria" es un espacio de notas libres del cliente, va primero (antes de Marca).

const BRIEF_TYPES = ['memoria', 'marca', 'organico', 'meta_ads', 'web', 'seo_sem', 'crm']

// Título legible por tipo — para el mensaje de sistema del chat cuando se completa un
// brief. Espejo liviano de los `title` en frontend/src/components/briefs/briefCatalog.js.
const BRIEF_LABELS = {
  memoria: 'Memoria',
  marca: 'Marca',
  organico: 'Contenido Orgánico (RRSS)',
  meta_ads: 'Performance / Meta Ads',
  web: 'Diseño y Desarrollo Web',
  seo_sem: 'SEO / SEM (Google)',
  crm: 'CRM y Automatizaciones',
}

// Cantidad total de campos por tipo de brief — SOLO para calcular el % de completitud
// (mismo criterio 80% que `briefIsComplete` en el frontend). Es un espejo liviano
// (cuenta de campos, no el catálogo completo de preguntas, que vive únicamente en
// frontend/src/components/briefs/briefCatalog.js): si se agregan/quitan campos ahí,
// actualizar estos números o el mensaje de "brief completado" del chat queda desfasado.
const BRIEF_FIELD_COUNTS = {
  memoria: 1,
  marca: 31,
  organico: 16,
  meta_ads: 16,
  web: 20,
  seo_sem: 18,
  crm: 25,
}

function isValidBriefType(type) {
  return BRIEF_TYPES.includes(type)
}

function briefLabel(type) {
  return BRIEF_LABELS[type] || type
}

// % de campos respondidos (0–1) sobre el total del tipo. `answers` ya viene limpio
// (sin vacíos) desde saveBrief, así que alcanza con contar sus keys.
function briefCompletionPct(type, answers) {
  const total = BRIEF_FIELD_COUNTS[type] || 0
  if (total === 0) return 0
  const answered = answers && typeof answers === 'object' ? Object.keys(answers).length : 0
  return Math.min(answered, total) / total
}

// "Completo" con 80% o más de los campos respondidos — mismo umbral que
// briefIsComplete() en el frontend.
function isBriefComplete(type, answers) {
  return briefCompletionPct(type, answers) >= 0.8
}

module.exports = { BRIEF_TYPES, isValidBriefType, briefLabel, briefCompletionPct, isBriefComplete }
