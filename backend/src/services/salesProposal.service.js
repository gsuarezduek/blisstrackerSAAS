const { anthropic } = require('../lib/claude')
const { logTokens } = require('../lib/logTokens')
const { normalizeDoc } = require('../lib/proposalDoc')
const { normalizeBrief, briefingToPrompt, SECTION_CATALOG } = require('../lib/proposalBrief')

// Sonnet (no Haiku): las propuestas son texto comercial de cara al cliente, no vale la
// pena ahorrar tokens acá — mejor redacción/instruction-following que Haiku.
const MODEL = 'claude-sonnet-5'
// Con margen generoso: Sonnet 5 piensa por defecto (adaptive thinking) y max_tokens
// es un tope sobre thinking + texto de salida combinados: si queda corto, se corta a
// mitad del JSON.
const MAX_TOKENS = 12000

const SYSTEM_PROMPT = `Sos un estratega comercial senior de una agencia de marketing. Armás propuestas para clientes que se leen como un plan estratégico a medida, no como un catálogo de servicios: primero entendés el negocio del cliente y su desafío, definís una idea central, y recién después mostrás qué vamos a hacer.

Escribís en español rioplatense, en tono profesional, cercano y seguro. Le hablás al cliente en tercera persona del plural ("En Pastiza están dando un paso…", "Queremos que ustedes…"), nunca con "vos" singular ni en primera persona del cliente.

NO devolvés HTML: devolvés un documento estructurado en JSON, formado por bloques tipados que otro sistema dibuja con el diseño de la agencia. Respondés EXCLUSIVAMENTE con el objeto JSON, sin markdown ni texto fuera de él.

## Principios
- La propuesta debe sentirse escrita para ESTE cliente. Usá su vocabulario, su rubro, su situación real. Todo lo que aparezca en las notas de reunión, la investigación o los objetivos (el cambio que están atravesando, referentes que mencionaron, ciudades/zonas, líneas de producto, diferenciales) es material central: usalo, no lo ignores.
- Estrategia antes que servicios: desafío/situación → cambio o idea central → objetivos → enfoque → servicios → medición → próximos pasos. Adaptá el orden y las secciones al caso.
- NO inventes datos duros: cantidad de sucursales, facturación, métricas de competidores, resultados garantizados, porcentajes de mejora, plazos. Si un dato no está en el contexto, redactá sin cifra. Las cantidades de entregables (ej. "12 piezas mensuales") solo van si figuran en la descripción del servicio o en el contexto.
- NO escribas precios ni montos en ningún texto: el precio y la comparación de planes los agrega el sistema (bloque "pricing").
- Sé concreto y específico. Evitá frases de relleno ("soluciones integrales", "llevar tu marca al siguiente nivel", "estrategia 360").
- Podés resaltar 1-2 conceptos clave por párrafo con **negrita**. Ninguna otra sintaxis (nada de HTML ni markdown salvo esa negrita).

## Bloques disponibles
Todos admiten "heading" (título de sección; usalo en el primer bloque de cada sección, dejalo vacío si el bloque continúa la sección anterior).

- "text": { "type":"text", "heading":"", "subheading":"", "paragraphs":["…"] } — párrafos de desarrollo.
- "callout": { "type":"callout", "heading":"", "label":"El desafío de marketing:", "text":"…" } — recuadro destacado con una idea clave.
- "before_after": { "type":"before_after", "heading":"", "fromLabel":"Hoy", "from":"“Pastiza es una carnicería.”", "toLabel":"Hacia dónde vamos", "to":"“Pastiza es el lugar donde resolvés la comida.”", "note":"" } — solo si hay una transformación real de posicionamiento.
- "cards": { "type":"cards", "heading":"", "subheading":"", "intro":"", "variant":"plain|funnel", "columns":2-4, "items":[{"tag":"01","title":"…","text":"…"}], "outro":"" } — grilla de tarjetas. "funnel" = tarjetas con color de marca degradado, ideal para objetivos encadenados (Conocimiento → Consideración → Visita → Recurrencia). "plain" para territorios, pilares, áreas de medición, etc. "tag" es opcional (numeración "01" o una etiqueta corta).
- "bars": { "type":"bars", "heading":"", "intro":"", "items":[{"label":"Producto","value":40}], "outro":"" } — mix porcentual (los valores deberían sumar 100). Solo si hay un mix de contenidos/inversión/foco razonable de proponer (típicamente cuando hay redes sociales).
- "pills": { "type":"pills", "heading":"", "subheading":"Formatos de contenido", "intro":"", "items":["¿Qué compro para…?", "…"] } — lista de etiquetas cortas (formatos, canales, ideas de series).
- "steps": { "type":"steps", "heading":"", "intro":"", "variant":"timeline|numbered", "items":[{"title":"…","text":"…"}], "outro":"" } — "timeline" = secuencia corta en horizontal (3-5 etapas, ej. expansión a un nuevo local: Intriga → Presentación → Descubrimiento → Conversión → Recurrencia); "numbered" = lista numerada vertical (metodología / próximos pasos).
- "services": { "type":"services", "heading":"Propuesta de servicios", "intro":"", "items":[{"name":"<nombre EXACTO del servicio>","intro":"1-2 frases de qué logra este servicio para ESTE cliente","bullets":["entregable o acción concreta", "…"]}] } — UN item por cada servicio distinto que aparezca en los planes, con el nombre exacto tal como figura. 3-5 bullets específicos por servicio, basados en la descripción del servicio y adaptados al cliente. El sistema agrega solo la etiqueta de qué planes lo incluyen.
- "pricing": { "type":"pricing", "heading":"Inversión", "intro":"", "note":"…" } — el sistema dibuja la tabla de planes con los precios exactos. Vos solo aportás "note": 1-3 frases que expliquen para qué tipo de necesidad conviene cada plan (sin repetir precios).
- "closing": { "type":"closing", "label":"Idea central", "quote":"frase-síntesis de la propuesta entre comillas", "text":"2-3 frases que cierran la idea" } — bloque final oscuro. Una sola vez, al final.

## Estructura recomendada (adaptala, no la copies literal)
1. Desafío / situación del cliente (text o callout) — qué está atravesando y cuál es el desafío de marketing.
2. Cambio de posicionamiento o idea estratégica (before_after + cards si corresponde).
3. Objetivos (cards funnel de 3-4, más un párrafo que los ligue con la generación de consultas/ventas).
4. Enfoque y comunicación — territorios/pilares (cards), mix (bars), formatos (pills), una idea eje de contenido o campaña, y una historia de expansión (steps timeline) SOLO cuando el contexto lo respalde y algún servicio lo justifique.
5. Propuesta de servicios (services) y Inversión (pricing).
6. Cómo vamos a medir (cards por área: marca, digital, local/ventas, reputación… según los servicios).
7. Metodología y próximos pasos (steps numbered, 4-5 pasos) y el cierre (closing).
Usá entre 8 y 13 bloques. Cada sección con contenido de verdad; preferí menos secciones sólidas a muchas vacías. Si un servicio no incluye redes/contenido, no armes bars ni pills de contenido; si es una propuesta de solo Google Ads, el enfoque habla de intención de búsqueda, no de "territorios de comunicación".

## Forma de salida
{
  "title": "Propuesta de Marketing Digital",
  "subtitle": "frase corta y específica del cliente que resume la propuesta (ej. “De carnicería a almacén de cercanía”)",
  "lead": "1-2 frases de bajada bajo el subtítulo",
  "blocks": [ … ]
}`

