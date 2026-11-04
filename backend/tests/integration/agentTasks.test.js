jest.mock('../../src/lib/prisma', () => {
  const m = {
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn(), findMany: jest.fn() },
  project:         { findFirst: jest.fn() },
  mcpToken:        { findFirst: jest.fn() },
  task: {
    findUnique: jest.fn(),
    findFirst:  jest.fn(),
    findMany:   jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
    updateMany: jest.fn(),
    count:      jest.fn(),
    delete:     jest.fn(),
    deleteMany: jest.fn(),
  },
  taskRecurrence: { update: jest.fn(), findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
  taskSession:    { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  workDay: {
    findUnique: jest.fn(),
    create:     jest.fn(),
  },
  calendarEventParticipant: { findUnique: jest.fn() },
  eOSTodo:            { updateMany: jest.fn() },
  projectMeetingTodo: { updateMany: jest.fn() },
  financeTask:        { updateMany: jest.fn() },
  leadAction:         { updateMany: jest.fn(), findUnique: jest.fn() },
  notification:       { create: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
  taskComment:        { create: jest.fn(), findMany: jest.fn() },
  projectMember:      { findMany: jest.fn() },
  taskFollow:         { findMany: jest.fn() },
  projectMeetingParticipant: { findUnique: jest.fn() },
  }
  // Las dos formas de $transaction: array de operaciones (lo que usa el resto de
  // tasks) y callback con el cliente transaccional (lo que usa setLoggedAt).
  m.$transaction = jest.fn(arg => (typeof arg === 'function' ? arg(m) : Promise.all(arg)))
  return m
})

// Los canales de salida (webhook / despertador) tienen su propio test unitario
// (tests/unit/agentOutboundChannels.test.js); acá solo se verifica el cable: que el
// desbloqueo y el comentario los disparen.
jest.mock('../../src/services/agentNotify.service', () => ({
  notifyAgentOfNews: jest.fn(),
  notifyAgentOfNewsInBackground: jest.fn(),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const { notifyAgentOfNewsInBackground } = require('../../src/services/agentNotify.service')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const AGENT_ID       = 7

// mcpTokenId = la request viene por MCP (claim que solo firma mcp/apiBridge.js).
function authHeader({ userId = 1, mcpTokenId, mcpAgentName } = {}) {
  const token = jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role: 'member', isSuperAdmin: false, name: 'Test', email: 't@t.com', ...(mcpTokenId ? { mcpTokenId } : {}), ...(mcpAgentName ? { mcpAgentName } : {}) },
    SECRET,
  )
  return `Bearer ${token}`
}

function mockWorkspace() {
  prisma.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss', timezone: 'America/Argentina/Buenos_Aires' })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: 'member', active: true })
}

function makeTask(overrides = {}) {
  return {
    id: 1, userId: 1, status: 'PENDING', isBacklog: false, isAgentTask: false, agentId: null,
    description: 'Tarea de prueba', projectId: 1,
    project: { id: 1, name: 'Proyecto Test' },
    createdBy: null,
    _count: { comments: 0 },
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockWorkspace()
  prisma.project.findFirst.mockResolvedValue({ id: 1, workspaceId: WORKSPACE_ID, active: true, isPrivate: false })
  prisma.workDay.findUnique.mockResolvedValue({ id: 10, userId: 1, workspaceId: WORKSPACE_ID })
  prisma.task.create.mockImplementation(({ data }) => Promise.resolve(makeTask({ ...data, id: 99 })))
  prisma.calendarEventParticipant.findUnique.mockResolvedValue(null)
})

// ─── Crear ────────────────────────────────────────────────────────────────────

describe('POST /api/tasks — agentes', () => {
  it('vía MCP con executor:agent crea una tarea de ESE agente', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ projectId: 1, description: 'Correr auditoría GEO', executor: 'agent' })

    expect(res.status).toBe(201)
    expect(prisma.task.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isAgentTask: true, agentId: AGENT_ID, createdByAgentId: AGENT_ID, userId: 1 }),
    }))
  })

  it('vía MCP sin executor crea una tarea humana marcada como creada por el agente', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ projectId: 1, description: 'Llamar al cliente' })

    expect(res.status).toBe(201)
    expect(prisma.task.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isAgentTask: false, agentId: null, createdByAgentId: AGENT_ID }),
    }))
  })

  it('desde la app (sin MCP) no marca createdByAgentId', async () => {
    await request(app)
      .post('/api/tasks')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ projectId: 1, description: 'Tarea normal' })

    expect(prisma.task.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isAgentTask: false, createdByAgentId: null }),
    }))
  })

  it('rechaza executor:agent asignado a otra persona', async () => {
    prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 2, role: 'member', active: true })
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ projectId: 1, description: 'X', executor: 'agent', targetUserId: 2 })

    expect(res.status).toBe(400)
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('rechaza un agentId que no es de la persona', async () => {
    prisma.mcpToken.findFirst.mockResolvedValue(null)
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ projectId: 1, description: 'X', executor: 'agent', agentId: 55 })

    expect(res.status).toBe(400)
    expect(prisma.mcpToken.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 55, userId: 1, workspaceId: WORKSPACE_ID, revokedAt: null }),
    }))
    expect(prisma.task.create).not.toHaveBeenCalled()
  })
})

// ─── Iniciar: la regla de "1 en curso" no aplica a agentes ───────────────────

