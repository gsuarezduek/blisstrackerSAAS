jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  task: {
    findUnique: jest.fn(),
    findFirst:  jest.fn(),
    update:     jest.fn(),
  },
  taskSession:              { create: jest.fn() },
  calendarEventParticipant: { findUnique: jest.fn() },
  eOSTodo:            { updateMany: jest.fn() },
  projectMeetingTodo: { updateMany: jest.fn() },
  financeTask:        { updateMany: jest.fn() },
  leadAction:         { updateMany: jest.fn() },
  notification:       { createMany: jest.fn() },
  projectMember:      { findMany: jest.fn() },
  taskFollow:         { findMany: jest.fn() },
  $transaction: jest.fn(ops => Promise.all(ops)),
}))
jest.mock('../../src/services/pushNotification.service', () => ({
  sendPushToUser: jest.fn(() => Promise.resolve()),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const { sendPushToUser } = require('../../src/services/pushNotification.service')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1

function authHeader(userId = 1) {
  const token = jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role: 'member', isSuperAdmin: false, name: 'Ana', email: 'a@t.com' },
    SECRET,
  )
  return `Bearer ${token}`
}

function makeTask(overrides = {}) {
  return {
    id: 1, userId: 1, status: 'PENDING', isBacklog: false, isAgentTask: false, agentId: null,
    description: 'Diseñar banner', projectId: 3, createdById: null, contentPieceId: null,
    project: { id: 3, name: 'Proyecto Test' },
    _count: { comments: 0 },
    ...overrides,
  }
}

function start() {
  return request(app)
    .patch('/api/tasks/1/start')
    .set('Authorization', authHeader())
    .set('X-Workspace', WORKSPACE_SLUG)
}

beforeEach(() => {
  jest.clearAllMocks()
  prisma.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss', timezone: 'America/Argentina/Buenos_Aires' })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: 'member', active: true })
  prisma.calendarEventParticipant.findUnique.mockResolvedValue(null)
  prisma.task.findFirst.mockResolvedValue(null) // sin otra tarea en curso
  prisma.projectMember.findMany.mockResolvedValue([{ userId: 50 }])
})

describe('PATCH /api/tasks/:id/start — aviso STARTED', () => {
  it('avisa a los seguidores y a quien la delegó, sin duplicar ni avisar al equipo del proyecto', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ createdById: 8 }))
    prisma.task.update.mockResolvedValue(makeTask({ status: 'IN_PROGRESS', createdById: 8 }))
    prisma.taskFollow.findMany.mockResolvedValue([{ userId: 5 }, { userId: 8 }])

    const res = await start()

    expect(res.status).toBe(200)
    expect(prisma.taskFollow.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { taskId: 1, userId: { not: 1 } },
    }))
    const { data } = prisma.notification.createMany.mock.calls[0][0]
    expect(data.map(n => n.userId).sort()).toEqual([5, 8])
    expect(data[0]).toEqual(expect.objectContaining({
      type: 'STARTED', actorId: 1, taskId: 1, projectId: 3, workspaceId: WORKSPACE_ID, message: 'empezó "Diseñar banner"',
    }))
    expect(prisma.projectMember.findMany).not.toHaveBeenCalled()
    expect(sendPushToUser).toHaveBeenCalledTimes(2)
  })

  it('no avisa si nadie la sigue ni la delegó otra persona', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ createdById: 1 }))
    prisma.task.update.mockResolvedValue(makeTask({ status: 'IN_PROGRESS', createdById: 1 }))
    prisma.taskFollow.findMany.mockResolvedValue([])

    const res = await start()

    expect(res.status).toBe(200)
    expect(prisma.notification.createMany).not.toHaveBeenCalled()
  })

  it('una tarea de agente no avisa', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ isAgentTask: true, createdById: 8 }))
    prisma.task.update.mockResolvedValue(makeTask({ status: 'IN_PROGRESS', isAgentTask: true, createdById: 8 }))
    prisma.taskFollow.findMany.mockResolvedValue([{ userId: 5 }])

    const res = await start()

    expect(res.status).toBe(200)
    expect(prisma.notification.createMany).not.toHaveBeenCalled()
  })
})