function formatPrice(n) {
  const num = Number(n)
  return n === '' || n == null || !Number.isFinite(num) ? null : num.toLocaleString('es-AR')
}

function planBlock(plan, i) {
  const price = formatPrice(plan.price)
  const priceLine = price ? ` (precio mensual ${plan.currency || 'ARS'} ${price} — NO lo escribas en los textos)` : ''
  const services = plan.services?.length
    ? plan.services.map(s => `  - ${s.name}${s.description ? `: ${s.description}` : ''}`).join('\n')
    : '  (sin servicios específicos; inferí un alcance razonable para este plan según los objetivos)'
  return `Plan "${plan.label || `Opción ${i + 1}`}"${priceLine}\nServicios incluidos:\n${services}`
}

function researchBlock(r) {
  if (!r || typeof r !== 'object') return ''
  const list = a => (Array.isArray(a) && a.length ? a.map(x => `  - ${x}`).join('\n') : '')
  const lines = [
    r.description && `Descripción: ${r.description}`,
    list(r.services) && `Productos/servicios:\n${list(r.services)}`,
    r.market && `Mercado: ${r.market}`,
    r.socialMedia && `Redes sociales: ${r.socialMedia}`,
    r.website && `Sitio web: ${r.website}`,
    r.seo && `SEO: ${r.seo}`,
    r.ads && `Publicidad: ${r.ads}`,
    list(r.needs) && `Necesidades detectadas:\n${list(r.needs)}`,
    list(r.opportunities) && `Oportunidades detectadas:\n${list(r.opportunities)}`,
  ].filter(Boolean)
  return lines.join('\n')
}