describe('PATCH /api/tasks/:id/start — agentes', () => {
  it('una tarea de agente arranca aunque la persona tenga otra en curso, y la toma el agente que llama', async () => {
    prisma.task.findFirst.mockResolvedValueOnce(makeTask({ isAgentTask: true, agentId: null }))
    prisma.task.update.mockResolvedValue(makeTask({ status: 'IN_PROGRESS', isAgentTask: true, agentId: AGENT_ID }))

    const res = await request(app)
      .patch('/api/tasks/1/start')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    // Un solo findFirst (la resolución de la tarea, ahora scopeada por workspace) —
    // no corre assertNoActiveTask, que agregaría una segunda llamada.
    expect(prisma.task.findFirst).toHaveBeenCalledTimes(1)
    expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'IN_PROGRESS', agentId: AGENT_ID }),
    }))
  })

  it('una tarea humana sigue respetando la regla (409 si hay otra humana en curso)', async () => {
    prisma.task.findFirst.mockResolvedValueOnce(makeTask())
    prisma.task.findFirst.mockResolvedValue({ id: 2, workDay: { workspaceId: WORKSPACE_ID } })

    const res = await request(app)
      .patch('/api/tasks/1/start')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(409)
    expect(prisma.task.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 1, status: 'IN_PROGRESS', isAgentTask: false },
    }))
    expect(prisma.task.update).not.toHaveBeenCalled()
  })
})

// ─── Delegar a mi agente ──────────────────────────────────────────────────────

describe('PATCH /api/tasks/:id/agent', () => {
  it('delega una tarea pendiente a "cualquiera de mis agentes" desde la app', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask())
    prisma.task.findUnique.mockResolvedValue(makeTask({ isAgentTask: true }))

    const res = await request(app)
      .patch('/api/tasks/1/agent')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ executor: 'agent' })

    expect(res.status).toBe(200)
    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { isAgentTask: true, agentId: null, agentName: null } })
  })

  it('delega a un agente puntual propio', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask())
    prisma.mcpToken.findFirst.mockResolvedValue({ id: AGENT_ID })
    prisma.task.findUnique.mockResolvedValue(makeTask({ isAgentTask: true, agentId: AGENT_ID }))

    const res = await request(app)
      .patch('/api/tasks/1/agent')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ executor: 'agent', agentId: AGENT_ID })

    expect(res.status).toBe(200)
    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { isAgentTask: true, agentId: AGENT_ID, agentName: null } })
  })

  it('devuelve la tarea a la persona', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ isAgentTask: true, agentId: AGENT_ID }))
    prisma.task.findUnique.mockResolvedValue(makeTask())

    const res = await request(app)
      .patch('/api/tasks/1/agent')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ executor: 'user' })

    expect(res.status).toBe(200)
    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { isAgentTask: false, agentId: null, agentName: null } })
  })

  it('con scope=series actualiza la plantilla y las instancias abiertas', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ recurrenceId: 3 }))
    prisma.task.findUnique.mockResolvedValue(makeTask({ isAgentTask: true }))

    const res = await request(app)
      .patch('/api/tasks/1/agent?scope=series')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ executor: 'agent' })

    expect(res.status).toBe(200)
    expect(prisma.taskRecurrence.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { isAgentTask: true, agentId: null, agentName: null } })
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { recurrenceId: 3, status: { in: ['PENDING', 'PAUSED', 'BLOCKED'] } },
      data:  { isAgentTask: true, agentId: null, agentName: null },
    })
  })

  it('409 si la tarea está en curso', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ status: 'IN_PROGRESS' }))

    const res = await request(app)
      .patch('/api/tasks/1/agent')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ executor: 'agent' })

    expect(res.status).toBe(409)
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('404 si la tarea no es propia', async () => {
    prisma.task.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/tasks/1/agent')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ executor: 'agent' })

    expect(res.status).toBe(404)
    expect(prisma.task.findFirst).toHaveBeenCalledWith({ where: { id: 1, userId: 1, workDay: { workspaceId: WORKSPACE_ID } } })
  })
})

// ─── Lista de trabajo del agente ──────────────────────────────────────────────

describe('PATCH /api/tasks/:id/working-on', () => {
  function patch(id = 1, auth = { mcpTokenId: AGENT_ID }) {
    return request(app).patch(`/api/tasks/${id}/working-on`).set('Authorization', authHeader(auth)).set('X-Workspace', WORKSPACE_SLUG)
  }
  beforeEach(() => {
    prisma.task.update.mockImplementation(({ data }) => Promise.resolve(makeTask({ isAgentTask: true, agentId: AGENT_ID, status: 'PENDING', ...data })))
  })

  it('una tarea planificada para otro día la trae a hoy, la toma para el agente y pide iniciarla', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ isAgentTask: true, agentId: null, scheduledFor: '2099-01-05' }))

    const res = await patch()

    expect(res.status).toBe(200)
    expect(prisma.task.update.mock.calls[0][0].data).toEqual({ isAgentTask: true, agentId: AGENT_ID, scheduledFor: null, isBacklog: false, workDayId: 10 })
    expect(res.body).toMatchObject({ next: 'start', broughtToToday: true, tookOverFromPerson: false })
  })

  it('una tarea de la persona del Backlog pasa a ser del agente (con su nombre declarado)', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ isBacklog: true, status: 'PAUSED' }))
    prisma.task.update.mockImplementation(({ data }) => Promise.resolve(makeTask({ status: 'PAUSED', ...data })))

    const res = await patch(1, { mcpTokenId: AGENT_ID, mcpAgentName: 'Ventas' })

    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({ isAgentTask: true, agentId: AGENT_ID, agentName: 'Ventas', isBacklog: false })
    expect(res.body).toMatchObject({ next: 'resume', tookOverFromPerson: true })
  })

  it('ya tomada por este agente y de hoy: no toca nada y pide iniciarla', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ isAgentTask: true, agentId: AGENT_ID }))
    prisma.task.findUnique.mockResolvedValue(makeTask({ isAgentTask: true, agentId: AGENT_ID }))

    const res = await patch()

    expect(prisma.task.update).not.toHaveBeenCalled()
    expect(res.body.next).toBe('start')
  })

  it('409 si la persona la tiene en curso', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ status: 'IN_PROGRESS' }))
    expect((await patch()).status).toBe(409)
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('409 si la tiene otro agente de la persona', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ isAgentTask: true, agentId: 99 }))
    expect((await patch()).status).toBe(409)
  })

  it('400 si ya está completada, 404 si no es de la persona, 400 desde la app', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ status: 'COMPLETED' }))
    expect((await patch()).status).toBe(400)
    prisma.task.findFirst.mockResolvedValue(null)
    expect((await patch()).status).toBe(404)
    expect((await patch(1, {})).status).toBe(400)
  })
})

