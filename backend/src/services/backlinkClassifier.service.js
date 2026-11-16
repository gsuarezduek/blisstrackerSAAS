const prisma = require('../lib/prisma')
const { createMessage, hasTokenBudget } = require('../lib/claude')
const { parseLooseJson } = require('../lib/jsonRepair')
const { extractDomain } = require('./serpApi.service')
const { VERDICTS, parseCompetitors } = require('../lib/backlinks')

// Cuántos dominios entran en UN prompt. 25 es el punto donde el modelo todavía
// razona cada fila en vez de etiquetarlas en serie, y la respuesta entra holgada
// en max_tokens. De 100 de una, las últimas vuelven con razones genéricas.
const BATCH_SIZE = 25

// Tope por corrida: 6 llamadas. Clasificar es a pedido y gasta tokens del
// workspace, así que el tope existe para que un export de 2.000 dominios no se
// coma el presupuesto del mes en un click.
const MAX_PROSPECTS_PER_RUN = 150

// El veredicto es una etiqueta corta más una oración: no hace falta más.
const MAX_TOKENS = 2000

const MODEL = 'claude-haiku-4-5-20251001'

// Un job por proyecto a la vez, en memoria del proceso (mismo criterio que el
// verificador y que los locks de los crons).
const running = new Map()

/**
 * Los dominios que la IA todavía no evaluó.
 *
 * Dos filtros que no son negociables: `alreadyLinked: false` (lo que ya
 * conseguimos no se evalúa — la pregunta "¿podemos conseguirlo?" ya tiene
 * respuesta) y `verdictLockedAt: null` (lo corregido a mano no se vuelve a tocar).
 * Sin `rerun` se agrega `verdict: 'sin_evaluar'`; con `rerun: true` la IA rehace
 * SU PROPIA opinión anterior, pero el candado sigue en el where.
 */
function candidateWhere({ projectId, workspaceId, rerun = false }) {
  const where = { projectId, workspaceId, alreadyLinked: false, verdictLockedAt: null }
  if (!rerun) where.verdict = 'sin_evaluar'
  return where
}

/**
 * El prompt de un lote.
 *
 * Lo que decide la calidad del veredicto es el contexto de QUIÉN pregunta: el
 * mismo medio es conseguible para una agencia con prensa y no para un e-commerce
 * nuevo. De ahí el nombre del proyecto, su dominio y el brief de SEO/SEM.
 *
 * El dominio propio va explícito para que el modelo no proponga conseguir un
 * enlace de nuestro propio sitio, que es el error más fácil cuando una fila del
 * export de un competidor resulta ser nuestra.
 */
function buildClassifyPrompt({ items, projectName, ownDomain, briefText }) {
  const rows = items.map((p, i) => {
    const comps = parseCompetitors(p.competitors).map(c => c.domain).join(', ')
    const bits = [
      `DR ${p.domainRating ?? 's/d'}`,
      `tráfico ${p.traffic ?? 's/d'}`,
      `${p.linksToCompetitors || 0} página(s) enlazando a competidores`,
    ]
    if (comps) bits.push(`enlaza a: ${comps}`)
    if (p.exampleAnchor) bits.push(`anchor de ejemplo: «${p.exampleAnchor}»`)
    if (p.language) bits.push(`idioma ${p.language}`)
    return `${i + 1}. ${p.domain} — ${bits.join(' · ')}`
  }).join('\n')

  return `Sos un especialista en link building. Estás evaluando sitios que enlazan a los competidores de "${projectName}"${ownDomain ? ` (nuestro sitio es ${ownDomain})` : ''} para decidir, sitio por sitio, si vale la pena intentar conseguir un enlace.
${briefText ? `\nContexto del cliente:\n${briefText}\n` : ''}
Sitios a evaluar:
${rows}

Para cada uno elegí UNO de estos veredictos:
- "conseguible": hay un camino realista para conseguir un enlace (acepta guest posts, es un directorio abierto, es prensa que cubre el rubro, un foro o comunidad donde participar).
- "no_conseguible": no hay forma realista (medio que sólo enlaza a sus anunciantes, sitio de la competencia directa, institución cerrada, enlace que claramente se compró o se heredó).
- "no_vale_la_pena": se podría conseguir, pero no aporta (dominio sin autoridad ni tráfico, granja de enlaces, directorio basura, idioma o país que no es el mercado del cliente).

Reglas:
- Usá SOLO los dominios de la lista, con la grafía exacta con la que están escritos. No inventes ninguno.
- La razón es UNA oración concreta sobre ESE sitio, no una frase genérica.
- Si no tenés con qué decidir, elegí "no_vale_la_pena" y decí que falta información.

Respondé SOLO con un JSON válido, sin markdown:
{ "verdicts": [ { "domain": "ejemplo.com", "verdict": "conseguible", "reason": "una oración" } ] }`
}

