const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js')
const { tools } = require('./toolCatalog')
const { callApi } = require('./apiBridge')

// Quita keys undefined antes de mandarlas como query/body — evita que axios/Express
// terminen viendo "undefined" literal para args opcionales que el cliente no mandó.
function clean(obj) {
  if (!obj) return obj
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}

function buildServer() {
  const server = new McpServer({ name: 'blisstracker-mcp', version: '1.0.0' })

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args) => {
        try {
          const { method, path, query, body } = tool.request(args || {})
          const { status, data } = await callApi(method, path, { query: clean(query), body: clean(body) })
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

// Modo stateless (sin sessionId): una instancia nueva de server+transport por
// request, como recomienda el SDK para este caso (ver streamableHttp.d.ts) —
// no necesitamos streams/resumabilidad para llamadas simples de tools.
async function handleMcpRequest(req, res) {
  const server = buildServer()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => {
    transport.close()
    server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
}

module.exports = { handleMcpRequest }