describe('GET /api/tasks/agent-updates', () => {
  const completedAt = new Date('2026-10-22T15:00:00Z')
  function completed(overrides = {}) {
    return makeTask({
      id: 5, status: 'COMPLETED', userId: 2, createdByAgentId: AGENT_ID,
      startedAt: new Date('2026-10-22T14:00:00Z'), completedAt, pausedMinutes: 15,
      user: { id: 2, name: 'Ana' }, agent: null,
      comments: [
        { content: 'Enviada', createdAt: completedAt, agentId: null, user: { name: 'Ana' } },
        { content: 'Arranco', createdAt: new Date('2026-10-22T14:00:00Z'), agentId: null, user: { name: 'Ana' } },
      ],
      ...overrides,
    })
  }
  // Dos consultas en paralelo: lo que el agente creó y se completó, y las novedades que
  // la persona le dejó en sus tareas (Task.agentUpdateAt). Se distinguen por el where.
  function mockSources({ created = [completed()], inbox = [] } = {}) {
    prisma.task.findMany.mockImplementation(({ where }) =>
      Promise.resolve(where.agentUpdateAt ? inbox : created))
  }
  const inboxWhere = () => prisma.task.findMany.mock.calls.find(c => c[0].where.agentUpdateAt)[0].where

  beforeEach(() => {
    mockSources()
    prisma.task.updateMany.mockResolvedValue({ count: 1 })
  })

  function get(path = '/api/tasks/agent-updates', auth = { mcpTokenId: AGENT_ID }) {
    return request(app).get(path).set('Authorization', authHeader(auth)).set('X-Workspace', WORKSPACE_SLUG)
  }

  it('devuelve lo que el agente creó y alguien completó, y lo marca como visto', async () => {
    const res = await get()

    expect(res.status).toBe(200)
    const where = prisma.task.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ createdByAgentId: AGENT_ID, status: 'COMPLETED', createdByAgentSeenAt: null, workDay: { workspaceId: WORKSPACE_ID } })
    expect(where).not.toHaveProperty('createdByAgentName')
    // Lo que ejecutó él mismo no es novedad
    expect(where.NOT).toEqual({ isAgentTask: true, agentId: AGENT_ID })
    expect(res.body.updates).toEqual([expect.objectContaining({
      taskId: 5,
      completedBy: { id: 2, name: 'Ana' },
      executedByAgent: false,
      workedMinutes: 45,
      // En orden cronológico
      recentComments: [expect.objectContaining({ content: 'Arranco' }), expect.objectContaining({ content: 'Enviada', author: 'Ana', viaAgent: false })],
    })])
    expect(res.body.hasMore).toBe(false)
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [5] }, createdByAgentSeenAt: null },
      data: { createdByAgentSeenAt: expect.any(Date) },
    })
  })

  it('con agentName declarado, solo lo que creó con ese nombre', async () => {
    await get(undefined, { mcpTokenId: AGENT_ID, mcpAgentName: 'Ventas' })
    const where = prisma.task.findMany.mock.calls[0][0].where
    expect(where.createdByAgentName).toBe('Ventas')
    expect(where.NOT).toEqual({ isAgentTask: true, agentId: AGENT_ID, agentName: 'Ventas' })
  })

  it('markSeen=false solo lee', async () => {
    const res = await get('/api/tasks/agent-updates?markSeen=false')
    expect(res.body.updates).toHaveLength(1)
    expect(prisma.task.updateMany).not.toHaveBeenCalled()
  })

  it('desde la app (sin agente) devuelve 400', async () => {
    const res = await get(undefined, {})
    expect(res.status).toBe(400)
    expect(prisma.task.findMany).not.toHaveBeenCalled()
  })

  // Lo que la persona le deja desde la app (destrabar / comentar) es la otra mitad de la
  // bandeja: sin esto el desbloqueo no llega nunca al agente.
  it('trae el desbloqueo que la persona le dejó, con el estado de la tarea y el comentario', async () => {
    const at = new Date('2026-10-23T10:00:00Z')
    mockSources({ created: [], inbox: [makeTask({
      id: 8, status: 'PAUSED', isAgentTask: true, agentId: AGENT_ID,
      agentUpdateAt: at, agentUpdateKind: 'unblocked', user: { id: 1, name: 'Gastón' }, agent: null,
      comments: [{ content: 'Sí, publicá con la cuenta de la agencia', createdAt: at, agentId: null, user: { name: 'Gastón' } }],
    })] })

    const res = await get()

    expect(res.status).toBe(200)
    expect(res.body.updates).toEqual([expect.objectContaining({
      kind: 'unblocked',
      taskId: 8,
      status: 'PAUSED',
      owner: { id: 1, name: 'Gastón' },
      recentComments: [expect.objectContaining({ content: 'Sí, publicá con la cuenta de la agencia' })],
    })])
    // Su lista de trabajo: las suyas + las delegadas a "cualquiera de mis agentes"
    expect(inboxWhere()).toMatchObject({
      userId: 1, isAgentTask: true, agentUpdateAt: { not: null },
      workDay: { workspaceId: WORKSPACE_ID }, OR: [{ agentId: AGENT_ID }, { agentId: null }],
    })
  })

  it('un comentario de la persona llega como novedad `comment`', async () => {
    mockSources({ created: [], inbox: [makeTask({
      id: 9, status: 'PAUSED', isAgentTask: true, agentId: AGENT_ID,
      agentUpdateAt: new Date('2026-10-23T11:00:00Z'), agentUpdateKind: 'comment',
      user: { id: 1, name: 'Gastón' }, agent: null, comments: [],
    })] })

    const res = await get()
    expect(res.body.updates).toEqual([expect.objectContaining({ kind: 'comment', taskId: 9 })])
  })

  it('mezcla las dos fuentes en orden cronológico y las marca vistas cada una con su campo', async () => {
    mockSources({ inbox: [makeTask({
      id: 8, status: 'PAUSED', isAgentTask: true, agentId: AGENT_ID,
      // Anterior a la que se completó (22/10 15:00): tiene que salir primero
      agentUpdateAt: new Date('2026-10-22T09:00:00Z'), agentUpdateKind: 'unblocked',
      user: { id: 1, name: 'Gastón' }, agent: null, comments: [],
    })] })

    const res = await get()

    expect(res.body.updates.map(u => [u.kind, u.taskId])).toEqual([['unblocked', 8], ['completed', 5]])
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [5] }, createdByAgentSeenAt: null },
      data: { createdByAgentSeenAt: expect.any(Date) },
    })
    // La novedad se limpia: aparece una sola vez
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [8] } },
      data: { agentUpdateAt: null, agentUpdateKind: null },
    })
  })
})

