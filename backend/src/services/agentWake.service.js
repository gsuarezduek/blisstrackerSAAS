const axios = require('axios')
const prisma = require('../lib/prisma')
const { decrypt } = require('../lib/encryption')
const { INSTRUCTIONS, buildGuide, GUIDE_TOPICS } = require('../mcp/guide')
const { tools: toolCatalog } = require('../mcp/toolCatalog')
const { describeTools, prepareRun, paramsSchema } = require('../mcp/liveTools')
const { callApi } = require('../mcp/apiBridge')
const { createdNewsWhere, inboxNewsWhere } = require('../lib/agentNews')

// El despertador: invocar al agente desde el backend cuando hay una novedad para él.
//
// Es el único de los tres canales que realmente lo "despierta". Los otros dos dependen
// de que alguien lo invoque (el nudge de `mcp/newsNudge.js`) o de que tenga un proceso
// propio escuchando (el webhook de `agentWebhook.service.js`).
//
// **Lo que hay que saber antes de usarlo:** el agente que corre acá NO es el de
// grok.com. Es un Grok nuevo, por API, sin la configuración, las instrucciones ni la
// memoria que tenga el del chat: lo único que trae es `INSTRUCTIONS` + la guía + las
// tools, igual que un cliente MCP recién conectado. Y los tokens los paga la API key del
// workspace (`Workspace.agentWakeApiKey`), no nuestro presupuesto de Anthropic, así que
// no pasa por `lib/tokenBudget.js`.
//
// Corre con la MISMA identidad que el agente (su `McpToken`), así que hereda sus
// permisos reales y todo lo que haga queda atribuido a él (`createdByAgentId`,
// `TaskComment.agentId`, etc.) — exactamente como si lo hubiera hecho desde el chat.

const API_URL = 'https://api.x.ai/v1/chat/completions'
const DEFAULT_MODEL = 'grok-4'
const MAX_STEPS = 8           // tool calls encadenadas por despertar
const STEP_TIMEOUT_MS = 60000
// Un despertar cada 5 min por agente, como mucho: cada uno gasta tokens de la API key
// del workspace, y varias novedades seguidas (destrabar + comentar) son un solo trabajo.
const WAKE_COOLDOWN_MS = 5 * 60 * 1000
const nextWakeAt = new Map() // tokenId → timestamp

// Las tools que se le pasan al modelo. No las 168 del catálogo: el payload sería enorme
// y el despertar se trata siempre de lo mismo (retomar una tarea, comentarla, dejar un
// archivo). Para todo lo demás está `bliss_run`, que ejecuta cualquier tool del catálogo
// por nombre — con eso no pierde capacidad y el prompt queda chico.
const WAKE_TOOL_RE = /^(task_|tasks_|project_file|project_files|list_projects$|whoami$|team_list$)/

// Tools que no están en el catálogo (las registra a mano server.js). Se resuelven acá
// sin pasar por la API: mismo comportamiento que tendría un cliente MCP.
const SYNTHETIC = {
  bliss_guide: {
    description: 'LEER PRIMERO. Guía de uso de BlissTracker para agentes: permisos, reglas del negocio, flujos recomendados y qué no está disponible por MCP.',
    parameters: {
      type: 'object',
      properties: { topic: { type: 'string', enum: [...GUIDE_TOPICS], description: 'Una sección puntual; omitido = guía completa' } },
    },
    run: ({ topic } = {}) => buildGuide(toolCatalog, topic),
  },
  bliss_tools: {
    description: 'Catálogo en vivo de todas las tools de BlissTracker. `query` filtra; `tool` devuelve los parámetros de una. Las que no tengas acá se ejecutan con `bliss_run`.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' }, tool: { type: 'string' } },
    },
    run: (args = {}) => {
      const r = describeTools(toolCatalog, args)
      return r.error || r.text
    },
  },
}

function toolDefs() {
  const fromCatalog = toolCatalog
    .filter(t => WAKE_TOOL_RE.test(t.name))
    .map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: paramsSchema(t) } }))
  const synthetic = Object.entries(SYNTHETIC)
    .map(([name, s]) => ({ type: 'function', function: { name, description: s.description, parameters: s.parameters } }))
  // bliss_run se declara a mano: su `args` es un objeto libre (el schema de la tool
  // destino lo valida `prepareRun`, igual que en el MCP real).
  const run = {
    type: 'function',
    function: {
      name: 'bliss_run',
      description: 'Ejecuta cualquier tool de BlissTracker por nombre (ver `bliss_tools`). Usala para todo lo que no esté entre tus tools.',
      parameters: {
        type: 'object',
        properties: {
          tool: { type: 'string', description: 'Nombre exacto de la tool' },
          args: { type: 'object', description: 'Parámetros de esa tool', additionalProperties: true },
        },
        required: ['tool'],
      },
    },
  }
  return [...synthetic, run, ...fromCatalog]
}

