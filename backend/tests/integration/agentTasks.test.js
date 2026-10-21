jest.mock('../../src/lib/prisma', () => ({
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
  taskSession:    { create: jest.fn(), updateMany: jest.fn() },
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
    expect(where.AND).toEqual([{ OR: [{ agentId: AGENT_ID }, { agentId: null }] }])
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

// ─── Avisos ───────────────────────────────────────────────────────────────────

describe('avisos de tareas de agente', () => {
  beforeEach(() => {
    prisma.projectMember.findMany.mockResolvedValue([{ userId: 2 }, { userId: 3 }])
    prisma.taskFollow.findMany.mockResolvedValue([])
    prisma.projectMeetingParticipant.findUnique.mockResolvedValue(null)
    prisma.leadAction.findUnique.mockResolvedValue(null)
  })

  it('completar una tarea de agente no notifica a nadie', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ status: 'IN_PROGRESS', isAgentTask: true, agentId: AGENT_ID }))
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
    prisma.task.findUnique.mockResolvedValue(makeTask({ status: 'IN_PROGRESS' }))
    prisma.task.update.mockResolvedValue(makeTask({ status: 'COMPLETED' }))

    await request(app)
      .patch('/api/tasks/1/complete')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(prisma.notification.createMany).toHaveBeenCalled()
  })

  it('el bloqueo de un agente le avisa solo a su dueño, sin actor y nombrando al agente', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ status: 'IN_PROGRESS', isAgentTask: true, agentId: AGENT_ID }))
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
      data: { taskId: 1, userId: 1, agentId: AGENT_ID, content: 'Avance: ya revisé las 3 landings' },
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