describe('GET /api/tasks/agent-queue', () => {
  beforeEach(() => {
    prisma.task.findMany.mockResolvedValue([])
    prisma.task.updateMany.mockResolvedValue({ count: 0 })
    prisma.taskRecurrence.findMany.mockResolvedValue([])
    prisma.task.count.mockResolvedValue(0)
    prisma.taskRecurrence.count.mockResolvedValue(0)
  })

  it('sin nada que materializar no abre un WorkDay (contaría como presencia)', async () => {
    prisma.workDay.findUnique.mockResolvedValue(null)

    await request(app)
      .get('/api/tasks/agent-queue')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(prisma.workDay.create).not.toHaveBeenCalled()
    expect(prisma.task.updateMany).not.toHaveBeenCalled()
  })

  it('con una serie del agente, materializa solo lo del agente', async () => {
    prisma.workDay.findUnique.mockResolvedValue({ id: 10 })
    prisma.taskRecurrence.count.mockResolvedValue(1)

    await request(app)
      .get('/api/tasks/agent-queue')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(prisma.task.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ isAgentTask: true }),
    }))
    expect(prisma.taskRecurrence.findMany).toHaveBeenCalledWith({
      where: { userId: 1, workspaceId: WORKSPACE_ID, active: true, isAgentTask: true },
    })
  })

  it('vía MCP devuelve las del agente + las delegadas a cualquiera', async () => {
    const res = await request(app)
      .get('/api/tasks/agent-queue')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    const { where } = prisma.task.findMany.mock.calls[0][0]
    expect(where).toEqual(expect.objectContaining({ userId: 1, isAgentTask: true }))
    expect(where.AND).toContainEqual({ OR: [{ agentId: AGENT_ID }, { agentId: null }] })
  })

  it('view=dashboard devuelve abiertas + completadas hoy sin materializar', async () => {
    const res = await request(app)
      .get('/api/tasks/agent-queue?view=dashboard')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    const { where } = prisma.task.findMany.mock.calls[0][0]
    expect(where).toEqual(expect.objectContaining({ userId: 1, isAgentTask: true }))
    expect(where.OR).toHaveLength(2) // abiertas | completadas hoy
    expect(prisma.task.count).not.toHaveBeenCalled()
    expect(prisma.workDay.create).not.toHaveBeenCalled()
  })

  it('desde la app devuelve las de todos los agentes de la persona', async () => {
    await request(app)
      .get('/api/tasks/agent-queue')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    const { where } = prisma.task.findMany.mock.calls[0][0]
    expect(where.isAgentTask).toBe(true)
    // Sin agente que la pida, el único filtro es la ventana de fechas.
    expect(where.AND.some(f => f.OR?.some(o => 'agentId' in o))).toBe(false)
  })

  it('no reabre la jornada de la persona', async () => {
    prisma.workDay.findUnique.mockResolvedValue({ id: 10, endedAt: new Date() })

    await request(app)
      .get('/api/tasks/agent-queue')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(prisma.workDay.create).not.toHaveBeenCalled()
  })

  // Sin parámetros el tope sigue siendo hoy: la cola no destapa lo programado a futuro.
  it('sin fechas topea lo programado en hoy y no recorta las tareas ya activas', async () => {
    await request(app)
      .get('/api/tasks/agent-queue')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)

    const { where } = prisma.task.findMany.mock.calls[0][0]
    const [scheduled, active] = where.AND[0].OR
    expect(scheduled.scheduledFor).toEqual({ not: null, lte: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    expect(scheduled.scheduledFor.gte).toBeUndefined()
    expect(active).toEqual({ scheduledFor: null })   // sin filtro por día de jornada
  })

  it('con `to` más adelante trae lo programado hasta ese día', async () => {
    await request(app)
      .get('/api/tasks/agent-queue?to=2099-12-31')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)

    const { where } = prisma.task.findMany.mock.calls[0][0]
    const [scheduled, active] = where.AND[0].OR
    expect(scheduled.scheduledFor.lte).toBe('2099-12-31')
    expect(active.workDay).toEqual({ date: { lte: '2099-12-31' } })
  })

  it('una fecha mal formada se ignora en vez de romper la cola', async () => {
    await request(app)
      .get('/api/tasks/agent-queue?to=mañana')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)

    const { where } = prisma.task.findMany.mock.calls[0][0]
    expect(where.AND[0].OR[0].scheduledFor.lte).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(where.AND[0].OR[1].workDay).toBeUndefined()
  })

  it('`mine` filtra por el nombre declarado + las que no tiene nadie', async () => {
    await request(app)
      .get('/api/tasks/agent-queue?mine=true')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID, mcpAgentName: 'SEO' }))
      .set('X-Workspace', WORKSPACE_SLUG)

    const { where } = prisma.task.findMany.mock.calls[0][0]
    expect(where.AND).toContainEqual({ OR: [{ agentName: 'SEO' }, { agentName: null }] })
  })

  // Sin nombre declarado no hay con qué distinguirlo de los otros agentes del token:
  // devolver una cola vacía le esconderia trabajo real.
  it('`mine` sin nombre declarado no filtra nada', async () => {
    await request(app)
      .get('/api/tasks/agent-queue?mine=true')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)

    const { where } = prisma.task.findMany.mock.calls[0][0]
    expect(where.AND.some(f => f.OR?.some(o => 'agentName' in o))).toBe(false)
  })
})