// Datos del caso + planes + todo el contexto del lead. Lo comparten el briefing y la generación.
function buildCaseBlock({ agencyName, company, lead, contact, plans, objectives, notesText, activityNotes, research }) {
  const plansList = Array.isArray(plans) && plans.length ? plans : [{ label: '', price: null, services: [] }]
  const plansBlock = plansList.map(planBlock).join('\n\n')
  const researchText = researchBlock(research)

  const contextParts = [
    notesText && `## Notas de reunión con el cliente (la fuente más importante — usá su contenido)\n${notesText}`,
    activityNotes?.length && `## Notas del seguimiento comercial\n${activityNotes.map(n => `- ${n}`).join('\n')}`,
    researchText && `## Investigación previa sobre la empresa\n${researchText}`,
    company.notes && `## Observaciones internas sobre la empresa\n${company.notes}`,
  ].filter(Boolean)

  return `## Datos
Agencia: ${agencyName || 'nuestra agencia'}
Cliente: ${company.name}${company.industry ? ` (rubro: ${company.industry})` : ''}${company.website ? `\nSitio web: ${company.website}` : ''}
${lead.title ? `Oportunidad: ${lead.title}\n` : ''}${lead.origin ? `Origen del contacto: ${lead.origin}\n` : ''}${contact ? `Contacto principal: ${contact.name}${contact.title ? ` (${contact.title})` : ''}\n` : ''}Objetivos declarados: ${objectives || '(no especificados; deducilos de las notas y la investigación)'}

## Planes (los servicios de cada plan están definidos, no agregues ni quites)
${plansBlock}

${contextParts.length ? contextParts.join('\n\n') : '## Contexto\n(No hay notas ni investigación cargadas: trabajá con el rubro y los objetivos, sin inventar datos específicos.)'}`
}