/**
 * Lo que de la respuesta de la IA se puede escribir.
 *
 * Tres filtros, y los tres existen porque un modelo que alucina un dominio o un
 * veredicto escribiría una decisión sobre una fila que nadie pidió evaluar:
 *  1. El dominio tiene que estar EN ESTE LOTE (`allowed`), igual que el `Set`
 *     `valid` de `suggestInternalLinks`.
 *  2. El veredicto tiene que estar en el enum, y `ya_lo_tenemos` NO está: es un
 *     hecho del cruce automático, no una opinión que la IA pueda emitir.
 *  3. Un dominio repetido en la respuesta se toma una sola vez (el primero).
 *
 * Lo que no pasa se descarta en silencio: el job reporta cuántos veredictos
 * entraron de verdad, que es el número honesto.
 */
function parseClassification(rawText, allowedDomains) {
  const allowed = new Set([...allowedDomains].map(d => String(d).toLowerCase()))
  let parsed
  try {
    parsed = parseLooseJson(rawText)
  } catch {
    return []
  }

  const seen = new Set()
  const out = []
  for (const row of parsed?.verdicts || []) {
    const domain = String(row?.domain || '').trim().toLowerCase().replace(/^www\./, '')
    if (!allowed.has(domain) || seen.has(domain)) continue
    // `sin_evaluar` tampoco: pedirle a la IA que diga "no sé" y escribirlo sería
    // gastar tokens para dejar la fila como estaba.
    if (!VERDICTS.includes(row?.verdict) || row.verdict === 'sin_evaluar') continue
    seen.add(domain)
    out.push({
      domain,
      verdict: row.verdict,
      reason:  typeof row.reason === 'string' ? row.reason.trim().slice(0, 300) || null : null,
    })
  }
  return out
}

/** Las respuestas del brief de SEO/SEM que sirven para decidir, si están cargadas. */
async function loadBriefContext(projectId) {
  try {
    const brief = await prisma.projectBrief.findUnique({
      where:  { projectId_type: { projectId, type: 'seo_sem' } },
      select: { answers: true },
    })
    if (!brief?.answers) return null
    const text = Object.values(brief.answers)
      .filter(v => typeof v === 'string' && v.trim())
      .join(' · ')
      .slice(0, 1200)
    return text || null
  } catch { return null }
}

async function setStep(jobId, step) {
  await prisma.backlinkJob.update({ where: { id: jobId }, data: { errorMsg: step } }).catch(() => {})
}

/**
 * Escribe un veredicto de la IA. **Compare-and-set, no `update` por id.**
 *
 * El candado va en el WHERE y no en una lectura previa porque el job tarda
 * minutos: si alguien corrige esa fila a mano mientras la corrida está en curso,
 * la escritura tiene que ser un no-op y no un pisotón silencioso. `updateMany`
 * devuelve `count`, así que el job puede reportar cuántos veredictos entraron de
 * verdad en vez de cuántos propuso el modelo.
 */
async function applyVerdict({ projectId, workspaceId, item, verdict, reason }) {
  const { count } = await prisma.backlinkProspect.updateMany({
    where: {
      id: item.id, projectId, workspaceId,
      verdictLockedAt: null,
      // También se re-chequea el hecho: si entre el armado del lote y la escritura
      // alguien cargó el enlace, la fila ya no es una oportunidad a evaluar.
      alreadyLinked: false,
    },
    data: {
      verdict,
      verdictReason: reason,
      verdictSource: 'ai',
      verdictAt:     new Date(),
    },
  })
  return count
}