// ─── Avisos ───────────────────────────────────────────────────────────────────

describe('avisos de tareas de agente', () => {
  beforeEach(() => {
    prisma.projectMember.findMany.mockResolvedValue([{ userId: 2 }, { userId: 3 }])
    prisma.taskFollow.findMany.mockResolvedValue([])
    prisma.projectMeetingParticipant.findUnique.mockResolvedValue(null)
    prisma.leadAction.findUnique.mockResolvedValue(null)
  })

  it('completar una tarea de agente no notifica a nadie', async () => {
    prisma.task.findFirst.mockResolvedValueOnce(makeTask({ status: 'IN_PROGRESS', isAgentTask: true, agentId: AGENT_ID }))
    prisma.task.update.mockResolvedValue(makeTask({ status: 'COMPLETED', isAgentTask: true, agentId: AGENT_ID }))

    const res = await request(app)
      .patch('/api/tasks/1/complete')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(prisma.notification.createMany).not.toHaveBeenCalled()
    expect(prisma.projectMember.findMany).not.toHaveBeenCalled()
  })

  it('completar una tarea humana sigue notificando al equipo', async () => {
    prisma.task.findFirst.mockResolvedValueOnce(makeTask({ status: 'IN_PROGRESS' }))
    prisma.task.update.mockResolvedValue(makeTask({ status: 'COMPLETED' }))

    await request(app)
      .patch('/api/tasks/1/complete')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(prisma.notification.createMany).toHaveBeenCalled()
  })

  it('completar una tarea la deja como novedad para el agente que la creó (también si se recompleta)', async () => {
    prisma.task.findFirst.mockResolvedValueOnce(makeTask({ status: 'IN_PROGRESS', createdByAgentId: AGENT_ID }))
    prisma.task.update.mockResolvedValue(makeTask({ status: 'COMPLETED', createdByAgentId: AGENT_ID }))

    await request(app)
      .patch('/api/tasks/1/complete')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({ status: 'COMPLETED', createdByAgentSeenAt: null })
  })

  it('el bloqueo de un agente le avisa solo a su dueño, sin actor y nombrando al agente', async () => {
    prisma.task.findFirst.mockResolvedValueOnce(makeTask({ status: 'IN_PROGRESS', isAgentTask: true, agentId: AGENT_ID }))
    prisma.task.update.mockResolvedValue(makeTask({ status: 'BLOCKED', isAgentTask: true, agentId: AGENT_ID, agent: { id: AGENT_ID, label: 'Grok' } }))

    const res = await request(app)
      .patch('/api/tasks/1/block')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ reason: 'Falta el acceso a GA4' })

    expect(res.status).toBe(200)
    expect(prisma.notification.createMany).not.toHaveBeenCalled()
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 1, actorId: null, type: 'BLOCKED',
        message: 'Tu agente «Grok» bloqueó "Tarea de prueba": Falta el acceso a GA4',
      }),
    })
  })
})

// ─── Desbloquear ──────────────────────────────────────────────────────────────

