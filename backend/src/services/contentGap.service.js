const axios     = require('axios')
const cheerio   = require('cheerio')
const prisma    = require('../lib/prisma')
const { logTokens } = require('../lib/logTokens')
const { gscCountryToSerp, extractDomain, fetchSerpData, parseSerpResponse } = require('./serpApi.service')

const { anthropic } = require('../lib/claude')

const MAX_COMPETITORS = 4
const UA = 'BlissTrackerBot/1.0 (+https://blisstracker.app)'

// Extrae la estructura de contenido (título + encabezados + longitud) de una página.
async function extractStructure(url) {
  const res = await axios.get(url, { timeout: 15000, maxRedirects: 5, headers: { 'User-Agent': UA }, validateStatus: s => s < 400 })
  const $ = cheerio.load(res.data)
  const title = $('title').first().text().trim()
  const headings = []
  $('h1, h2, h3').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim()
    if (text) headings.push({ level: Number(el.tagName.slice(1)), text: text.slice(0, 120) })
  })
  $('script, style, noscript, template').remove()
  const wordCount = ($('body').text().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)).length
  return { url, title, headings: headings.slice(0, 40), wordCount }
}

async function setStep(gapId, step) {
  await prisma.contentGap.update({ where: { id: gapId }, data: { errorMsg: step } })
    .catch(err => console.error('[ContentGap] Error al actualizar paso:', err.message))
}

async function runContentGapAnalysis(gapId, workspaceId, projectId, keyword, userId) {
  try {
    await prisma.contentGap.update({ where: { id: gapId }, data: { status: 'running', errorMsg: 'Consultando el SERP…' } })

    if (!process.env.SERP_API_KEY) throw new Error('SERP_API_KEY no configurada. El análisis de competidores requiere SerpAPI.')

    const [project, gsc] = await Promise.all([
      prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { name: true, websiteUrl: true } }),
      prisma.projectIntegration.findUnique({ where: { projectId_type: { projectId, type: 'google_search_console' } }, select: { country: true } }),
    ])
    if (!project) throw new Error('Proyecto no encontrado')

    const country   = gscCountryToSerp(gsc?.country || 'arg')
    const ownDomain = project.websiteUrl ? extractDomain(project.websiteUrl) : null
    const raw       = await fetchSerpData(keyword, country)
    const serp      = parseSerpResponse(raw, ownDomain)

    const competitorUrls = serp.competitors.slice(0, MAX_COMPETITORS)
    if (competitorUrls.length === 0) throw new Error('No se encontraron competidores en el SERP para esta keyword.')

    // ── Crawl: página propia (si rankea) + competidores ──
    await setStep(gapId, 'Analizando el contenido que rankea…')
    let own = null
    if (serp.resultUrl) {
      try { own = await extractStructure(serp.resultUrl) } catch (err) { console.error('[ContentGap] No se pudo leer la página propia:', err.message) }
    }
    const competitors = []
    for (const c of competitorUrls) {
      try {
        const s = await extractStructure(c.url)
        competitors.push({ domain: c.domain, url: c.url, title: s.title, position: c.position, wordCount: s.wordCount, headings: s.headings })
      } catch (err) { console.error(`[ContentGap] No se pudo leer ${c.url}:`, err.message) }
    }
    if (competitors.length === 0) throw new Error('No se pudo leer el contenido de ningún competidor.')

    // ── Presupuesto de IA ──
    const { hasTokenBudget } = require('../lib/tokenBudget')
    if (!(await hasTokenBudget(workspaceId))) throw new Error('Límite mensual de tokens de IA alcanzado.')

    // ── Prompt ──
    await setStep(gapId, 'Detectando brechas de contenido con IA…')
    const ownBlock = own
      ? `NUESTRA PÁGINA (${own.url}) — ${own.wordCount} palabras\nEncabezados:\n${own.headings.map(h => `  H${h.level}: ${h.text}`).join('\n') || '  (sin encabezados)'}`
      : `NO tenemos ninguna página rankeando para esta keyword todavía.`
    const compBlock = competitors.map((c, i) =>
      `COMPETIDOR ${i + 1} — ${c.domain} (pos ${c.position}, ${c.wordCount} palabras)\n${c.headings.map(h => `  H${h.level}: ${h.text}`).join('\n')}`
    ).join('\n\n')

    const prompt = `Sos un estratega de contenidos SEO. Analizá la brecha de contenido ("content gap") para la keyword "${keyword}" del proyecto "${project.name}".

${ownBlock}

CONTENIDO DE LOS COMPETIDORES QUE RANKEAN EN EL TOP:
${compBlock}

Identificá qué temas, secciones, preguntas o entidades cubren los competidores (sobre todo si lo hacen varios) que a nuestra página le faltan o trata pobremente. Enfocate en brechas accionables que, si las cubrimos, mejorarían el posicionamiento. No inventes; basate en los encabezados provistos.

Respondé SOLO con un JSON válido, sin markdown:
{
  "resumen": "2-3 oraciones sobre la brecha principal y qué hacer",
  "gaps": [ { "tema": "tema/sección faltante", "tipo": "seccion|entidad|pregunta", "descripcion": "qué cubren los competidores y por qué importa (1 oración)", "prioridad": "alta|media|baja" } ],
  "headingsSuggested": ["H2 o H3 sugerido para agregar a nuestra página", "..."]
}`

    const res = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      messages:   [{ role: 'user', content: prompt }],
    })
    await logTokens('contentGap', userId, res.usage, workspaceId)

    let parsed = { resumen: '', gaps: [], headingsSuggested: [] }
    try {
      const rawText = res.content[0].text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      parsed = JSON.parse(rawText)
    } catch { /* si no devolvió JSON válido guardamos vacío */ }

    await setStep(gapId, 'Guardando…')
    await prisma.contentGap.update({
      where: { id: gapId },
      data: {
        status:            'completed',
        ownUrl:            own?.url ?? serp.resultUrl ?? null,
        ownPosition:       serp.position ?? null,
        competitors:       JSON.stringify(competitors.map(c => ({ domain: c.domain, url: c.url, title: c.title, position: c.position, wordCount: c.wordCount, headingsCount: c.headings.length }))),
        gaps:              JSON.stringify(parsed.gaps ?? []),
        headingsSuggested: JSON.stringify(parsed.headingsSuggested ?? []),
        summary:           parsed.resumen ?? null,
        tokensUsed:        (res.usage.input_tokens ?? 0) + (res.usage.output_tokens ?? 0),
        errorMsg:          null,
      },
    })
  } catch (err) {
    console.error(`[ContentGap] Error en gap ${gapId}:`, err.message)
    await prisma.contentGap.update({
      where: { id: gapId },
      data:  { status: 'failed', errorMsg: err.message?.slice(0, 500) ?? 'Error desconocido' },
    }).catch(e => console.error('[ContentGap] Error al marcar como fallido:', e.message))
  }
}

module.exports = { runContentGapAnalysis }
