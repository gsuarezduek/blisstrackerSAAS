// "Preguntale a tus datos" — una pregunta en castellano sobre el GA4 del proyecto.
//
// La IA NO contesta de memoria ni estima: elige una consulta del catálogo
// (`lib/ga4QueryCatalog.js`), el backend la valida y la corre contra GA4, y
// recién con las filas en la mano escribe la respuesta. Por eso la respuesta
// viaja siempre junto a `steps` (la consulta y la tabla que la originó): lo que
// se muestra en pantalla es verificable, y si la IA se equivoca al redactar, el
// número de abajo la desmiente.
//
// Qué garantiza que esto no sea "la IA pega a Google con lo que se le ocurra":
//   - el `property` sale de la integración del proyecto, nunca del modelo;
//   - dimensiones, métricas, filtros, orden y límite se reconstruyen desde la
//     lista blanca (una query inválida vuelve como error al modelo, no a Google);
//   - el presupuesto de tokens del workspace se chequea en cada llamada
//     (`createMessage`), así una pregunta en loop no se come la cuota.
const { createMessage } = require('../lib/claude')
const { todayString }   = require('../utils/dates')
const { validateGa4Query, buildCatalogPrompt } = require('../lib/ga4QueryCatalog')
const { runCustomReport } = require('./googleAnalytics.service')

const MODEL      = 'claude-haiku-4-5-20251001'
const MAX_STEPS  = 3      // consultas encadenadas por pregunta (una comparación necesita 2)
const MAX_TOKENS = 1200

const TOOLS = [{
  name: 'consultar_ga4',
  description:
    'Consulta los datos de Google Analytics 4 del sitio de este proyecto. Devuelve filas reales. ' +
    'Usala SIEMPRE antes de dar cualquier número: no estimes ni inventes. ' +
    'Si necesitás comparar dos períodos, hacé una consulta por período.',
  input_schema: {
    type: 'object',
    properties: {
      metrics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Métricas a traer (claves exactas del catálogo). Máximo 4.',
      },
      dimensions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Cómo desglosar el resultado (claves exactas del catálogo). Vacío = total del período. Máximo 3.',
      },
      startDate: { type: 'string', description: 'Inicio: "YYYY-MM-DD", "NdaysAgo", "yesterday" o "today".' },
      endDate:   { type: 'string', description: 'Fin: "YYYY-MM-DD", "NdaysAgo", "yesterday" o "today".' },
      filters: {
        type: 'array',
        description: 'Filtros por dimensión, combinados con AND. Máximo 3.',
        items: {
          type: 'object',
          properties: {
            dimension: { type: 'string' },
            operator:  { type: 'string', enum: ['exact', 'contains', 'beginsWith', 'endsWith'] },
            values:    { type: 'array', items: { type: 'string' } },
          },
          required: ['dimension', 'values'],
        },
      },
      orderBy: {
        type: 'object',
        description: 'Orden del resultado. Por métrica para un "top N", por dimensión temporal para una serie.',
        properties: {
          metric:    { type: 'string' },
          dimension: { type: 'string' },
          desc:      { type: 'boolean' },
        },
      },
      limit: { type: 'number', description: 'Máximo de filas (default 10, tope 100).' },
    },
    required: ['metrics', 'startDate', 'endDate'],
  },
}]

function buildSystemPrompt(project, today) {
  const [y, m, d] = today.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  return `Sos un analista de datos web. Respondés preguntas sobre el Google Analytics del sitio "${project.websiteUrl || project.name}" (proyecto "${project.name}").

HOY es ${today}. El mes en curso lleva ${d} de ${daysInMonth} días: si lo comparás con un mes cerrado, aclarás que está incompleto o comparás los mismos días de los dos meses. Nunca presentes un mes en curso como si hubiera terminado.

${buildCatalogPrompt()}

REGLAS:
1. Todo número sale de la herramienta consultar_ga4. Si no la corriste, no tenés el dato: no lo estimes.
2. Si la pregunta no se puede responder con estas dimensiones y métricas, decilo en una línea y ofrecé la pregunta más parecida que SÍ podés responder.
3. "Visitas" = sesiones. "Eventos clave" = conversions. "Usuarios" = activeUsers.
4. "El último año" = los últimos 365 días, salvo que la persona pida meses calendario.
5. Si una consulta vuelve vacía puede ser que no haya datos o que la propiedad tenga la retención de datos en 2 meses (Google la limita por configuración): mencionalo como posible causa cuando el período es largo.
6. Respondé en castellano rioplatense, en 1 a 4 oraciones, con el número primero y el período al lado. Números con separador de miles. Sin markdown, sin títulos, sin listas largas.
7. No repitas la tabla entera: la pantalla ya la muestra abajo de tu respuesta.`
}