describe('PATCH /api/tasks/:id/unblock — agentes', () => {
  function blocked(overrides = {}) {
    return makeTask({
      status: 'BLOCKED', isAgentTask: true, agentId: AGENT_ID,
      pausedAt: new Date(Date.now() - 30 * 60000), blockedReason: '¿Apruebo este texto?',
      ...overrides,
    })
  }

  function unblock({ mcpTokenId, body } = {}) {
    const req = request(app)
      .patch('/api/tasks/1/unblock')
      .set('Authorization', authHeader(mcpTokenId ? { mcpTokenId } : {}))
      .set('X-Workspace', WORKSPACE_SLUG)
    return body ? req.send(body) : req
  }

  const updateData = () => prisma.task.update.mock.calls[0][0].data

  beforeEach(() => {
    prisma.projectMember.findMany.mockResolvedValue([{ userId: 2 }])
    prisma.taskFollow.findMany.mockResolvedValue([])
    prisma.projectMeetingParticipant.findUnique.mockResolvedValue(null)
    prisma.leadAction.findUnique.mockResolvedValue(null)
    prisma.task.update.mockResolvedValue(blocked({ status: 'PAUSED' }))
  })

  // El punto del cambio: dejarla IN_PROGRESS le sumaba tiempo real (facturable) hasta el
  // cron de medianoche, con nadie trabajando — un agente solo actúa cuando lo invocan.
  it('destrabada por la persona desde la app queda PAUSADA y sin sesión nueva', async () => {
    prisma.task.findFirst.mockResolvedValueOnce(blocked())

    const res = await unblock()

    expect(res.status).toBe(200)
    expect(updateData()).toMatchObject({
      status: 'PAUSED', blockedReason: null, pausedAt: expect.any(Date),
      agentUpdateAt: expect.any(Date), agentUpdateKind: 'unblocked',
    })
    expect(prisma.taskSession.create).not.toHaveBeenCalled()
  })

  // PAUSED y no PENDING: resumeTask conserva startedAt, startTask lo pisaría y se
  // perdería lo trabajado antes del bloqueo.
  it('el tiempo que estuvo bloqueada cuenta como pausa', async () => {
    prisma.task.findFirst.mockResolvedValueOnce(blocked())

    await unblock()

    expect(updateData().pausedMinutes).toEqual({ increment: 30 })
  })

  it('la respuesta queda como comentario de la tarea: es donde el agente la lee', async () => {
    prisma.task.findFirst.mockResolvedValueOnce(blocked())

    await unblock({ body: { reply: '  Sí, publicá con la cuenta de la agencia  ' } })

    expect(prisma.taskComment.create).toHaveBeenCalledWith({
      data: { taskId: 1, userId: 1, content: 'Sí, publicá con la cuenta de la agencia' },
    })
  })

  it('sin respuesta (o en blanco) no crea comentario', async () => {
    prisma.task.findFirst.mockResolvedValueOnce(blocked())

    await unblock({ body: { reply: '   ' } })

    expect(prisma.taskComment.create).not.toHaveBeenCalled()
  })

  // Es el paso `unblock` de task_working_on: ahí sí hay alguien trabajando.
  it('destrabada por el agente mismo (vía MCP) vuelve a estar en curso', async () => {
    prisma.task.findFirst.mockResolvedValueOnce(blocked())
    prisma.task.update.mockResolvedValue(blocked({ status: 'IN_PROGRESS' }))

    const res = await unblock({ mcpTokenId: AGENT_ID })

    expect(res.status).toBe(200)
    expect(updateData()).toMatchObject({ status: 'IN_PROGRESS', pausedAt: null })
    expect(updateData()).not.toHaveProperty('agentUpdateAt')
    expect(prisma.taskSession.create).toHaveBeenCalled()
  })

  // El cable hacia los canales de salida: sin esto el agente sigue dependiendo de que
  // alguien lo invoque.
  it('le avisa al agente por los canales de salida (webhook / despertador)', async () => {
    prisma.task.findFirst.mockResolvedValueOnce(blocked())

    await unblock()

    expect(notifyAgentOfNewsInBackground).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'task.unblocked', workspaceId: WORKSPACE_ID }),
    )
  })

  it('en una tarea humana no cambia nada: en curso, con sesión, avisando al equipo, y sin tomar el reply', async () => {
    prisma.task.findFirst.mockResolvedValueOnce(blocked({ isAgentTask: false, agentId: null }))
    prisma.task.update.mockResolvedValue(makeTask({ status: 'IN_PROGRESS' }))

    const res = await unblock({ body: { reply: 'listo' } })

    expect(res.status).toBe(200)
    expect(updateData()).toMatchObject({ status: 'IN_PROGRESS' })
    expect(updateData()).not.toHaveProperty('agentUpdateAt')
    expect(prisma.taskSession.create).toHaveBeenCalled()
    expect(prisma.taskComment.create).not.toHaveBeenCalled()
    expect(prisma.notification.createMany).toHaveBeenCalled()
    expect(notifyAgentOfNewsInBackground).not.toHaveBeenCalled()
  })
})

// ─── Borrar vía MCP ───────────────────────────────────────────────────────────