// Ejecuta una tool call del modelo. Devuelve siempre texto (lo que el modelo ve como
// resultado), también en el error: un fallo de una tool es información para él, no una
// excepción que corte el despertar.
async function execToolCall(identity, agentName, name, rawArgs) {
  let args = rawArgs
  if (typeof args === 'string') {
    try { args = args.trim() ? JSON.parse(args) : {} } catch { return 'Error: `arguments` no es un JSON válido.' }
  }
  args = args && typeof args === 'object' ? args : {}

  if (SYNTHETIC[name]) {
    try { return String(await SYNTHETIC[name].run(args)) } catch (e) { return `Error: ${e.message}` }
  }

  // bliss_run y las del catálogo pasan por la misma validación que en el MCP real.
  const target = name === 'bliss_run' ? args.tool : name
  const targetArgs = name === 'bliss_run' ? args.args : args
  const prepared = prepareRun(toolCatalog, target, targetArgs)
  if (prepared.error) return `Error: ${prepared.error}`

  try {
    const effectiveName = prepared.agentName ?? agentName
    let result
    if (prepared.tool.run) {
      const call = (method, path, opts = {}) => callApi(identity, method, path, { ...opts, agentName: effectiveName })
      result = await prepared.tool.run(prepared.args, call)
    } else {
      const { method, path, query, body } = prepared.tool.request(prepared.args)
      result = await callApi(identity, method, path, { query, body, agentName: effectiveName })
    }
    const text = JSON.stringify(result.data, null, 2)
    return result.status >= 400 ? `Error ${result.status}: ${text}` : text
  } catch (err) {
    return `Error: ${err.message}`
  }
}

// El mensaje con el que se lo despierta: qué pasó y qué se espera de él.
async function buildWakeMessage(identity, agentName) {
  const base = { agentId: identity.tokenId, declaredName: agentName, userId: identity.userId, workspaceId: identity.workspaceId }
  const include = {
    project: { select: { name: true } },
    user: { select: { name: true } },
    comments: { orderBy: { createdAt: 'desc' }, take: 3, select: { content: true, agentId: true, user: { select: { name: true } } } },
  }
  const [inbox, created] = await Promise.all([
    prisma.task.findMany({ where: inboxNewsWhere(base), orderBy: { agentUpdateAt: 'asc' }, take: 5, include }),
    prisma.task.findMany({ where: createdNewsWhere(base), orderBy: { completedAt: 'asc' }, take: 5, include }),
  ])
  if (!inbox.length && !created.length) return null

  const lines = ['Te despertamos porque hay novedades tuyas en BlissTracker.', '']
  for (const t of inbox) {
    const what = t.agentUpdateKind === 'comment' ? 'te comentaron' : 'te destrabaron la tarea'
    lines.push(`- Tarea #${t.id} «${t.description}»${t.project?.name ? ` (proyecto: ${t.project.name})` : ''}: ${what}. Estado actual: ${t.status}.`)
    for (const c of t.comments.slice().reverse()) {
      lines.push(`    · ${c.agentId ? 'vos (agente)' : c.user?.name || 'alguien'}: "${c.content}"`)
    }
  }
  for (const t of created) {
    lines.push(`- Tarea #${t.id} «${t.description}»: la completó ${t.user?.name || 'alguien'}.`)
  }
  lines.push(
    '',
    'Qué se espera de vos:',
    '1. Llamá a `tasks_agent_updates` para ver el detalle y marcar las novedades como vistas.',
    '2. Si te destrabaron una tarea, retomala (`task_resume`) y seguí el trabajo hasta completarla (`task_complete`) o, si lo que te contestaron no alcanza, volvé a bloquearla (`task_block`) preguntando concretamente lo que falta.',
    '3. Si te comentaron una indicación, aplicala.',
    'Nadie va a leer tu respuesta final en un chat: lo que quieras dejar asentado va como comentario de la tarea (`task_comment`) o como archivo adjunto (`task_attach_file`).',
  )
  return lines.join('\n')
}

