const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js')
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js')
const { randomUUID } = require('crypto')
const { tools } = require('./toolCatalog')
const { callApi } = require('./apiBridge')
const { INSTRUCTIONS, buildGuide, GUIDE_TOPICS } = require('./guide')
const { z } = require('zod')

// Quita keys undefined antes de mandarlas como query/body — evita que axios/Express
// terminen viendo "undefined" literal para args opcionales que el cliente no mandó.
function clean(obj) {
  if (!obj) return obj
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}

// Parámetro opcional que se le suma a TODAS las tools del catálogo: varios agentes
// de un mismo cliente (ej. Grok) pueden compartir un token, y este nombre
// autodeclarado los distingue en la app ("grokbot · Ventas"). No es verificable:
// es solo un rótulo, los permisos siguen siendo los del token.
const agentNameParam = {
  agentName: z.string().max(60).optional().describe('Tu nombre como agente, si compartís este conector con otros agentes (ej. "Ventas", "SEO"). Pasalo siempre igual en cada llamada: queda registrado junto a lo que hacés.'),
}

// identity: { userId, workspaceSlug } — resuelta por mcp/auth.js a partir del
// token de esta request puntual (tabla McpToken). Cada tool queda cerrada sobre
// ESTA identidad, no sobre una global: dos requests concurrentes de dos
// personas (o dos workspaces) nunca se pisan.
function buildServer(identity) {
  // `instructions` viaja en el handshake initialize: el cliente se lo pasa al
  // modelo apenas se conecta, sin que tenga que llamar nada (ver guide.js).
  const server = new McpServer({ name: 'blisstracker-mcp', version: '1.0.0' }, { instructions: INSTRUCTIONS })

  server.registerTool(
    'bliss_guide',
    {
      description: 'LEER PRIMERO. Guía de uso de BlissTracker para agentes: qué podés y qué no podés hacer, permisos, reglas del negocio, flujos recomendados y qué módulos no están disponibles por MCP. Sin topic devuelve la guía completa.',
      inputSchema: { topic: z.enum(GUIDE_TOPICS).optional().describe('Una sección puntual; omitido = guía completa') },
    },
    async ({ topic } = {}) => ({ content: [{ type: 'text', text: buildGuide(tools, topic) }] })
  )

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: { ...tool.inputSchema, ...agentNameParam } },
      async (args) => {
        try {
          const { agentName, ...toolArgs } = args || {}
          const { method, path, query, body } = tool.request(toolArgs)
          const { status, data } = await callApi(identity, method, path, { query: clean(query), body: clean(body), agentName })
          const text = JSON.stringify(data, null, 2)
          return status >= 400
            ? { content: [{ type: 'text', text: `Error ${status}: ${text}` }], isError: true }
            : { content: [{ type: 'text', text }] }
        } catch (err) {
          return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
        }
      }
    )
  }

  return server
}

// ── Sesiones ──────────────────────────────────────────────────────────────────
// Los clientes MCP guardan la lista de tools que reciben al conectarse. Para que
// vean las tools nuevas después de un deploy sin reconectar a mano, usamos el
// mecanismo del estándar: cada `initialize` abre una sesión (header
// Mcp-Session-Id) que vive en memoria de este proceso. Un deploy reinicia el
// proceso, las sesiones viejas dejan de existir, y el siguiente request con un
// id viejo recibe 404 → la spec obliga al cliente a reinicializar, y con eso
// vuelve a pedir tools/list. (El SDK ya declara `tools.listChanged: true`; no
// mandamos la notificación porque la lista nunca cambia dentro de un mismo
// proceso — cambia con el deploy, y ahí lo que avisa es el 404.)
// Asume una sola instancia del backend (igual que los locks de los crons): con
// varias réplicas, una sesión abierta en una daría 404 en la otra.
const SESSION_IDLE_MS = 60 * 60 * 1000
const MAX_SESSIONS = 500
const sessions = new Map() // sessionId → { transport, tokenId, lastSeen }

function closeSession(id) {
  const session = sessions.get(id)
  if (!session) return
  sessions.delete(id)
  session.transport.close().catch(() => {})
}

// Barre sesiones inactivas (los clientes rara vez mandan DELETE al irse). unref:
// no mantiene vivo el proceso (tests, shutdown).
setInterval(() => {
  const cutoff = Date.now() - SESSION_IDLE_MS
  for (const [id, session] of sessions) if (session.lastSeen < cutoff) closeSession(id)
}, 10 * 60 * 1000).unref()

function sessionNotFound(res) {
  res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null })
}

function hasInitialize(body) {
  return Array.isArray(body) ? body.some(isInitializeRequest) : isInitializeRequest(body)
}

async function startSession(req, res, identity) {
  // Map en orden de inserción: el primero es el más viejo.
  if (sessions.size >= MAX_SESSIONS) closeSession(sessions.keys().next().value)

  const server = buildServer(identity)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => sessions.set(id, { transport, tokenId: identity.tokenId, lastSeen: Date.now() }),
  })
  // Antes de connect: el Protocol del SDK encadena este onclose con el suyo.
  // Cubre el DELETE del cliente y el cierre por inactividad.
  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId)
    server.close().catch(() => {})
  }
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
}

// Sin sesión: una instancia nueva de server+transport por request (el modo de
// antes). Queda para clientes que no guardan el Mcp-Session-Id — no se cortan,
// solo no se enteran de las tools nuevas hasta reconectar.
async function handleStateless(req, res, identity) {
  const server = buildServer(identity)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => {
    transport.close()
    server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
}

async function handleMcpRequest(req, res) {
  const identity = req.mcpIdentity
  try {
    const sessionId = req.headers['mcp-session-id']
    if (sessionId) {
      const session = sessions.get(sessionId)
      // Desconocida (típicamente: hubo un deploy) o abierta con otro token → 404,
      // así no se puede usar la sesión de otra persona aunque se conozca el id.
      if (!session || session.tokenId !== identity.tokenId) return sessionNotFound(res)
      session.lastSeen = Date.now()
      return await session.transport.handleRequest(req, res, req.body)
    }
    if (req.method === 'POST' && hasInitialize(req.body)) return await startSession(req, res, identity)
    return await handleStateless(req, res, identity)
  } catch (err) {
    console.error('[mcp] error manejando request:', err)
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null })
  }
}

module.exports = { handleMcpRequest, buildServer, _sessions: sessions }