async function runClassification(jobId, workspaceId, projectId, { rerun = false } = {}) {
  running.set(projectId, jobId)
  try {
    await prisma.backlinkJob.update({
      where: { id: jobId },
      data:  { status: 'running', errorMsg: 'Buscando dominios sin evaluar…' },
    })

    // El gate de presupuesto va ANTES de la primera llamada: sin esto el job
    // quedaría a medias con un 429 crudo del wrapper. Cada llamada igual pasa por
    // `createMessage`, que corta si el workspace cruza el límite en el batch 3 de
    // 6 — así no se gastan los 6.
    if (!(await hasTokenBudget(workspaceId))) {
      await prisma.backlinkJob.update({
        where: { id: jobId },
        data:  { status: 'failed', errorMsg: 'Límite mensual de tokens de IA alcanzado.' },
      })
      return
    }

    const [project, items] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true, websiteUrl: true } }),
      prisma.backlinkProspect.findMany({
        where:   candidateWhere({ projectId, workspaceId, rerun }),
        select:  { id: true, domain: true, competitors: true, linksToCompetitors: true, domainRating: true, traffic: true, exampleAnchor: true, language: true },
        orderBy: [{ linksToCompetitors: 'desc' }, { domainRating: 'desc' }],
        take:    MAX_PROSPECTS_PER_RUN,
      }),
    ])

    if (!items.length) {
      await prisma.backlinkJob.update({
        where: { id: jobId },
        data:  { status: 'completed', checked: 0, changed: 0, errorMsg: null },
      })
      return
    }

    const briefText = await loadBriefContext(projectId)
    const ownDomain = extractDomain(project?.websiteUrl)

    let checked = 0, changed = 0, tokensUsed = 0
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE)
      await setStep(jobId, `Evaluando ${i + 1}-${i + batch.length} de ${items.length}…`)

      const msg = await createMessage({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        messages:   [{ role: 'user', content: buildClassifyPrompt({ items: batch, projectName: project?.name || 'el cliente', ownDomain, briefText }) }],
      }, { workspaceId, source: 'backlinkClassify' })

      tokensUsed += (msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0)
      checked += batch.length

      const verdicts = parseClassification(msg.content?.[0]?.text || '', batch.map(p => p.domain))
      const byDomain = new Map(batch.map(p => [p.domain, p]))
      for (const v of verdicts) {
        const item = byDomain.get(v.domain)
        if (!item) continue
        changed += await applyVerdict({ projectId, workspaceId, item, verdict: v.verdict, reason: v.reason })
      }
    }

    await prisma.backlinkJob.update({
      where: { id: jobId },
      data:  { status: 'completed', checked, changed, tokensUsed, errorMsg: null },
    })
  } catch (err) {
    console.error('[backlinkClassifier] corrida fallida:', err.message)
    await prisma.backlinkJob.update({
      where: { id: jobId },
      data:  { status: 'failed', errorMsg: failureMessage(err) },
    }).catch(() => {})
  } finally {
    running.delete(projectId)
  }
}

/**
 * El motivo de la falla, en el idioma de quien mira la pantalla.
 *
 * Sin esto el `errorMsg` del job es el cuerpo crudo del error de Anthropic
 * (`401 {"type":"error",...,"invalid x-api-key"}`), que no le dice nada a la
 * persona que apretó el botón y encima suena a que hizo algo mal. Los tres casos
 * que se distinguen son los que tienen una acción distinta detrás:
 *
 *  - **Presupuesto propio** (`TOKEN_BUDGET_EXCEEDED`): el workspace gastó su cupo
 *    del mes. Se resuelve subiéndolo en SuperAdmin. Mismo mensaje que el gate de
 *    arranque, porque para quien mira es la misma cosa.
 *  - **Key inválida o sin permiso** (401/403): es una mala configuración DEL
 *    SERVIDOR, no del workspace, y nadie dentro de la app puede arreglarla.
 *  - **Rate limit o sobrecarga del proveedor** (429 de Anthropic, 5xx, 529): se
 *    reintenta solo más tarde. **No es lo mismo que el presupuesto propio**, y
 *    confundirlos mandaba a alguien a revisar su cupo por un problema de Anthropic.
 */
function failureMessage(err) {
  if (err?.code === 'TOKEN_BUDGET_EXCEEDED') return 'Límite mensual de tokens de IA alcanzado.'
  if (err?.status === 401 || err?.status === 403) {
    return 'La API key de IA de este servidor no es válida. Avisale al equipo de BlissTracker: no se puede arreglar desde acá.'
  }
  if (err?.status === 429 || err?.status === 529 || (err?.status >= 500 && err?.status < 600)) {
    return 'El servicio de IA está sobrecargado o rechazó el pedido por volumen. Probá de nuevo en unos minutos.'
  }
  return String(err?.message || 'Error inesperado').slice(0, 500)
}

/**
 * Arranca una clasificación. Devuelve `{ jobId }` o `{ skipped, reason }`.
 *
 * **No tiene cooldown por tiempo, a diferencia del verificador**: ahí el cooldown
 * existe porque hace tráfico a sitios de terceros con nuestro nombre, y acá lo que
 * se gasta es presupuesto propio, que ya tiene su propio gate. Lo único que se
 * impide es que corran dos a la vez sobre el mismo proyecto.
 *
 * **Nunca entra al cron**: el gasto de IA lo dispara una persona o un agente.
 */
async function startClassification({ projectId, workspaceId, rerun = false }) {
  if (running.has(projectId)) {
    return { skipped: true, reason: 'running', jobId: running.get(projectId) }
  }

  const pending = await prisma.backlinkProspect.count({ where: candidateWhere({ projectId, workspaceId, rerun }) })
  if (!pending) return { skipped: true, reason: 'no_prospects' }

  const job = await prisma.backlinkJob.create({
    data: { workspaceId, projectId, kind: 'classify', status: 'pending' },
  })
  setImmediate(() => runClassification(job.id, workspaceId, projectId, { rerun }))
  return { jobId: job.id, pending: Math.min(pending, MAX_PROSPECTS_PER_RUN) }
}

module.exports = {
  startClassification,
  failureMessage,
  runClassification,
  buildClassifyPrompt,
  parseClassification,
  candidateWhere,
  BATCH_SIZE,
  MAX_PROSPECTS_PER_RUN,
  MODEL,
}