describe('DELETE /api/tasks/:id — agentes', () => {
  function del(id, { mcpTokenId = AGENT_ID, query = '' } = {}) {
    return request(app)
      .delete(`/api/tasks/${id}${query}`)
      .set('Authorization', authHeader({ mcpTokenId }))
      .set('X-Workspace', WORKSPACE_SLUG)
  }

  it('el agente borra una tarea de agente abierta suya', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ isAgentTask: true, agentId: AGENT_ID, createdById: 1 }))
    const res = await del(1)
    expect(res.status).toBe(200)
    expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })

  it('el agente borra una tarea delegada a "cualquiera de mis agentes"', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ isAgentTask: true, agentId: null, createdById: 1 }))
    const res = await del(1)
    expect(res.status).toBe(200)
    expect(prisma.task.delete).toHaveBeenCalled()
  })

  it('403 sobre una tarea humana, aunque sea de su dueño', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ createdById: 1 }))
    const res = await del(1)
    expect(res.status).toBe(403)
    expect(prisma.task.delete).not.toHaveBeenCalled()
  })

  it('403 aunque el dueño sea admin', async () => {
    prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: 'admin', active: true })
    prisma.task.findFirst.mockResolvedValue(makeTask({ userId: 2, createdById: 2 }))
    const res = await del(1)
    expect(res.status).toBe(403)
    expect(prisma.task.delete).not.toHaveBeenCalled()
  })

  it('403 sobre una tarea de otro agente del mismo dueño', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ isAgentTask: true, agentId: AGENT_ID + 1 }))
    const res = await del(1)
    expect(res.status).toBe(403)
  })

  it('400 sobre una tarea de agente ya completada', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ isAgentTask: true, agentId: AGENT_ID, status: 'COMPLETED' }))
    const res = await del(1)
    expect(res.status).toBe(400)
    expect(prisma.task.delete).not.toHaveBeenCalled()
  })

  it('scope=series borra la serie si la plantilla es del agente', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ isAgentTask: true, agentId: AGENT_ID, recurrenceId: 5 }))
    prisma.taskRecurrence.findUnique.mockResolvedValue({ id: 5, userId: 1, isAgentTask: true, agentId: AGENT_ID })
    prisma.task.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    const res = await del(1, { query: '?scope=series' })
    expect(res.status).toBe(200)
    expect(prisma.taskRecurrence.delete).toHaveBeenCalledWith({ where: { id: 5 } })
  })

  it('scope=series da 403 si la plantilla es humana', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ isAgentTask: true, agentId: AGENT_ID, recurrenceId: 5 }))
    prisma.taskRecurrence.findUnique.mockResolvedValue({ id: 5, userId: 1, isAgentTask: false, agentId: null })
    const res = await del(1, { query: '?scope=series' })
    expect(res.status).toBe(403)
    expect(prisma.taskRecurrence.delete).not.toHaveBeenCalled()
  })

  it('desde la app la persona sigue pudiendo borrar sus tareas humanas', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ createdById: 1 }))
    const res = await request(app)
      .delete('/api/tasks/1')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
    expect(res.status).toBe(200)
    expect(prisma.task.delete).toHaveBeenCalled()
  })
})

// ─── Editar, reasignar y comentar vía MCP ─────────────────────────────────────

describe('PATCH /api/tasks/:id — agentes', () => {
  function patch(body, { mcpTokenId = AGENT_ID } = {}) {
    return request(app)
      .patch('/api/tasks/1')
      .set('Authorization', authHeader({ mcpTokenId }))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send(body)
  }

  beforeEach(() => {
    prisma.task.findUnique.mockResolvedValue(makeTask())
    prisma.workspaceMember.findMany.mockResolvedValue([])
  })

  it('corrige el texto de una tarea de su dueño', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask())
    const res = await patch({ description: 'Texto corregido' })
    expect(res.status).toBe(200)
    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: 1 }, data: expect.objectContaining({ description: 'Texto corregido' }) })
  })

  it('403 sobre una tarea de otra persona, aunque el dueño sea admin', async () => {
    prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: 'admin', active: true })
    prisma.task.findFirst.mockResolvedValue(makeTask({ userId: 2 }))
    const res = await patch({ description: 'x' })
    expect(res.status).toBe(403)
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('reasigna sin mandar la descripción, y le avisa al nuevo responsable', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask())
    prisma.workspaceMember.findUnique.mockImplementation(({ where }) => Promise.resolve(
      { workspaceId: WORKSPACE_ID, userId: where.workspaceId_userId.userId, role: 'member', active: true },
    ))
    const res = await patch({ targetUserId: 2 })
    expect(res.status).toBe(200)
    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: 1 }, data: expect.objectContaining({ userId: 2, description: 'Tarea de prueba', workDayId: 10 }) })
    expect(prisma.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 2, actorId: 1, type: 'TASK_MENTION' }) })
  })

  it('reasignar una tarea de agente la vuelve humana', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ isAgentTask: true, agentId: AGENT_ID }))
    prisma.workspaceMember.findUnique.mockImplementation(({ where }) => Promise.resolve(
      { workspaceId: WORKSPACE_ID, userId: where.workspaceId_userId.userId, role: 'member', active: true },
    ))
    const res = await patch({ targetUserId: 2 })
    expect(res.status).toBe(200)
    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: 1 }, data: expect.objectContaining({ userId: 2, isAgentTask: false, agentId: null }) })
  })

  it('400 con una descripción vacía', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask())
    const res = await patch({ description: '  ' })
    expect(res.status).toBe(400)
  })
})

// ─── Cerrar con fecha hacia atrás ─────────────────────────────────────────────

