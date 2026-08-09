const { anthropic } = require('../lib/claude')
const { logTokens } = require('../lib/logTokens')

// Sonnet (no Haiku): es texto de cara al cliente (primer contacto, antes de la propuesta),
// mismo criterio que salesProposal.service — vale más la redacción que ahorrar tokens.
const MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 4096

const SYSTEM_PROMPT = `Sos un consultor de marketing digital que preparó un diagnóstico inicial de un negocio, como primer contacto para captar el interés de su dueño/a antes de una propuesta formal. Escribís en español, en segunda persona, dirigiéndote directamente al dueño o responsable del negocio (nunca en tercera persona ni como si fuera un informe interno para la agencia). Tono: cercano, seguro y directo — como alguien que investigó de verdad y encontró algo concreto para decir, no una plantilla genérica. El objetivo es generar curiosidad y una sensación de urgencia real (oportunidades concretas que se están perdiendo), sin sonar alarmista ni a venta agresiva. Devolvés SOLO HTML de contenido (sin <html>, <head> ni <body>): usá <h2>, <h3>, <p>, <ul>, <li>, <strong>. No inventes datos duros (facturación, tráfico exacto, cantidad de empleados) que no estén en la investigación; si hay incertidumbre, planteala como hipótesis a confirmar. No firmes el documento ni agregues un cierre con nombre/cargo — eso se agrega aparte.`

function bullets(arr) {
  return Array.isArray(arr) && arr.length ? arr.map(x => `- ${x}`).join('\n') : '(sin datos)'
}

function buildPrompt({ agencyName, companyName, industry, research, instructions }) {
  const r = research || {}
  return `Escribí un informe de diagnóstico inicial en HTML para captar el interés del dueño/a de esta empresa, como paso previo a mandarle una propuesta formal.

Agencia: ${agencyName || 'nuestra agencia'}
Empresa: ${companyName}${industry ? ` (rubro: ${industry})` : ''}

Investigación previa sobre la empresa:
- Descripción: ${r.description || '(sin datos)'}
- Servicios/productos: ${bullets(r.services)}
- Mercado: ${r.market || '(sin datos)'}
- Redes sociales: ${r.socialMedia || '(sin datos)'}
- Sitio web: ${r.website || '(sin datos)'}
- SEO: ${r.seo || '(sin datos)'}
- Publicidad: ${r.ads || '(sin datos)'}
- Posibles necesidades detectadas: ${bullets(r.needs)}
- Oportunidades comerciales detectadas: ${bullets(r.opportunities)}
${instructions ? `\nIndicaciones específicas para este informe:\n${instructions}\n` : ''}
Estructurá el informe así (usá <h2> para cada sección):
1. Un título/gancho inicial breve dirigido al dueño (algo del estilo "Encontramos 3 cosas que le están costando clientes a [empresa]" — adaptalo al caso real, no lo copies literal).
2. "Lo que vimos" — 2 a 4 observaciones concretas sobre su presencia digital actual, en lenguaje simple (sin jerga técnica), basadas en los datos de arriba.
3. "Dónde hay oportunidad" — 2 a 4 oportunidades concretas de crecimiento, redactadas como beneficios tangibles para el negocio (más clientes, más ventas, mejor imagen), no como tareas técnicas.
4. Un cierre corto invitando a conversar 15-20 minutos para mostrar cómo se puede resolver, sin presionar ni sonar a venta dura.

Devolvé solo el HTML del contenido.`
}

/**
 * Genera el HTML del informe de diagnóstico con Claude Sonnet. Síncrono (on-demand): el
 * caller ya validó el presupuesto (assertTokenBudget). Devuelve { html, usage }.
 */
async function generateDiagnosticReportHtml(ctx, { workspaceId, userId }) {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPrompt(ctx) }],
  })
  logTokens('salesDiagnosticReport', userId, message.usage, workspaceId).catch(() => {})

  // Sonnet 5 piensa por defecto: el primer bloque puede ser "thinking", no el texto.
  const textBlock = message.content.find(b => b.type === 'text')
  const html = (textBlock?.text || '').trim()
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  return { html, usage: message.usage }
}

module.exports = { generateDiagnosticReportHtml }
