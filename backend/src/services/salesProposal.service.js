const { anthropic } = require('../lib/claude')
const { logTokens } = require('../lib/logTokens')

const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = `Sos un ejecutivo comercial de una agencia de marketing que redacta propuestas para clientes. Escribís en español, con tono profesional, claro y persuasivo, orientado a resultados. Devolvés SOLO HTML de contenido (sin <html>, <head> ni <body>): usá <h2>, <h3>, <p>, <ul>, <li>, <strong>. No incluyas estilos inline ni markdown. La propuesta debe ser específica al cliente y a los servicios elegidos, no genérica.`

function buildPrompt({ agencyName, companyName, industry, leadTitle, serviceNames, objectives, estimatedValue, currency, guidelines, instructions }) {
  return `Redactá una propuesta comercial en HTML para el siguiente caso.

Agencia: ${agencyName || 'nuestra agencia'}
Cliente: ${companyName}${industry ? ` (rubro: ${industry})` : ''}
${leadTitle ? `Oportunidad: ${leadTitle}` : ''}
Servicios a proponer: ${serviceNames.length ? serviceNames.join(', ') : '(a definir según objetivos)'}
Objetivos del cliente: ${objectives || '(no especificados; inferí objetivos razonables del rubro)'}
${estimatedValue ? `Presupuesto de referencia: ${currency || 'USD'} ${estimatedValue}` : ''}
${guidelines ? `\nIndicaciones de la agencia (respetalas SIEMPRE):\n${guidelines}` : ''}
${instructions ? `\nInstrucciones específicas para esta propuesta:\n${instructions}` : ''}

Estructurá la propuesta con estas secciones (usá <h2> para cada una):
1. Introducción — entendimiento del cliente y su contexto.
2. Objetivos — qué buscamos lograr, alineado a lo que pidió el cliente.
3. Propuesta de servicios — qué haremos por cada servicio elegido, con entregables concretos.
4. Metodología y próximos pasos — cómo arrancamos.
${estimatedValue ? '5. Inversión — presentá el presupuesto de referencia de forma profesional.' : ''}

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
