// Recordatorio de "registrá en qué estás trabajando" (mcp/workReminder.js) y la tool
// compuesta task_working_on (mcp/toolCatalog.js), incluido cómo viaja el recordatorio
// en la respuesta de una tool (mcp/server.js runTool).
jest.mock('../../src/lib/prisma', () => ({
  mcpToken:  { findUnique: jest.fn() },
  task:      { count: jest.fn(), findMany: jest.fn() },
  workspace: { findUnique: jest.fn() },
}))
jest.mock('../../src/mcp/apiBridge', () => ({ callApi: jest.fn() }))

const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js')
const prisma = require('../../src/lib/prisma')
const { callApi } = require('../../src/mcp/apiBridge')
const { maybeWorkReminder, _nextCheckAt } = require('../../src/mcp/workReminder')
const { buildServer } = require('../../src/mcp/server')
const { tools } = require('../../src/mcp/toolCatalog')

const IDENTITY = { userId: 5, workspaceId: 1, workspaceSlug: 'bliss', tokenId: 7 }
const NOW = Date.parse('2026-10-23T14:00:00Z')

beforeEach(() => {
  jest.clearAllMocks()
  _nextCheckAt.clear()
  prisma.mcpToken.findUnique.mockResolvedValue({ workReminderMins: 30 })
  prisma.workspace.findUnique.mockResolvedValue({ timezone: 'America/Argentina/Buenos_Aires' })
  prisma.task.count.mockResolvedValue(0)
  prisma.task.findMany.mockResolvedValue([])
})

describe('maybeWorkReminder', () => {
  it('sin tarea en curso, recuerda y lista lo planificado para hoy', async () => {
    prisma.task.findMany.mockResolvedValue([
      { id: 12, description: 'Posteos de noviembre', status: 'PENDING', project: { name: 'Pastiza' } },
      { id: 13, description: 'Informe SEO', status: 'PAUSED', project: { name: 'Bliss' } },
    ])
    // 1ª count: en curso (0); 2ª: total de planificadas
    prisma.task.count.mockResolvedValueOnce(0).mockResolvedValueOnce(5)

    const text = await maybeWorkReminder(IDENTITY, null, NOW)

    expect(text).toContain('No tenés ninguna tarea en curso')
    expect(text).toContain('#12 Posteos de noviembre (Pastiza)')
    expect(text).toContain('#13 Informe SEO (Bliss) — pausada')
    expect(text).toContain('y 3 más')
    expect(text).toContain('`task_working_on`')
    // Planificadas: solo de este agente (o de "cualquiera"), de hoy o antes, fuera del Backlog
    const where = prisma.task.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ userId: 5, isAgentTask: true, isBacklog: false, OR: [{ agentId: 7 }, { agentId: null }] })
  })

  it('con una tarea en curso no recuerda nada', async () => {
    prisma.task.count.mockResolvedValue(1)
    expect(await maybeWorkReminder(IDENTITY, null, NOW)).toBeNull()
    expect(prisma.task.findMany).not.toHaveBeenCalled()
  })

  it('con nombre declarado, mira las en curso de ese agente', async () => {
    prisma.task.count.mockResolvedValue(1)
    await maybeWorkReminder(IDENTITY, 'Ventas', NOW)
    expect(prisma.task.count.mock.calls[0][0].where).toMatchObject({ agentId: 7, status: 'IN_PROGRESS', agentName: 'Ventas' })
  })

  it('como mucho una vez por intervalo, y por agente (token + nombre)', async () => {
    expect(await maybeWorkReminder(IDENTITY, null, NOW)).not.toBeNull()
    expect(await maybeWorkReminder(IDENTITY, null, NOW + 29 * 60 * 1000)).toBeNull()
    // Otro agente que comparte el token tiene su propio intervalo
    expect(await maybeWorkReminder(IDENTITY, 'SEO', NOW + 60 * 1000)).not.toBeNull()
    expect(await maybeWorkReminder(IDENTITY, null, NOW + 31 * 60 * 1000)).not.toBeNull()
  })

  it('con el recordatorio apagado (0) no consulta las tareas', async () => {
    prisma.mcpToken.findUnique.mockResolvedValue({ workReminderMins: 0 })
    expect(await maybeWorkReminder(IDENTITY, null, NOW)).toBeNull()
    expect(prisma.task.count).not.toHaveBeenCalled()
  })

  it('un error no rompe nada: devuelve null', async () => {
    prisma.task.count.mockRejectedValue(new Error('db caída'))
    jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(await maybeWorkReminder(IDENTITY, null, NOW)).toBeNull()
  })
})

