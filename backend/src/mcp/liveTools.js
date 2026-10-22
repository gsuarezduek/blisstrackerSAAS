const { z } = require('zod')
// Mismo conversor zod → JSON Schema que usa McpServer para armar tools/list:
// los parámetros que muestra bliss_tools son exactamente los que vería el cliente.
const { toJsonSchemaCompat } = require('@modelcontextprotocol/sdk/server/zod-json-schema-compat.js')
const { AREAS } = require('./guide')

// Catálogo EN VIVO para clientes con la lista de tools desactualizada. Algunos
// clientes MCP guardan la lista de tools al configurar el conector y no la
// vuelven a pedir (Grok la guarda por URL: ni reconectar la refresca). Con
// bliss_tools (describe el catálogo de este deploy) + bliss_run (ejecuta
// cualquier tool por nombre), una tool nueva se puede usar apenas se deploya,
// sin tocar la configuración del conector. bliss_run pasa por el mismo handler
// que las tools registradas (ver server.js), así que valida y ejecuta igual.

// Fin de la primera oración, sin cortar en abreviaturas ("ej. Grok").
const SENTENCE_END = /(?<!\b(?:ej|etc|vs|p))\.\s/

function firstSentence(text) {
  const end = text.search(SENTENCE_END)
  const sentence = end === -1 ? text : text.slice(0, end + 1)
  return sentence.length > 180 ? `${sentence.slice(0, 177)}...` : sentence
}

function paramsSchema(tool) {
  const schema = toJsonSchemaCompat(z.object(tool.inputSchema), { strictUnions: true, pipeStrategy: 'input' })
  delete schema.$schema
  return schema
}

// Tools cuyo nombre comparte algún segmento con el pedido (ej. "task_coment" →
// task_comment, task_comments_list), para orientar al agente si le erró al nombre.
function suggestions(tools, name) {
  const parts = String(name).toLowerCase().split(/[^a-z0-9]+/).filter(p => p.length >= 3)
  return tools.map(t => t.name).filter(n => parts.some(p => n.includes(p))).slice(0, 8)
}

function unknownToolText(tools, name) {
  const similar = suggestions(tools, name)
  return [
    `No existe la tool "${name}".`,
    similar.length ? `Parecidas: ${similar.map(n => `\`${n}\``).join(', ')}.` : '',
    'Usá `bliss_tools` para ver la lista actual.',
  ].filter(Boolean).join(' ')
}

function detailText(tool) {
  return [
    `## ${tool.name}`,
    tool.description,
    `Parámetros (JSON Schema):\n\`\`\`json\n${JSON.stringify(paramsSchema(tool), null, 2)}\n\`\`\``,
    `Si \`${tool.name}\` no está entre tus tools, ejecutala con \`bliss_run\`: { "tool": "${tool.name}", "args": { ... } }`,
  ].join('\n\n')
}

// { tool } → detalle de una tool; si no, índice por sección (filtrado por `query`).
function describeTools(tools, { tool, query } = {}) {
  if (tool) {
    const found = tools.find(t => t.name === tool)
    return found ? { text: detailText(found) } : { error: unknownToolText(tools, tool) }
  }

  const q = query?.trim().toLowerCase()
  const matching = q ? tools.filter(t => `${t.name} ${t.description}`.toLowerCase().includes(q)) : tools
  if (!matching.length) return { text: `Ninguna tool coincide con "${query}". Probá con otra palabra o sin \`query\`.` }

  const groups = AREAS.map(a => ({ label: a.label, tools: matching.filter(t => a.match(t.name)) }))
  const grouped = new Set(groups.flatMap(g => g.tools))
  groups.push({ label: 'Otras', tools: matching.filter(t => !grouped.has(t)) })

  const header = `# Tools de BlissTracker (lista en vivo: ${matching.length}${q ? ` de ${tools.length}` : ''})\n\n` +
    'Tu lista de tools puede estar desactualizada. Si una de estas no está entre las tuyas, ejecutala con `bliss_run`. ' +
    'Para ver los parámetros de una, llamá a `bliss_tools` con `tool: "<nombre>"`.'
  const body = groups
    .filter(g => g.tools.length)
    .map(g => `## ${g.label}\n${g.tools.map(t => `- \`${t.name}\` — ${firstSentence(t.description)}`).join('\n')}`)
  return { text: [header, ...body].join('\n\n') }
}

function formatIssues(error) {
  return error.issues.map(i => `- ${i.path.join('.') || '(args)'}: ${i.message}`).join('\n')
}

// Valida `args` contra el schema de la tool. args puede venir como objeto o
// como string JSON (algunos modelos lo mandan serializado). Devuelve
// { tool, args, agentName } listo para ejecutar, o { error }.
function prepareRun(tools, name, rawArgs) {
  const tool = tools.find(t => t.name === name)
  if (!tool) return { error: unknownToolText(tools, name) }

  let args = rawArgs ?? {}
  if (typeof args === 'string') {
    try {
      args = args.trim() ? JSON.parse(args) : {}
    } catch {
      return { error: `\`args\` no es un JSON válido. Mandalo como objeto, ej. { "taskId": 123 }.` }
    }
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { error: '`args` tiene que ser un objeto con los parámetros de la tool.' }
  }

  // agentName es común a todas las tools: se acepta dentro de args también.
  const { agentName, ...toolArgs } = args
  // strict: un parámetro mal escrito da error en vez de ignorarse en silencio.
  const parsed = z.object(tool.inputSchema).strict().safeParse(toolArgs)
  if (!parsed.success) {
    return {
      error: `Argumentos inválidos para \`${name}\`:\n${formatIssues(parsed.error)}\n\nParámetros:\n${JSON.stringify(paramsSchema(tool), null, 2)}`,
    }
  }
  return { tool, args: parsed.data, agentName }
}

module.exports = { describeTools, prepareRun }
