jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  project:         { findFirst: jest.fn() },
  mcpToken:        { findFirst: jest.fn() },
  task: {
    findUnique: jest.fn(),
    findFirst:  jest.fn(),
    findMany:   jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
    updateMany: jest.fn(),
  },
  taskRecurrence: { update: jest.fn(), findMany: jest.fn() },
  taskSession:    { create: jest.fn() },
  workDay: {
    findUnique: jest.fn(),
    create:     jest.fn(),
  },
  calendarEventParticipant: { findUnique: jest.fn() },
  eOSTodo:            { updateMany: jest.fn() },
  projectMeetingTodo: { updateMany: jest.fn() },
  financeTask:        { updateMany: jest.fn() },
  leadAction:         { updateMany: jest.fn() },
  $transaction: jest.fn(ops => Promise.all(ops)),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const AGENT_ID       = 7

// mcpTokenId = la request viene por MCP (claim que solo firma mcp/apiBridge.js).
function authHeader({ userId = 1, mcpTokenId } = {}) {
  const token = jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role: 'member', isSuperAdmin: false, name: 'Test', email: 't@t.com', ...(mcpTokenId ? { mcpTokenId } : {}) },
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
    prisma.task.findUnique.mockResolvedValue(makeTask({ isAgentTask: true, agentId: null }))
    prisma.task.update.mockResolvedValue(makeTask({ status: 'IN_PROGRESS', isAgentTask: true, agentId: AGENT_ID }))

    const res = await request(app)
      .patch('/api/tasks/1/start')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(prisma.task.findFirst).not.toHaveBeenCalled() // no corre assertNoActiveTask
    expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'IN_PROGRESS', agentId: AGENT_ID }),
    }))
  })

  it('una tarea humana sigue respetando la regla (409 si hay otra humana en curso)', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask())
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
    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { isAgentTask: true, agentId: null } })
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
    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { isAgentTask: true, agentId: AGENT_ID } })
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
    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { isAgentTask: false, agentId: null } })
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
    expect(prisma.taskRecurrence.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { isAgentTask: true, agentId: null } })
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { recurrenceId: 3, status: { in: ['PENDING', 'PAUSED', 'BLOCKED'] } },
      data:  { isAgentTask: true, agentId: null },
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

describe('GET /api/tasks/agent-queue', () => {
  beforeEach(() => {
    prisma.task.findMany.mockResolvedValue([])
    prisma.task.updateMany.mockResolvedValue({ count: 0 })
    prisma.taskRecurrence.findMany.mockResolvedValue([])
  })

  it('vía MCP devuelve las del agente + las delegadas a cualquiera', async () => {
    const res = await request(app)
      .get('/api/tasks/agent-queue')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    const { where } = prisma.task.findMany.mock.calls[0][0]
    expect(where).toEqual(expect.objectContaining({ userId: 1, isAgentTask: true }))
    expect(where.AND).toEqual([{ OR: [{ agentId: AGENT_ID }, { agentId: null }] }])
  })

  it('desde la app devuelve las de todos los agentes de la persona', async () => {
    await request(app)
      .get('/api/tasks/agent-queue')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    const { where } = prisma.task.findMany.mock.calls[0][0]
    expect(where.isAgentTask).toBe(true)
    expect(where.AND).toBeUndefined()
  })

  it('no reabre la jornada de la persona', async () => {
    prisma.workDay.findUnique.mockResolvedValue({ id: 10, endedAt: new Date() })

    await request(app)
      .get('/api/tasks/agent-queue')
      .set('Authorization', authHeader({ mcpTokenId: AGENT_ID }))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(prisma.workDay.create).not.toHaveBeenCalled()
  })
})
