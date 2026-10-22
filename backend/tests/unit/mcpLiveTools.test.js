jest.mock('../../src/mcp/apiBridge', () => ({ callApi: jest.fn() }))

const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js')
const { callApi } = require('../../src/mcp/apiBridge')
const { buildServer } = require('../../src/mcp/server')
const { tools } = require('../../src/mcp/toolCatalog')

// bliss_tools / bliss_run: para clientes con la lista de tools guardada de un
// deploy anterior (ver mcp/liveTools.js).
const IDENTITY = { userId: 5, workspaceSlug: 'bliss', tokenId: 7 }
let client

beforeEach(async () => {
  callApi.mockReset().mockResolvedValue({ status: 200, data: { ok: true } })
  const server = buildServer(IDENTITY)
  const [clientT, serverT] = InMemoryTransport.createLinkedPair()
  await server.connect(serverT)
  client = new Client({ name: 'test', version: '1.0.0' })
  await client.connect(clientT)
})

afterEach(() => client.close())

const call = (name, args) => client.callTool({ name, arguments: args })
const text = res => res.content[0].text

describe('bliss_tools', () => {
  it('sin argumentos lista todas las tools del catálogo, por sección', async () => {
    const res = await call('bliss_tools', {})
    expect(res.isError).toBeFalsy()
    expect(text(res)).toContain(`lista en vivo: ${tools.length}`)
    expect(text(res)).toContain('## Tareas y jornada')
    expect(tools.map(t => t.name).filter(n => !text(res).includes(`\`${n}\``))).toEqual([])
  })

  it('query filtra la lista', async () => {
    const res = await call('bliss_tools', { query: 'whatsapp' })
    expect(text(res)).toContain('`whatsapp_message_send`')
    expect(text(res)).not.toContain('`task_comment`')
  })

  it('tool muestra descripción y parámetros', async () => {
    const res = await call('bliss_tools', { tool: 'task_comment' })
    expect(text(res)).toContain('## task_comment')
    expect(text(res)).toContain('"taskId"')
    expect(text(res)).toContain('"required"')
  })

  it('tool inexistente → error con parecidas', async () => {
    const res = await call('bliss_tools', { tool: 'task_coment' })
    expect(res.isError).toBe(true)
    expect(text(res)).toContain('`task_comment`')
  })
})

describe('bliss_run', () => {
  it('ejecuta la tool igual que llamarla directo', async () => {
    const res = await call('bliss_run', { tool: 'task_comment', args: { taskId: 12, text: 'Listo' }, agentName: 'Ventas' })
    expect(res.isError).toBeFalsy()
    expect(callApi).toHaveBeenCalledWith(IDENTITY, 'POST', '/tasks/12/comments', { query: undefined, body: { text: 'Listo' }, agentName: 'Ventas' })

    callApi.mockClear()
    await call('task_comment', { taskId: 12, text: 'Listo', agentName: 'Ventas' })
    expect(callApi).toHaveBeenCalledWith(IDENTITY, 'POST', '/tasks/12/comments', { query: undefined, body: { text: 'Listo' }, agentName: 'Ventas' })
  })

  it('acepta args como string JSON y agentName dentro de args', async () => {
    await call('bliss_run', { tool: 'task_comment', args: JSON.stringify({ taskId: 3, text: 'x', agentName: 'SEO' }) })
    expect(callApi).toHaveBeenCalledWith(IDENTITY, 'POST', '/tasks/3/comments', expect.objectContaining({ agentName: 'SEO' }))
  })

  it('args inválidos → error con los parámetros, sin llamar a la API', async () => {
    const res = await call('bliss_run', { tool: 'task_comment', args: { taskId: 'doce' } })
    expect(res.isError).toBe(true)
    expect(text(res)).toContain('taskId')
    expect(text(res)).toContain('text')
    expect(callApi).not.toHaveBeenCalled()
  })

  it('un parámetro que la tool no tiene → error (no se ignora en silencio)', async () => {
    const res = await call('bliss_run', { tool: 'task_comment', args: { taskId: 1, text: 'x', comentario: 'y' } })
    expect(res.isError).toBe(true)
    expect(text(res)).toContain('comentario')
    expect(callApi).not.toHaveBeenCalled()
  })

  it('tool inexistente → error que sugiere bliss_tools', async () => {
    const res = await call('bliss_run', { tool: 'borrar_todo', args: {} })
    expect(res.isError).toBe(true)
    expect(text(res)).toContain('bliss_tools')
    expect(callApi).not.toHaveBeenCalled()
  })

  it('un error de la API se devuelve como error de la tool', async () => {
    callApi.mockResolvedValue({ status: 403, data: { error: 'Sin permiso' } })
    const res = await call('bliss_run', { tool: 'task_comment', args: { taskId: 1, text: 'x' } })
    expect(res.isError).toBe(true)
    expect(text(res)).toContain('Error 403')
  })
})
