// Briefing previo a generar una propuesta: la IA lee el caso y devuelve qué entendió,
// preguntas con opciones sugeridas, datos que faltan y qué secciones conviene incluir.
// El usuario confirma/ajusta y las respuestas viajan como `briefing` a la generación.
//
// Este módulo define el catálogo de secciones "opcionales" que el usuario puede prender o
// apagar, normaliza la salida de la IA y arma el bloque de prompt con las respuestas.

// Secciones que la IA puede incluir o no según el caso. `pricing`, `services` y el cierre no
// están: son siempre parte de la propuesta.
const SECTION_CATALOG = [
  { key: 'challenge',     label: 'Desafío / situación del cliente' },
  { key: 'repositioning', label: 'Cambio de posicionamiento (antes → después)' },
  { key: 'objectives',    label: 'Objetivos' },
  { key: 'territories',   label: 'Territorios / pilares de comunicación' },
  { key: 'mix',           label: 'Mix de contenidos (barras)' },
  { key: 'formats',       label: 'Formatos e ideas de contenido' },
  { key: 'expansion',     label: 'Historia de expansión / lanzamiento' },
  { key: 'measurement',   label: 'Cómo vamos a medir' },
  { key: 'methodology',   label: 'Metodología y próximos pasos' },
]
const SECTION_KEYS = SECTION_CATALOG.map(s => s.key)

const MAX_QUESTIONS = 6
const MAX_ANSWER_LEN = 500

function str(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function strList(v, maxItems, maxLen) {
  return (Array.isArray(v) ? v : []).map(x => str(x, maxLen)).filter(Boolean).slice(0, maxItems)
}

/** Normaliza la salida de la IA del briefing a un shape seguro para el frontend. */
function normalizeBrief(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}

  const questions = (Array.isArray(src.questions) ? src.questions : []).map((q, i) => {
    if (!q || typeof q !== 'object') return null
    const question = str(q.question, 300)
    if (!question) return null
    const kind = ['single', 'multi', 'text'].includes(q.kind) ? q.kind : 'single'
    const options = kind === 'text' ? [] : strList(q.options, 5, 160)
    if (kind !== 'text' && options.length < 2) return null // una pregunta con opciones necesita al menos 2
    const recommended = strList(Array.isArray(q.recommended) ? q.recommended : [q.recommended], 5, 160).filter(r => options.includes(r))
    return {
      id: str(q.id, 24) || `q${i + 1}`,
      question,
      why: str(q.why, 300),
      kind,
      options,
      recommended: kind === 'single' ? recommended.slice(0, 1) : recommended,
    }
  }).filter(Boolean).slice(0, MAX_QUESTIONS)

  // Todas las secciones del catálogo siempre presentes; la IA solo decide include/reason.
  const bySection = new Map((Array.isArray(src.sections) ? src.sections : [])
    .filter(s => s && SECTION_KEYS.includes(s.key)).map(s => [s.key, s]))
  const sections = SECTION_CATALOG.map(({ key, label }) => {
    const s = bySection.get(key)
    return { key, label, include: s ? s.include !== false : true, reason: s ? str(s.reason, 200) : '' }
  })

  return {
    understanding: strList(src.understanding, 5, 300),
    questions,
    missing: strList(src.missing, 6, 200),
    sections,
  }
}

/** Sanitiza el `briefing` que manda el frontend al generar (nunca se confía en el body). */
function sanitizeBriefing(raw) {
  if (!raw || typeof raw !== 'object') return null
  const answers = (Array.isArray(raw.answers) ? raw.answers : [])
    .map(a => (a && typeof a === 'object' ? { question: str(a.question, 300), answer: str(a.answer, MAX_ANSWER_LEN) } : null))
    .filter(a => a && a.question && a.answer)
    .slice(0, MAX_QUESTIONS * 2)
  const exclude = (Array.isArray(raw.excludeSections) ? raw.excludeSections : []).filter(k => SECTION_KEYS.includes(k))
  const include = (Array.isArray(raw.includeSections) ? raw.includeSections : []).filter(k => SECTION_KEYS.includes(k) && !exclude.includes(k))
  if (!answers.length && !exclude.length && !include.length) return null
  return { answers, includeSections: include, excludeSections: exclude }
}

/** Texto para el prompt de generación con las decisiones del usuario. */
function briefingToPrompt(briefing) {
  if (!briefing) return ''
  const label = k => SECTION_CATALOG.find(s => s.key === k)?.label || k
  const parts = []
  if (briefing.answers?.length) {
    parts.push(`## Decisiones del ejecutivo comercial (TIENEN PRIORIDAD sobre tus suposiciones; reflejalas en la propuesta)\n${briefing.answers.map(a => `- ${a.question}\n  → ${a.answer}`).join('\n')}`)
  }
  if (briefing.includeSections?.length) {
    parts.push(`## Secciones que SÍ debe tener\n${briefing.includeSections.map(k => `- ${label(k)}`).join('\n')}`)
  }
  if (briefing.excludeSections?.length) {
    parts.push(`## Secciones que NO debe tener (no las incluyas)\n${briefing.excludeSections.map(k => `- ${label(k)}`).join('\n')}`)
  }
  return parts.join('\n\n')
}

module.exports = { SECTION_CATALOG, SECTION_KEYS, normalizeBrief, sanitizeBriefing, briefingToPrompt }