async function chat({ apiKey, model, messages, tools }) {
  const res = await axios.post(
    API_URL,
    { model, messages, tools, tool_choice: 'auto' },
    { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: STEP_TIMEOUT_MS, validateStatus: () => true },
  )
  if (res.status >= 400) {
    const detail = typeof res.data === 'object' ? JSON.stringify(res.data).slice(0, 200) : String(res.data).slice(0, 200)
    throw Object.assign(new Error(`API del proveedor ${res.status}: ${detail}`), { apiStatus: res.status })
  }
  return res.data?.choices?.[0]?.message
}

// Despierta a UN agente. Best-effort: nunca lanza (lo llama el flujo de una request HTTP
// del usuario, que no tiene que esperarlo ni fallar por esto). Devuelve el estado para
// los tests.
async function wakeAgent({ token, workspaceSlug, apiKey, model }) {
  const identity = { userId: token.userId, workspaceId: token.workspaceId, workspaceSlug, tokenId: token.id }
  const agentName = null // el nombre declarado es del chat; acá el agente es el token
  let status = 'error'
  try {
    const wakeMessage = await buildWakeMessage(identity, agentName)
    if (!wakeMessage) return 'sin-novedades'

    const tools = toolDefs()
    const messages = [
      { role: 'system', content: INSTRUCTIONS },
      { role: 'user', content: wakeMessage },
    ]

    let steps = 0
    for (; steps < MAX_STEPS; steps++) {
      const msg = await chat({ apiKey, model, messages, tools })
      if (!msg) { status = 'respuesta vacía del proveedor'; return status }
      messages.push(msg)
      const calls = msg.tool_calls || []
      if (!calls.length) break
      for (const c of calls) {
        const out = await execToolCall(identity, agentName, c.function?.name, c.function?.arguments)
        messages.push({ role: 'tool', tool_call_id: c.id, content: out.slice(0, 20000) })
      }
    }
    status = steps >= MAX_STEPS ? `tope de ${MAX_STEPS} pasos` : 'ok'
    return status
  } catch (err) {
    status = `error: ${err.message}`.slice(0, 160)
    return status
  } finally {
    prisma.mcpToken
      .update({ where: { id: token.id }, data: { wakeLastAt: new Date(), wakeLastStatus: status } })
      .catch(() => {})
  }
}

// ¿Se puede despertar a este agente ahora? Resuelve la config del workspace y el
// cooldown. Devuelve { ok } o { ok: false, reason } (reason queda en wakeLastStatus para
// que Preferencias muestre por qué no salió).
async function resolveWake(token) {
  if (!token?.wakeEnabled) return { ok: false }
  const now = Date.now()
  if (now < (nextWakeAt.get(token.id) ?? 0)) return { ok: false, reason: 'en cooldown' }

  const ws = await prisma.workspace.findUnique({
    where: { id: token.workspaceId },
    select: { slug: true, agentWakeApiKey: true, agentWakeModel: true },
  })
  if (!ws?.agentWakeApiKey) return { ok: false, reason: 'falta la API key del proveedor (Preferencias → Agentes IA)' }

  let apiKey
  try {
    apiKey = decrypt(ws.agentWakeApiKey)
  } catch {
    return { ok: false, reason: 'la API key guardada no se pudo descifrar' }
  }
  nextWakeAt.set(token.id, now + WAKE_COOLDOWN_MS)
  return { ok: true, workspaceSlug: ws.slug, apiKey, model: ws.agentWakeModel || DEFAULT_MODEL }
}

async function maybeWakeAgent(token) {
  try {
    const r = await resolveWake(token)
    if (!r.ok) {
      if (r.reason) {
        await prisma.mcpToken
          .update({ where: { id: token.id }, data: { wakeLastAt: new Date(), wakeLastStatus: r.reason } })
          .catch(() => {})
      }
      return r.reason ?? 'apagado'
    }
    return await wakeAgent({ token, workspaceSlug: r.workspaceSlug, apiKey: r.apiKey, model: r.model })
  } catch (err) {
    console.error('[agentWake] Error despertando al agente:', err.message)
    return `error: ${err.message}`
  }
}

module.exports = { maybeWakeAgent, wakeAgent, toolDefs, buildWakeMessage, DEFAULT_MODEL, _nextWakeAt: nextWakeAt }
