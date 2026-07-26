const { anthropic } = require('../lib/claude')
const { logTokens } = require('../lib/logTokens')

const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = `Sos un ejecutivo comercial de una agencia de marketing que redacta propuestas para clientes. Escribís en español, con tono profesional, claro y persuasivo, orientado a resultados. Devolvés SOLO HTML de contenido (sin <html>, <head> ni <body>): usá <h2>, <h3>, <p>, <ul>, <li>, <strong>. No incluyas estilos inline ni markdown. La propuesta debe ser específica al cliente y a los servicios elegidos, no genérica.`

function formatPrice(n) {
  const num = Number(n)
  return n === '' || n == null || !Number.isFinite(num) ? null : num.toLocaleString('es-AR')
}

function planBlock(plan, i) {
  const price = formatPrice(plan.price)
  const priceLine = price ? ` — ${plan.currency || 'ARS'} ${price}/mes` : ' — (precio a definir)'
  const services = plan.services?.length
    ? plan.services.map(s => `  - ${s.name}${s.description ? `: ${s.description}` : ''}`).join('\n')
    : '  (sin servicios específicos; inferí un alcance razonable para este plan según los objetivos)'
  return `Plan "${plan.label || `Opción ${i + 1}`}"${priceLine}\nServicios incluidos:\n${services}`
}

function buildPrompt({ agencyName, companyName, industry, leadTitle, plans, objectives, guidelines, instructions }) {
  const plansList = Array.isArray(plans) && plans.length ? plans : [{ label: '', price: null, services: [] }]
  const multiplePlans = plansList.length > 1
  const plansBlock = plansList.map(planBlock).join('\n\n')

  return `Redactá una propuesta comercial en HTML para el siguiente caso.

Agencia: ${agencyName || 'nuestra agencia'}
Cliente: ${companyName}${industry ? ` (rubro: ${industry})` : ''}
${leadTitle ? `Oportunidad: ${leadTitle}` : ''}
Objetivos del cliente: ${objectives || '(no especificados; inferí objetivos razonables del rubro)'}

${plansBlock}

${guidelines ? `\nIndicaciones de la agencia (respetalas SIEMPRE):\n${guidelines}` : ''}
${instructions ? `\nInstrucciones específicas para esta propuesta:\n${instructions}` : ''}

Estructurá la propuesta con estas secciones (usá <h2> para cada una):
1. Introducción — entendimiento del cliente y su contexto.
2. Objetivos — qué buscamos lograr, alineado a lo que pidió el cliente.
3. Propuesta de servicios — qué haremos por cada servicio ofrecido, con entregables concretos. Usá las descripciones de servicio dadas arriba como base para explicarlos, sin copiarlas literalmente.
4. Inversión — presentá ${multiplePlans ? 'los planes como opciones comparables (podés usar una tabla HTML simple <table> con los servicios como filas y los planes como columnas indicando qué incluye cada uno, y el precio mensual de cada plan al pie o como fila final)' : 'el plan con su precio mensual'}. Usá los precios EXACTOS dados arriba, no los inventes ni los redondees; si un plan no tiene precio, indicá "a definir".
5. Metodología y próximos pasos — cómo arrancamos.

Devolvé solo el HTML del contenido.`
}

/**
 * Genera el HTML de una propuesta con Claude Haiku. Síncrono (on-demand): el caller
 * ya validó el presupuesto (assertTokenBudget). Devuelve { html, usage }.
 */
async function generateProposalHtml(ctx, { workspaceId, userId }) {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPrompt(ctx) }],
  })
  logTokens('salesProposal', userId, message.usage, workspaceId).catch(() => {})

  const html = message.content[0].text.trim()
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  return { html, usage: message.usage }
}

module.exports = { generateProposalHtml }
