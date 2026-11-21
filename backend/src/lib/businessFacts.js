// Datos duros del negocio que se le pasan a la IA (GEO y generación de Schema.org), y
// la regla de qué puede afirmar con ellos.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// El análisis de GEO leía el proyecto con `select: { domainRating }` y nada más: la IA
// no tenía UN dato real del negocio, pero el prompt del generador de Schema.org le pedía
// "para campos desconocidos usá valores de ejemplo realistas". De ahí salían datos
// inventados con cara de verdaderos (780 reseñas, horario de 7 a 22, entrega en 10-15
// minutos) que después alguien podía publicar como JSON-LD.
//
// Dos cambios: (1) le llega lo que SÍ sabemos (brief de Marca, brief de SEO/SEM y el NAP
// leído del JSON-LD en vivo), y (2) lo que no está acá no se completa: va como placeholder
// `{{...}}` para que lo llene una persona. Un dato faltante es un hueco visible; un dato
// inventado es un error que se propaga.
//
// ── Horarios y reseñas ───────────────────────────────────────────────────────
// Hoy no existen en ningún campo del sistema, así que viajan como `null` y el bloque lo
// dice. Cuando esté aprobado el módulo de Google Mi Negocio, la fuente de verdad de
// horarios, reseñas (cantidad y promedio reales) y dirección verificada es ESE módulo:
// se agregan en `gbp` dentro de buildBusinessFacts y el resto del prompt no cambia.

// Campos del brief de Marca y de SEO/SEM que son datos duros, no estrategia.
const MARCA_FACT_FIELDS = {
  direccion: 'Dirección',
  telefono:  'Teléfono / WhatsApp',
}

const SEO_FACT_FIELDS = {
  zona_geografica:      'Zona geográfica que cubre',
  servicios_posicionar: 'Servicios/productos',
  autor_experto:        'Autor/referente de la marca (E-E-A-T)',
  google_business:      'Ficha de Google Business Profile',
}

function clean(value) {
  if (value == null) return null
  const text = String(value).replace(/\s+/g, ' ').trim()
  return text || null
}

/**
 * Junta los datos duros del negocio desde las fuentes que hoy existen.
 *
 * @param {object}  opts
 * @param {object}  opts.project   — { name, websiteUrl }
 * @param {Array}   opts.briefs    — filas de ProjectBrief ({ type, answers })
 * @param {Array}   opts.napRows   — NAP leído del JSON-LD en vivo (extractNapSignals)
 * @param {object?} opts.gbp       — reservado para Google Mi Negocio (horarios/reseñas)
 */
function buildBusinessFacts({ project = {}, briefs = [], napRows = [], gbp = null } = {}) {
  const answers = type => (briefs.find(b => b.type === type)?.answers) || {}
  const marca = answers('marca')
  const seo   = answers('seo_sem')

  const fields = []
  for (const [key, label] of Object.entries(MARCA_FACT_FIELDS)) {
    fields.push({ key, label, value: clean(marca[key]), source: 'Brief de Marca' })
  }
  for (const [key, label] of Object.entries(SEO_FACT_FIELDS)) {
    fields.push({ key, label, value: clean(seo[key]), source: 'Brief de SEO/SEM' })
  }

  // El NAP del JSON-LD en vivo es el dato más confiable que tenemos: lo publica el propio
  // sitio. Se pasa aparte (no mezclado con el brief) para que la IA pueda señalar una
  // diferencia entre lo que el cliente declaró y lo que el sitio publica.
  const napFromSite = napRows
    .map(r => ({ url: r.url, name: clean(r.name), telephone: clean(r.telephone), address: clean(r.address) }))
    .filter(r => r.name || r.telephone || r.address)

  return {
    name:    clean(project.name),
    website: clean(project.websiteUrl),
    fields,
    napFromSite,
    // Sin módulo de Google Mi Negocio, estos no existen en el sistema.
    hours:   gbp?.hours   ?? null,
    reviews: gbp?.reviews ?? null,
  }
}

// Lo que NUNCA se puede inventar, con el nombre del placeholder que va en su lugar.
const UNKNOWABLE = [
  'horarios de atención',
  'cantidad o promedio de reseñas (aggregateRating / reviewCount)',
  'precios, tiempos de entrega o de respuesta',
  'año de fundación, cantidad de empleados o de sucursales',
  'certificaciones, premios o membresías',
]

/**
 * Bloque de prompt con los datos del negocio y la regla de uso. Pensado para
 * concatenarse tanto en el análisis de GEO como en la generación de Schema.org.
 */
function formatBusinessFactsBlock(facts) {
  const known   = facts.fields.filter(f => f.value)
  const unknown = facts.fields.filter(f => !f.value)

  const lines = []
  lines.push('═══ DATOS DEL NEGOCIO (única fuente válida para cualquier dato duro) ═══')
  lines.push(`Nombre: ${facts.name || '(sin dato)'}`)
  lines.push(`Sitio: ${facts.website || '(sin dato)'}`)

  lines.push(known.length
    ? `\nCargados por el equipo:\n${known.map(f => `  • ${f.label}: ${f.value}  [${f.source}]`).join('\n')}`
    : '\nEl equipo no cargó ningún dato duro del negocio en los briefs.')

  if (unknown.length) {
    lines.push(`\nSIN CARGAR (no los tenés, no los deduzcas): ${unknown.map(f => f.label).join(', ')}.`)
  }

  lines.push(facts.napFromSite.length
    ? `\nNAP publicado por el propio sitio (leído del JSON-LD en vivo — el dato más confiable):\n${facts.napFromSite.map(r => `  • ${r.url} → nombre: ${r.name ?? '(sin dato)'} | teléfono: ${r.telephone ?? '(sin dato)'} | dirección: ${r.address ?? '(sin dato)'}`).join('\n')}`
    : '\nEl sitio no publica NAP en JSON-LD en ninguna de las páginas rastreadas.')

  lines.push(facts.hours
    ? `\nHorarios de atención (Google Mi Negocio): ${facts.hours}`
    : '\nHorarios de atención: NO DISPONIBLES en el sistema.')
  lines.push(facts.reviews
    ? `\nReseñas (Google Mi Negocio): ${facts.reviews.count} reseñas, promedio ${facts.reviews.rating}`
    : 'Reseñas (cantidad y promedio): NO DISPONIBLES en el sistema.')

  lines.push(`
REGLA, SIN EXCEPCIONES: un dato duro del negocio solo puede salir de este bloque. Si no
está acá, no lo escribas ni como ejemplo ni como valor "realista" ni inferido del texto de
la página: dejá un placeholder entre llaves dobles ({{HORARIO}}, {{CANTIDAD_DE_RESEÑAS}})
para que lo complete una persona, o directamente omití el campo. Lo que nunca se inventa:
${UNKNOWABLE.map(u => `  • ${u}`).join('\n')}
Un placeholder visible es un pendiente; un número inventado es un error que alguien
publica. Tampoco afirmes que un dato "falta" en el sitio si acá figura como SIN CARGAR:
eso significa que no lo sabés, no que el sitio no lo tenga.`)

  return lines.join('\n')
}

module.exports = { MARCA_FACT_FIELDS, SEO_FACT_FIELDS, UNKNOWABLE, buildBusinessFacts, formatBusinessFactsBlock }