function buildPrompt(ctx) {
  const { guidelines, instructions, briefing } = ctx
  const briefingText = briefingToPrompt(briefing)
  return `Armá la propuesta comercial para el siguiente caso.

${buildCaseBlock(ctx)}
${guidelines ? `\n## Indicaciones de la agencia (respetalas SIEMPRE)\n${guidelines}` : ''}${instructions ? `\n\n## Instrucciones específicas para esta propuesta\n${instructions}` : ''}${briefingText ? `\n\n${briefingText}` : ''}

Devolvé solo el JSON del documento.`
}

function extractJson(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try { return JSON.parse(text.slice(start, end + 1)) } catch { return null }
}

/**
 * Genera el documento estructurado de una propuesta con Claude Sonnet. Síncrono (on-demand):
 * el caller ya validó el presupuesto (assertTokenBudget). Devuelve { doc, usage }.
 * `doc` ya viene normalizado (bloques válidos, services + pricing garantizados).
 */
async function generateProposalDoc(ctx, { workspaceId, userId, model = MODEL }) {
  const message = await anthropic.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPrompt(ctx) }],
  }, { timeout: 300_000 }) // más holgado que el default del cliente (120s): modelos más grandes tardan más
  logTokens('salesProposal', userId, message.usage, workspaceId).catch(() => {})

  // Sonnet 5 piensa por defecto: el primer bloque puede ser "thinking", no el texto.
  const textBlock = message.content.find(b => b.type === 'text')
  const raw = extractJson(textBlock?.text || '')
  if (!raw) {
    const err = new Error(message.stop_reason === 'max_tokens'
      ? 'La propuesta quedó demasiado larga y se cortó. Probá con instrucciones más acotadas.'
      : 'La IA no devolvió un documento válido. Intentá de nuevo.')
    err.status = 502
    err.code = 'PROPOSAL_INVALID_OUTPUT'
    throw err
  }
  return { doc: normalizeDoc(raw, { ensureRequired: true }), usage: message.usage }
}

// ── Briefing previo ─────────────────────────────────────────────────────────────────────
const BRIEF_MODEL = 'claude-sonnet-5' // siempre el estándar: es una llamada corta y rápida
const BRIEF_MAX_TOKENS = 6000

const BRIEF_SYSTEM_PROMPT = `Sos un estratega comercial senior de una agencia de marketing. Antes de redactar una propuesta a un cliente, revisás el caso con el ejecutivo comercial que la va a enviar: le mostrás qué entendiste, le preguntás lo que de verdad cambia la propuesta y le marcás qué información falta. Escribís en español rioplatense, breve y directo. Respondés EXCLUSIVAMENTE con un objeto JSON, sin markdown ni texto fuera de él.

## Reglas
- "understanding": 3 a 5 frases muy cortas con lo que entendiste del cliente y su momento (basadas SOLO en el contexto dado).
- "questions": entre 3 y 6 preguntas, solo sobre DECISIONES que cambian la propuesta: ángulo estratégico o idea central, énfasis entre servicios, qué plan recomendar, tono, referentes/competidores a mencionar o no, restricciones del cliente, prioridad entre objetivos. NO preguntes nada que ya esté respondido en las notas o la investigación. NO hagas preguntas de relleno.
  Cada pregunta: { "id":"q1", "question":"…", "why":"por qué importa, en una frase", "kind":"single|multi|text", "options":["2 a 5 opciones concretas y ESPECÍFICAS de este cliente, no genéricas"], "recommended":"la opción que recomendás (o lista, si kind es multi)" }. "recommended" debe ser textualmente una de las options. Usá "text" (sin options) solo si no se puede acotar a opciones.
- "missing": datos concretos que no están en el contexto y que harían más fuerte la propuesta (ej. cantidad de sucursales, presupuesto de pauta, competidores principales). La propuesta NO los va a inventar. Máximo 6.
- "sections": para CADA una de estas claves, decidí si incluirla en la propuesta según el caso y los servicios, con un "reason" de una frase: ${SECTION_CATALOG.map(s => `"${s.key}" (${s.label})`).join(', ')}. Ej.: si no hay redes sociales entre los servicios, "mix" y "formats" van con include:false; si no hay aperturas ni lanzamientos, "expansion" va con include:false.

## Forma de salida
{ "understanding":["…"], "questions":[{…}], "missing":["…"], "sections":[{"key":"challenge","include":true,"reason":"…"}] }`

/**
 * Briefing previo: qué entendió la IA, preguntas con opciones, datos faltantes y secciones
 * recomendadas. Devuelve { brief, usage }. El caller ya validó el presupuesto.
 */
async function generateProposalBrief(ctx, { workspaceId, userId }) {
  const guidelines = ctx.guidelines ? `\n\n## Indicaciones de la agencia\n${ctx.guidelines}` : ''
  const instructions = ctx.instructions ? `\n\n## Instrucciones específicas para esta propuesta\n${ctx.instructions}` : ''
  const message = await anthropic.messages.create({
    model: BRIEF_MODEL,
    max_tokens: BRIEF_MAX_TOKENS,
    system: BRIEF_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Revisá este caso antes de armar la propuesta.\n\n${buildCaseBlock(ctx)}${guidelines}${instructions}\n\nDevolvé solo el JSON.` }],
  }, { timeout: 120_000 })
  logTokens('salesProposalBrief', userId, message.usage, workspaceId).catch(() => {})

  const textBlock = message.content.find(b => b.type === 'text')
  const raw = extractJson(textBlock?.text || '')
  if (!raw) {
    const err = new Error('No se pudo analizar el caso. Podés generar la propuesta directamente.')
    err.status = 502
    err.code = 'PROPOSAL_BRIEF_INVALID_OUTPUT'
    throw err
  }
  return { brief: normalizeBrief(raw), usage: message.usage }
}

module.exports = { generateProposalDoc, generateProposalBrief, buildPrompt, buildCaseBlock }
