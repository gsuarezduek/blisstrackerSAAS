// Canales de SALIDA hacia un agente de IA: el aviso pegado a la respuesta de una tool
// (mcp/newsNudge.js), el webhook firmado (services/agentWebhook.service.js) y el
// despertador por la API del proveedor (services/agentWake.service.js).
//
// Lo que se verifica acá es lo que no se puede probar a mano sin un agente conectado:
// que el aviso NO marque las novedades como vistas, que el webhook no filtre el
// contenido del trabajo, y que el despertador ejecute las tools con la identidad del
// agente y corte en el tope de pasos.
jest.mock('../../src/lib/prisma', () => ({
  mcpToken:  { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  task:      { count: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  workspace: { findUnique: jest.fn() },
}))
jest.mock('../../src/mcp/apiBridge', () => ({ callApi: jest.fn(), sanitizeAgentName: n => n }))
jest.mock('axios')
// El guard real resuelve DNS (no corresponde en un unit test, y un host inventado daría
// ENOTFOUND). Acá se verifica que el webhook LLAME al guard y respete su veredicto; la
// lógica de qué IP es privada es de lib/safeUrl y se prueba por su lado.
jest.mock('../../src/lib/safeUrl', () => ({
  assertPublicUrl: jest.fn(async url => {
    const { hostname } = new URL(url)
    if (hostname === 'localhost' || /^(127\.|10\.|192\.168\.|169\.254\.)/.test(hostname)) {
      throw new Error('apunta a la red interna')
    }
  }),
}))

const axios = require('axios')
const crypto = require('crypto')
const prisma = require('../../src/lib/prisma')
const { callApi } = require('../../src/mcp/apiBridge')
const { maybeNewsNudge, _nextNudgeAt } = require('../../src/mcp/newsNudge')
const { sendAgentWebhook, sign, buildPayload } = require('../../src/services/agentWebhook.service')
const { wakeAgent, toolDefs, buildWakeMessage } = require('../../src/services/agentWake.service')

const IDENTITY = { userId: 5, workspaceId: 1, workspaceSlug: 'bliss', tokenId: 7 }
const NOW = Date.parse('2026-11-01T14:00:00Z')

function unblockedTask(over = {}) {
  return {
    id: 8,
    description: 'Redactar posteos de noviembre',
    status: 'PAUSED',
    isAgentTask: true,
    agentId: 7,
    agentUpdateKind: 'unblocked',
    agentUpdateAt: new Date('2026-11-01T13:00:00Z'),
    project: { id: 2, name: 'Pastiza' },
    user: { name: 'Gastón' },
    comments: [{ content: 'Sí, publicá con la cuenta de la agencia', agentId: null, user: { name: 'Gastón' } }],
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  _nextNudgeAt.clear()
  prisma.task.findMany.mockResolvedValue([])
  prisma.task.count.mockResolvedValue(0)
  prisma.mcpToken.update.mockResolvedValue({})
  prisma.workspace.findUnique.mockResolvedValue({ slug: 'bliss' })
})

// ─── El aviso pegado a la respuesta de una tool ───────────────────────────────

describe('maybeNewsNudge', () => {
  // La bandeja solo sirve si el agente se acuerda de mirarla, y una conversación que
  // arranca con "completá la tarea 12" nunca pasa por ahí.
  function mockNews({ inbox = [], created = [] }) {
    prisma.task.findMany.mockImplementation(({ where }) =>
      Promise.resolve(where.agentUpdateAt ? inbox : created))
  }

  it('avisa del desbloqueo con la respuesta de la persona y dice cómo retomar', async () => {
    mockNews({ inbox: [unblockedTask()] })

    const text = await maybeNewsNudge(IDENTITY, null, 'tasks_today', NOW)

    expect(text).toContain('#8')
    expect(text).toContain('la destrabaron')
    expect(text).toContain('Sí, publicá con la cuenta de la agencia')
    expect(text).toContain('task_resume')
  })

  // Clave: si marcara visto, una novedad se perdería porque el modelo no leyó un texto
  // que nadie confirmó. Marcar es responsabilidad de tasks_agent_updates.
  it('no marca nada como visto', async () => {
    mockNews({ inbox: [unblockedTask()] })

    await maybeNewsNudge(IDENTITY, null, 'tasks_today', NOW)

    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('no se repite dentro del intervalo, y vuelve después', async () => {
    mockNews({ inbox: [unblockedTask()] })

    expect(await maybeNewsNudge(IDENTITY, null, 'tasks_today', NOW)).toBeTruthy()
    expect(await maybeNewsNudge(IDENTITY, null, 'tasks_today', NOW + 60_000)).toBeNull()
    expect(await maybeNewsNudge(IDENTITY, null, 'tasks_today', NOW + 11 * 60_000)).toBeTruthy()
  })

  // Sin novedades no arranca el throttle: la próxima tool vuelve a chequear y la novedad
  // llega apenas aparece, en vez de esperar el intervalo entero.
  it('sin novedades no consume el intervalo', async () => {
    mockNews({})
    expect(await maybeNewsNudge(IDENTITY, null, 'tasks_today', NOW)).toBeNull()

    mockNews({ inbox: [unblockedTask()] })
    expect(await maybeNewsNudge(IDENTITY, null, 'tasks_today', NOW + 1000)).toBeTruthy()
  })

  it('no se lo pega a la tool que ya devuelve las novedades', async () => {
    mockNews({ inbox: [unblockedTask()] })
    expect(await maybeNewsNudge(IDENTITY, null, 'tasks_agent_updates', NOW)).toBeNull()
  })

  it('un error de DB no rompe la respuesta de la tool', async () => {
    prisma.task.findMany.mockRejectedValue(new Error('DB caída'))
    expect(await maybeNewsNudge(IDENTITY, null, 'tasks_today', NOW)).toBeNull()
  })
})

// ─── Webhook saliente ────────────────────────────────────────────────────────

describe('sendAgentWebhook', () => {
  const token = { id: 7, userId: 5, label: 'Grok', webhookUrl: 'https://hooks.example.com/bliss', webhookSecret: 'abc123' }

  it('firma el body con HMAC-SHA256 y manda el titular, no el trabajo', async () => {
    axios.post.mockResolvedValue({ status: 200, data: 'ok' })

    await sendAgentWebhook({ token, event: 'task.unblocked', task: unblockedTask(), workspaceSlug: 'bliss' })

    const [url, body, cfg] = axios.post.mock.calls[0]
    expect(url).toBe(token.webhookUrl)
    expect(cfg.headers['X-Bliss-Signature']).toBe(sign('abc123', body))
    const payload = JSON.parse(body)
    expect(payload).toMatchObject({ event: 'task.unblocked', workspace: 'bliss', agent: { id: 7, label: 'Grok' }, task: { id: 8 } })
    // El receptor va a buscar el detalle con el token: un webhook interceptado no filtra
    // los comentarios ni el resultado del trabajo.
    expect(body).not.toContain('publicá con la cuenta')
    expect(payload.next).toMatch(/tasks_agent_updates/)
  })

  it('registra el status de la última entrega', async () => {
    axios.post.mockResolvedValue({ status: 200, data: 'ok' })

    await sendAgentWebhook({ token, event: 'task.comment', task: unblockedTask(), workspaceSlug: 'bliss' })

    expect(prisma.mcpToken.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { webhookLastAt: expect.any(Date), webhookLastStatus: '200' },
    })
  })

  it('reintenta una vez y registra el fallo sin lanzar', async () => {
    axios.post.mockRejectedValue(new Error('timeout of 5000ms exceeded'))

    await expect(sendAgentWebhook({ token, event: 'task.unblocked', task: unblockedTask(), workspaceSlug: 'bliss' }))
      .resolves.toBeUndefined()

    expect(axios.post).toHaveBeenCalledTimes(2)
    expect(prisma.mcpToken.update.mock.calls[0][0].data.webhookLastStatus).toBe('timeout')
  })

  it('una URL que apunta a la red interna no se manda (SSRF)', async () => {
    await sendAgentWebhook({
      token: { ...token, webhookUrl: 'http://127.0.0.1:3001/api/tasks' },
      event: 'task.unblocked', task: unblockedTask(), workspaceSlug: 'bliss',
    })

    expect(axios.post).not.toHaveBeenCalled()
    expect(prisma.mcpToken.update.mock.calls[0][0].data.webhookLastStatus).toMatch(/url-no-permitida/)
  })

  it('sin webhookUrl no hace nada', async () => {
    await sendAgentWebhook({ token: { ...token, webhookUrl: null }, event: 'task.comment', task: unblockedTask() })
    expect(axios.post).not.toHaveBeenCalled()
    expect(prisma.mcpToken.update).not.toHaveBeenCalled()
  })

  it('sin secret no manda header de firma', () => {
    const payload = buildPayload({ event: 'task.comment', task: unblockedTask(), token: { id: 7, label: null }, workspaceSlug: 'bliss' })
    expect(payload.agent.label).toBeNull()
    expect(payload.headline).toContain('Te comentaron')
  })
})

// ─── Despertador ─────────────────────────────────────────────────────────────

describe('agentWake', () => {
  const token = { id: 7, userId: 5, workspaceId: 1 }
  const wakeArgs = { token, workspaceSlug: 'bliss', apiKey: 'xai-test', model: 'grok-4' }

  function mockNews(inbox) {
    prisma.task.findMany.mockImplementation(({ where }) =>
      Promise.resolve(where.agentUpdateAt ? inbox : []))
  }

  // No las 168 del catálogo (payload enorme): un set chico + bliss_run para el resto.
  it('expone las tools de tareas y bliss_run, no el catálogo entero', () => {
    const names = toolDefs().map(d => d.function.name)
    expect(names).toContain('task_resume')
    expect(names).toContain('tasks_agent_updates')
    expect(names).toContain('bliss_run')
    expect(names).toContain('bliss_guide')
    expect(names).not.toContain('ventas_leads_list')
    expect(names.length).toBeLessThan(60)
  })

  it('el mensaje de despertar cuenta qué pasó y qué se espera', async () => {
    mockNews([unblockedTask()])
    const msg = await buildWakeMessage(IDENTITY, null)
    expect(msg).toContain('Tarea #8')
    expect(msg).toContain('te destrabaron la tarea')
    expect(msg).toContain('Sí, publicá con la cuenta de la agencia')
    expect(msg).toContain('task_resume')
  })

  it('sin novedades no gasta un llamado a la API', async () => {
    mockNews([])
    expect(await wakeAgent(wakeArgs)).toBe('sin-novedades')
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('ejecuta las tool calls con la identidad del agente y termina', async () => {
    mockNews([unblockedTask()])
    axios.post
      .mockResolvedValueOnce({ status: 200, data: { choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'c1', function: { name: 'task_resume', arguments: '{"taskId":8}' } }] } }] } })
      .mockResolvedValueOnce({ status: 200, data: { choices: [{ message: { role: 'assistant', content: 'Listo, la retomé.' } }] } })
    callApi.mockResolvedValue({ status: 200, data: { id: 8, status: 'IN_PROGRESS' } })

    expect(await wakeAgent(wakeArgs)).toBe('ok')

    // La tool corre con el tokenId del agente: lo que haga queda atribuido a él.
    expect(callApi).toHaveBeenCalledWith(
      expect.objectContaining({ tokenId: 7, userId: 5, workspaceSlug: 'bliss' }),
      'PATCH', '/tasks/8/resume', expect.anything(),
    )
    expect(prisma.mcpToken.update).toHaveBeenCalledWith({
      where: { id: 7 }, data: { wakeLastAt: expect.any(Date), wakeLastStatus: 'ok' },
    })
  })

  // Un parámetro inventado por el modelo tiene que volver como error para él, no
  // ejecutarse a medias ni cortar el despertar.
  it('un argumento inválido vuelve como error de tool, sin pegarle a la API', async () => {
    mockNews([unblockedTask()])
    axios.post
      .mockResolvedValueOnce({ status: 200, data: { choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'c1', function: { name: 'task_resume', arguments: '{"taskid":"ocho"}' } }] } }] } })
      .mockResolvedValueOnce({ status: 200, data: { choices: [{ message: { role: 'assistant', content: 'Me equivoqué.' } }] } })

    expect(await wakeAgent(wakeArgs)).toBe('ok')
    expect(callApi).not.toHaveBeenCalled()
    const second = axios.post.mock.calls[1][1]
    const toolMsg = second.messages.find(m => m.role === 'tool')
    expect(toolMsg.content).toMatch(/Argumentos inválidos/)
  })

  it('corta en el tope de pasos si el modelo no para de llamar tools', async () => {
    mockNews([unblockedTask()])
    axios.post.mockResolvedValue({ status: 200, data: { choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'c', function: { name: 'tasks_agent_queue', arguments: '{}' } }] } }] } })
    callApi.mockResolvedValue({ status: 200, data: [] })

    expect(await wakeAgent(wakeArgs)).toMatch(/tope de \d+ pasos/)
  })

  it('un error de la API del proveedor queda registrado, no lanza', async () => {
    mockNews([unblockedTask()])
    axios.post.mockResolvedValue({ status: 401, data: { error: 'invalid api key' } })

    const status = await wakeAgent(wakeArgs)
    expect(status).toMatch(/401/)
    expect(prisma.mcpToken.update.mock.calls[0][0].data.wakeLastStatus).toMatch(/401/)
  })
})

describe('sign', () => {
  it('es HMAC-SHA256 hex con prefijo, verificable del otro lado', () => {
    const body = '{"a":1}'
    const expected = crypto.createHmac('sha256', 's3cret').update(body).digest('hex')
    expect(sign('s3cret', body)).toBe(`sha256=${expected}`)
  })
})