/** Filas con nombre de columna, para que el modelo lea la tabla sin adivinar el orden. */
function shapeForModel(query, report) {
  const dims = report.headers.dimensions
  const mets = report.headers.metrics
  return {
    periodo: { desde: query.startDate, hasta: query.endDate },
    filtros: query.filters.length ? query.filters : undefined,
    total:   report.totals ? Object.fromEntries(mets.map((m, i) => [m, report.totals[i]])) : undefined,
    filas:   report.rows.map(r => ({
      ...Object.fromEntries(dims.map((d, i) => [d, r.dimensions[i]])),
      ...Object.fromEntries(mets.map((m, i) => [m, r.metrics[i]])),
    })),
    filasDevueltas: report.rows.length,
    filasTotales:   report.rowCount,
    recortado:      report.rowCount > report.rows.length ? true : undefined,
  }
}

const textOf = msg => (msg.content ?? [])
  .filter(c => c.type === 'text')
  .map(c => c.text.trim())
  .join('\n')
  .trim()

/**
 * @param {object} args
 * @param {object} args.integration  — ProjectIntegration de google_analytics
 * @param {object} args.project      — { name, websiteUrl }
 * @param {string} args.question
 * @param {number} args.workspaceId
 * @param {number} [args.userId]
 * @param {string} [args.timezone]
 * @returns {Promise<{ answer: string, steps: Array, truncated: boolean }>}
 */
async function askAnalytics({ integration, project, question, workspaceId, userId = null, timezone }) {
  const today    = todayString(timezone)
  const system   = buildSystemPrompt(project, today)
  const messages = [{ role: 'user', content: question }]
  const steps    = []

  for (let step = 0; step < MAX_STEPS; step++) {
    const msg = await createMessage(
      { model: MODEL, max_tokens: MAX_TOKENS, system, tools: TOOLS, messages },
      { workspaceId, source: 'analyticsAsk', userId },
    )

    if (msg.stop_reason !== 'tool_use') {
      return { answer: textOf(msg), steps, truncated: false }
    }

    messages.push({ role: 'assistant', content: msg.content })

    const toolResults = []
    for (const block of msg.content.filter(c => c.type === 'tool_use')) {
      const validated = validateGa4Query(block.input)
      if (!validated.ok) {
        // El error vuelve al modelo (no al usuario): corrige la consulta y reintenta.
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, is_error: true, content: validated.error })
        continue
      }
      try {
        const report = await runCustomReport(integration, validated.query)
        steps.push({ query: validated.query, headers: report.headers, rows: report.rows, totals: report.totals, rowCount: report.rowCount })
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(shapeForModel(validated.query, report)) })
      } catch (err) {
        // Token vencido o sin permiso sobre la propiedad: no es algo que el modelo
        // pueda arreglar reintentando — corta y lo maneja el controller.
        if (err?.code === 'TOKEN_EXPIRED' || err?.code === 7 || /PERMISSION_DENIED|UNAUTHENTICATED|invalid_grant/.test(err?.message ?? '')) throw err
        console.warn('[analyticsAsk] consulta a GA4 falló:', err.message)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, is_error: true, content: `GA4 rechazó la consulta: ${err.message}` })
      }
    }
    messages.push({ role: 'user', content: toolResults })
  }

  // Se agotaron los pasos: pedimos el cierre sin herramientas en vez de devolver nada.
  const final = await createMessage(
    { model: MODEL, max_tokens: MAX_TOKENS, system, messages: [...messages, { role: 'user', content: 'Respondé ahora con lo que ya consultaste, sin pedir más datos.' }] },
    { workspaceId, source: 'analyticsAsk', userId },
  )
  return { answer: textOf(final), steps, truncated: true }
}

module.exports = { askAnalytics, MAX_STEPS }
