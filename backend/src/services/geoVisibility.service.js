const prisma = require('../lib/prisma')
const { createMessage, hasTokenBudget } = require('../lib/claude')
const { parseLooseJson } = require('../lib/jsonRepair')

// Visibilidad IA (#1/#5): en vez de analizar el sitio propio (como GeoAudit), le
// pregunta a un LLM CON búsqueda web real preguntas típicas del rubro y mide si la
// marca del cliente aparece citada, en qué posición relativa a los competidores
// configurados, y qué fuentes usó para responder.
//
// La tool server-side `web_search` necesita un modelo de la familia Sonnet/Opus —
// no está disponible en Haiku (el modelo que usa el resto de GEO) — por eso esto es
// más caro por corrida y, en v1, deliberadamente manual (sin cron mensual).

const MODEL              = 'claude-sonnet-5'
const MAX_OUTPUT_TOKENS  = 4096 // mismo criterio que geoAudit tras el bug de truncamiento: de más, no de menos
const MAX_SEARCH_USES    = 5    // tope de búsquedas por pregunta — control de costo
const MAX_PAUSE_RESUMES  = 1    // el loop de búsqueda server-side se corta a los 10 pasos con stop_reason "pause_turn"; con max_uses:5 no debería llegar, pero se maneja por si acaso

async function setStep(runId, step) {
  await prisma.geoVisibilityRun.update({
    where: { id: runId },
    data:  { errorMsg: step },
  }).catch(err => console.error('[GeoVisibility] Error al actualizar paso:', err.message))
}

function buildPrompt(query, projectName, competitors) {
  const competitorList = competitors.length
    ? competitors.map(c => `- "${c.name}"${c.domain ? ` (${c.domain})` : ''}`).join('\n')
    : '(no hay competidores configurados para esta corrida)'

  return `Buscá en la web información actual y respondé esta pregunta tal como lo haría un asistente de IA real al que un usuario se la hace:

"${query}"

Después de buscar y de formular tu respuesta real, evaluá tu PROPIA respuesta (no esta instrucción) para dos cosas:

1. Si mencionaste a la marca "${projectName}" en algún punto, y en qué posición relativa a TODAS las marcas/empresas que nombraste en la respuesta (1 = la primera marca que nombraste, contando tanto "${projectName}" como cualquier otra).
2. Para cada uno de estos competidores, si lo mencionaste (con ese nombre o una variación clara del mismo) y en qué posición:
${competitorList}

Respondé SOLO con un JSON válido, sin texto antes ni después, sin markdown ni comas colgantes, con esta forma exacta:
{
  "ownMentioned": true o false,
  "ownPosition": <entero o null>,
  "competitors": [ { "name": "<nombre EXACTO tal como te lo pasé arriba>", "mentioned": true o false, "position": <entero o null> } ],
  "sources": [ { "url": "...", "title": "..." } ],
  "answerExcerpt": "<las primeras 2-3 oraciones de la respuesta REAL que le darías al usuario, en texto plano, sin el JSON>"
}

Reglas: "position" cuenta el ORDEN en que cada marca aparece mencionada en tu respuesta real (no en esta instrucción ni en la pregunta). Si una marca no aparece, su position es null y mentioned es false. No inventes menciones que no hiciste. En "sources" listá hasta 5 páginas reales que usaste para responder (las que te devolvió la búsqueda), nunca inventadas.`
}

function extractFinalText(content) {
  const textBlocks = (content || []).filter(b => b.type === 'text')
  return textBlocks.length ? textBlocks[textBlocks.length - 1].text : ''
}

// Cruza el catálogo de competidores configurado con lo que la IA dijo haber
// mencionado — por NOMBRE exacto (se lo pasamos nosotros en el prompt), así que un
// competidor que la IA no devuelve en "competitors" (o devuelve con otro nombre)
// queda simplemente como no mencionado, en vez de romper el resultado.
function matchCompetitors(parsedCompetitors, competitors) {
  return competitors.map(c => {
    const match = (parsedCompetitors || []).find(pc => pc.name === c.name)
    return { id: c.id, name: c.name, mentioned: !!match?.mentioned, position: match?.position ?? null }
  })
}

const searchTools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCH_USES }]