describe('respuesta de una tool', () => {
  let client
  beforeEach(async () => {
    callApi.mockResolvedValue({ status: 200, data: { ok: true } })
    const server = buildServer(IDENTITY)
    const [clientT, serverT] = InMemoryTransport.createLinkedPair()
    await server.connect(serverT)
    client = new Client({ name: 'test', version: '1.0.0' })
    await client.connect(clientT)
  })
  afterEach(() => client.close())

  it('suma el recordatorio como un bloque aparte, después del resultado', async () => {
    const res = await client.callTool({ name: 'list_projects', arguments: {} })
    expect(res.content).toHaveLength(2)
    expect(JSON.parse(res.content[0].text)).toEqual({ ok: true })
    expect(res.content[1].text).toContain('Recordatorio de BlissTracker')
  })

  it('si la tool falló, no recuerda', async () => {
    callApi.mockResolvedValue({ status: 403, data: { error: 'no' } })
    const res = await client.callTool({ name: 'list_projects', arguments: {} })
    expect(res.isError).toBe(true)
    expect(res.content).toHaveLength(1)
  })
})

describe('task_working_on', () => {
  const tool = tools.find(t => t.name === 'task_working_on')
  const call = jest.fn()

  it('con taskId: prepara la tarea y hace el paso que corresponde', async () => {
    call
      .mockResolvedValueOnce({ status: 200, data: { next: 'resume', broughtToToday: true, tookOverFromPerson: false } })
      .mockResolvedValueOnce({ status: 200, data: { id: 12, status: 'IN_PROGRESS' } })

    const res = await tool.run({ taskId: 12 }, call)

    expect(call.mock.calls).toEqual([['PATCH', '/tasks/12/working-on'], ['PATCH', '/tasks/12/resume']])
    expect(res.data).toEqual({ id: 12, status: 'IN_PROGRESS', broughtToToday: true, tookOverFromPerson: false })
  })

  it('con taskId ya en curso no hace nada más', async () => {
    call.mockReset().mockResolvedValueOnce({ status: 200, data: { next: 'none', task: { id: 12 } } })
    await tool.run({ taskId: 12 }, call)
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('si preparar falla, devuelve ese error', async () => {
    call.mockReset().mockResolvedValueOnce({ status: 409, data: { error: 'La persona está trabajando en esa tarea' } })
    const res = await tool.run({ taskId: 12 }, call)
    expect(res.status).toBe(409)
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('algo nuevo: crea la tarea de agente y la inicia', async () => {
    call.mockReset()
      .mockResolvedValueOnce({ status: 201, data: { id: 40 } })
      .mockResolvedValueOnce({ status: 200, data: { id: 40, status: 'IN_PROGRESS' } })

    await tool.run({ description: 'Redactar posteos', projectId: 3 }, call)

    expect(call.mock.calls).toEqual([
      ['POST', '/tasks', { body: { description: 'Redactar posteos', projectId: 3, executor: 'agent' } }],
      ['PATCH', '/tasks/40/start'],
    ])
  })

  it('sin taskId ni description+projectId devuelve 400 sin llamar a la API', async () => {
    call.mockReset()
    const res = await tool.run({ description: 'algo' }, call)
    expect(res.status).toBe(400)
    expect(call).not.toHaveBeenCalled()
  })
})
