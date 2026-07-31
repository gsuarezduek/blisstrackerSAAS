const axios   = require('axios')
const cheerio = require('cheerio')
const prisma  = require('../lib/prisma')
const { anthropic } = require('../lib/claude')
const { logTokens } = require('../lib/logTokens')
const { hasTokenBudget } = require('../lib/tokenBudget')
const { assertPublicUrl } = require('../lib/safeUrl')

const MODEL = 'claude-haiku-4-5-20251001'

// Descarga el sitio de la empresa (best-effort) y extrae texto plano acotado para
// darle contexto real a la IA. Si no hay sitio o falla, la IA trabaja solo con el nombre.
async function fetchSiteText(website) {
  if (!website) return ''
  const url = website.startsWith('http') ? website : `https://${website}`
  try {
    await assertPublicUrl(url)
    const res = await axios.get(url, {
      timeout: 15000,
      maxRedirects: 5,
      headers: { 'User-Agent': 'BlissTrackerBot/1.0 (+https://blisstracker.app)' },
    })
    const $ = cheerio.load(res.data)
    $('script, style, noscript, svg').remove()
    const title = $('title').text().trim()
    const desc  = $('meta[name="description"]').attr('content') || ''
    const body  = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 6000)
    return [title && `Título: ${title}`, desc && `Meta: ${desc}`, body].filter(Boolean).join('\n')
  } catch {
    return ''
  }
}

const SYSTEM_PROMPT = `Sos un analista comercial de una agencia de marketing. Investigás una empresa (potencial cliente) para preparar un abordaje comercial. Respondés SIEMPRE en español, en JSON válido, sin markdown ni texto fuera del objeto. Sé concreto y accionable. Si no tenés información suficiente sobre un campo, inferí prudentemente desde el contexto disponible y marcá la incertidumbre en el propio texto. No inventes datos duros (facturación, cantidad de empleados) que no puedas sostener.`

function buildPrompt({ companyName, industry, website, notes, siteText }) {
  return `Investigá esta empresa como potencial cliente de una agencia de marketing.

Empresa: ${companyName}
${industry ? `Rubro declarado: ${industry}` : ''}
${website ? `Sitio web: ${website}` : 'Sitio web: (no informado)'}
${notes ? `Notas internas: ${notes}` : ''}

${siteText ? `Contenido extraído del sitio web:\n"""\n${siteText}\n"""` : '(No se pudo acceder al sitio web; trabajá con el nombre y el rubro.)'}

Devolvé EXCLUSIVAMENTE un JSON con esta forma exacta:
{
  "description": "2-4 frases describiendo la empresa y su propuesta de valor",
  "services": ["servicio o producto principal", "..."],
  "market": "mercado objetivo y posicionamiento aparente",
  "socialMedia": "observaciones sobre su presencia en redes sociales (o 'sin datos')",
  "website": "evaluación breve del sitio (claridad, CTA, actualidad)",
  "seo": "estado aparente de SEO (o hipótesis si no hay datos)",
  "ads": "indicios de publicidad paga (o hipótesis)",
  "needs": ["posible necesidad de marketing 1", "..."],
  "opportunities": ["oportunidad comercial concreta para la agencia 1", "..."]
}`
}

// Progreso: mientras corre, errorMsg guarda el paso actual (se limpia al completar).
async function setStep(id, step) {
  await prisma.leadResearch.update({ where: { id }, data: { errorMsg: step } })
    .catch(err => console.error('[salesResearch] setStep:', err.message))
}

/**
 * Corre la investigación IA de la empresa de un lead (async, no bloquea el response).
 * Patrón espejo de geoAudit.service.runGeoAnalysis.
 */
async function runLeadResearch(researchId, workspaceId, leadId, userId) {
  try {
    await prisma.leadResearch.update({ where: { id: researchId }, data: { status: 'running', errorMsg: 'Preparando investigación…' } })

    if (!(await hasTokenBudget(workspaceId))) {
      await prisma.leadResearch.update({ where: { id: researchId }, data: { status: 'failed', errorMsg: 'Límite mensual de tokens de IA alcanzado.' } })
      return
    }

    const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId }, include: { company: true } })
    if (!lead) {
      await prisma.leadResearch.update({ where: { id: researchId }, data: { status: 'failed', errorMsg: 'Lead no encontrado.' } })
      return
    }
    const company = lead.company

    await setStep(researchId, 'Analizando el sitio web…')
    const siteText = await fetchSiteText(company.website)

    await setStep(researchId, 'Investigando con IA (esto puede tardar unos segundos)…')
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt({
        companyName: company.name, industry: company.industry, website: company.website, notes: company.notes, siteText,
      }) }],
    })
    await logTokens('salesResearch', userId, message.usage, workspaceId)

    const raw = message.content[0].text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const result = JSON.parse(raw)

    await prisma.leadResearch.update({
      where: { id: researchId },
      data: {
        status: 'completed',
        result,
        tokensUsed: (message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0),
        errorMsg: null,
      },
    })

    // Evento en el timeline del lead (best-effort).
    await prisma.leadActivity.create({
      data: { workspaceId, leadId, userId, kind: 'event', type: 'research_run', content: 'ejecutó una investigación de la empresa con IA' },
    }).catch(() => {})
  } catch (err) {
    console.error(`[salesResearch] Error en research ${researchId}:`, err.message)
    await prisma.leadResearch.update({
      where: { id: researchId },
      data: { status: 'failed', errorMsg: err.message?.slice(0, 500) ?? 'Error desconocido' },
    }).catch(() => {})
  }
}

module.exports = { runLeadResearch }