describe('PATCH /api/tasks/:id/logged-at', () => {
  const TZ = 'America/Argentina/Buenos_Aires'
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const monthStart = `${today.slice(0, 7)}-01`

  function completedAgentTask(overrides = {}) {
    return makeTask({
      status: 'COMPLETED',
      isAgentTask: true,
      agentId: AGENT_ID,
      startedAt: new Date('2026-11-03T13:00:00Z'),
      completedAt: new Date('2026-11-03T13:45:00Z'),
      minutesOverride: 45,
      workDay: { date: today },
      sessions: [{ id: 5, startedAt: new Date('2026-11-03T13:00:00Z'), endedAt: new Date('2026-11-03T13:45:00Z') }],
      ...overrides,
    })
  }

  function loggedAt(date, { mcpTokenId = AGENT_ID } = {}) {
    return request(app)
      .patch('/api/tasks/1/logged-at')
      .set('Authorization', authHeader({ mcpTokenId }))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ date })
  }

  beforeEach(() => {
    prisma.task.update.mockImplementation(({ data }) => Promise.resolve(makeTask({ ...data, id: 1 })))
    prisma.taskSession.update.mockResolvedValue({})
  })

  it('mueve la jornada, el cierre y las sesiones al día indicado', async () => {
    // Una jornada de otro día: la tarea tiene que terminar colgada de ESA, no de la de hoy.
    prisma.task.findFirst.mockResolvedValue(completedAgentTask({ workDay: { date: today } }))
    prisma.workDay.findUnique.mockResolvedValue({ id: 77, date: monthStart })

    const res = await loggedAt(monthStart)
    expect(res.status).toBe(200)

    const { data } = prisma.task.update.mock.calls[0][0]
    expect(data.workDayId).toBe(77)
    // El día del cierre, en la timezone del workspace, es el pedido.
    expect(data.completedAt.toLocaleDateString('en-CA', { timeZone: TZ })).toBe(monthStart)
    // startedAt se corre por el MISMO delta: la tarea sigue durando lo que duró.
    expect(data.completedAt - data.startedAt).toBe(45 * 60 * 1000)
    // La sesión acompaña, si no el detalle de la tarea mostraría otro día que la jornada.
    expect(prisma.taskSession.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 5 } }))
    const session = prisma.taskSession.update.mock.calls[0][0].data
    expect(session.startedAt.toLocaleDateString('en-CA', { timeZone: TZ })).toBe(monthStart)
  })

  it('no toca la jornada si ya es la de ese día', async () => {
    prisma.task.findFirst.mockResolvedValue(completedAgentTask())
    const res = await loggedAt(today)
    expect(res.status).toBe(200)
    expect(prisma.workDay.create).not.toHaveBeenCalled()
    expect(prisma.task.update.mock.calls[0][0].data.workDayId).toBeUndefined()
  })

  // El tiempo de agente consume horas contratadas y se le informa al cliente: un mes
  // cerrado ya se reportó.
  it('400 antes del 1° del mes en curso', async () => {
    prisma.task.findFirst.mockResolvedValue(completedAgentTask())
    const prevMonth = new Date(`${monthStart}T12:00:00Z`)
    prevMonth.setUTCDate(0)
    const res = await loggedAt(prevMonth.toISOString().slice(0, 10))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/mes en curso/)
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('400 con una fecha futura', async () => {
    prisma.task.findFirst.mockResolvedValue(completedAgentTask())
    const res = await loggedAt('2099-01-15')
    expect(res.status).toBe(400)
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('400 con una fecha mal formada', async () => {
    prisma.task.findFirst.mockResolvedValue(completedAgentTask())
    const res = await loggedAt('3 de noviembre')
    expect(res.status).toBe(400)
  })

  // El tiempo que registró una persona no se reescribe desde acá.
  it('403 sobre una tarea de la persona', async () => {
    prisma.task.findFirst.mockResolvedValue(completedAgentTask({ isAgentTask: false, agentId: null }))
    const res = await loggedAt(monthStart)
    expect(res.status).toBe(403)
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('400 si la tarea todavía no está completada', async () => {
    prisma.task.findFirst.mockResolvedValue(completedAgentTask({ status: 'IN_PROGRESS', completedAt: null }))
    const res = await loggedAt(monthStart)
    expect(res.status).toBe(400)
  })

  it('400 desde la app (sin agente): es un paso de la tool, no una acción de la UI', async () => {
    prisma.task.findFirst.mockResolvedValue(completedAgentTask())
    const res = await loggedAt(monthStart, { mcpTokenId: null })
    expect(res.status).toBe(400)
    expect(prisma.task.findFirst).not.toHaveBeenCalled()
  })
})

describe('POST /api/tasks/:id/comments — agentes', () => {
  beforeEach(() => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ userId: 1, project: { id: 1, isPrivate: false } }))
    prisma.taskComment.findMany.mockResolvedValue([])
    prisma.taskFollow.findMany.mockResolvedValue([])
    prisma.taskComment.create.mockImplementation(({ data }) => Promise.resolve({
      id: 5, ...data, agent: data.agentId ? { id: data.agentId, label: 'Grok' } : null, reactions: [],
    }))
  })

  it('guarda el agente y le avisa a su dueño sin actor', async () => {
    const res = await request(app)
      .post('/api/tasks/1/comments')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ text: 'Avance: ya revisé las 3 landings' })

    expect(res.status).toBe(201)
    expect(prisma.taskComment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { taskId: 1, userId: 1, agentId: AGENT_ID, agentName: null, content: 'Avance: ya revisé las 3 landings' },
    }))
    expect(prisma.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: 1, actorId: null, type: 'TASK_COMMENT', message: expect.stringContaining('Tu agente «Grok» comentó'),
    }) })
  })

  it('desde la app el autor no se autonotifica', async () => {
    const res = await request(app)
      .post('/api/tasks/1/comments')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ text: 'Nota mía' })

    expect(res.status).toBe(201)
    expect(prisma.taskComment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ agentId: null }) }))
    expect(prisma.notification.create).not.toHaveBeenCalled()
  })
})