async function callWithSearch(prompt, workspaceId, userId) {
  let messages = [{ role: 'user', content: prompt }]
  let message = await createMessage(
    { model: MODEL, max_tokens: MAX_OUTPUT_TOKENS, tools: searchTools, messages },
    { workspaceId, source: 'geoVisibility', userId, enforceBudget: false },
  )
  let tokensUsed = (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0)

  // "pause_turn": el loop de búsqueda server-side llegó a su tope de iteraciones. Hay que
  // reenviar la conversación completa (el propio content del assistant incluido) para que el
  // servidor retome donde quedó — agregar un mensaje "continuá" no hace nada acá.
  let resumes = 0
  while (message.stop_reason === 'pause_turn' && resumes < MAX_PAUSE_RESUMES) {
    messages = [...messages, { role: 'assistant', content: message.content }]
    message = await createMessage(
      { model: MODEL, max_tokens: MAX_OUTPUT_TOKENS, tools: searchTools, messages },
      { workspaceId, source: 'geoVisibility', userId, enforceBudget: false },
    )
    tokensUsed += (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0)
    resumes++
  }

  return { text: extractFinalText(message.content), tokensUsed }
}

async function runOnePrompt(promptRow, projectName, competitors, workspaceId, userId) {
  const { text, tokensUsed } = await callWithSearch(buildPrompt(promptRow.query, projectName, competitors), workspaceId, userId)
  const parsed = parseLooseJson(text)

  const competitorsMentioned = matchCompetitors(parsed.competitors, competitors)

  return {
    tokensUsed,
    data: {
      ownMentioned:         !!parsed.ownMentioned,
      ownPosition:          Number.isInteger(parsed.ownPosition) ? parsed.ownPosition : null,
      competitorsMentioned: JSON.stringify(competitorsMentioned),
      sources:              JSON.stringify((parsed.sources || []).slice(0, 5)),
      rawAnswerExcerpt:     (parsed.answerExcerpt || '').slice(0, 800) || null,
    },
  }
}

async function runVisibilityCheck(runId, workspaceId, projectId, userId) {
  try {
    await prisma.geoVisibilityRun.update({
      where: { id: runId },
      data:  { status: 'running', errorMsg: 'Preparando preguntas…' },
    })

    if (!(await hasTokenBudget(workspaceId))) {
      await prisma.geoVisibilityRun.update({ where: { id: runId }, data: { status: 'failed', errorMsg: 'Límite mensual de tokens de IA alcanzado.' } })
      return
    }

    const [project, prompts, competitors] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
      prisma.geoVisibilityPrompt.findMany({ where: { projectId, workspaceId, active: true }, orderBy: { createdAt: 'asc' } }),
      prisma.geoVisibilityCompetitor.findMany({ where: { projectId, workspaceId }, orderBy: { createdAt: 'asc' } }),
    ])

    if (!prompts.length) {
      await prisma.geoVisibilityRun.update({ where: { id: runId }, data: { status: 'failed', errorMsg: 'No hay preguntas activas configuradas para este proyecto.' } })
      return
    }

    let totalTokens = 0
    for (let i = 0; i < prompts.length; i++) {
      const p = prompts[i]
      await setStep(runId, `Probando pregunta ${i + 1}/${prompts.length}: "${p.query.slice(0, 60)}${p.query.length > 60 ? '…' : ''}"`)
      try {
        const { tokensUsed, data } = await runOnePrompt(p, project.name, competitors, workspaceId, userId)
        totalTokens += tokensUsed
        await prisma.geoVisibilityResult.create({ data: { runId, promptId: p.id, ...data } })
      } catch (err) {
        // Un prompt puntual que falla (JSON mal formado, búsqueda sin resultados útiles, etc.)
        // no debe tirar abajo toda la corrida — sigue con el resto de las preguntas.
        console.error(`[GeoVisibility] Falló la pregunta "${p.query}" (run ${runId}):`, err.message)
      }
    }

    const resultsCount = await prisma.geoVisibilityResult.count({ where: { runId } })
    if (resultsCount === 0) {
      await prisma.geoVisibilityRun.update({
        where: { id: runId },
        data:  { status: 'failed', errorMsg: 'No se pudo obtener una respuesta válida de la IA para ninguna pregunta. Probá de nuevo.', tokensUsed: totalTokens },
      })
      return
    }

    await prisma.geoVisibilityRun.update({
      where: { id: runId },
      data:  { status: 'completed', errorMsg: null, tokensUsed: totalTokens },
    })
  } catch (err) {
    console.error(`[GeoVisibility] Error corriendo la corrida ${runId}:`, err)
    await prisma.geoVisibilityRun.update({
      where: { id: runId },
      data:  { status: 'failed', errorMsg: err.message || 'Error desconocido' },
    }).catch(() => {})
  }
}

module.exports = { runVisibilityCheck, extractFinalText, matchCompetitors, buildPrompt }
