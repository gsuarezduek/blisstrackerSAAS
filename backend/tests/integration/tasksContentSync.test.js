jest.mock('../../src/lib/prisma', () => ({
  workspace:          { findUnique: jest.fn() },
  workspaceMember:    { findUnique: jest.fn() },
  task:               { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  taskSession:        { updateMany: jest.fn(), create: jest.fn() },
  notification:       { createMany: jest.fn() },
  projectMember:      { findMany: jest.fn() },
  taskFollow:         { findMany: jest.fn() },
  eOSTodo:            { updateMany: jest.fn() },
  projectMeetingTodo: { updateMany: jest.fn() },
  projectMeetingParticipant: { findUnique: jest.fn() },
  leadAction:         { updateMany: jest.fn(), findUnique: jest.fn() },
  contentPiece:       { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  contentStatusEvent: { create: jest.fn() },
  $transaction:       jest.fn(arr => Promise.all(arr)),
}))

jest.mock('../../src/lib/socket', () => ({ emitTo: jest.fn() }))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const { emitTo } = require('../../src/lib/socket')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const USER_ID        = 1
const TASK_ID        = 50

function authHeader(userId = USER_ID) {
  const token = jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role: 'member', isSuperAdmin: false, name: 'Ana', email: 'a@t.com' },
    SECRET,
  )
  return `Bearer ${token}`
}

function req(method, url) {
  return request(app)[method](url)
    .set('Authorization', authHeader())
    .set('X-Workspace', WORKSPACE_SLUG)
}

function mockBase() {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss',
    members: [{ workspaceId: WORKSPACE_ID, userId: USER_ID, role: 'member', active: true }],
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: USER_ID, role: 'member', active: true })
  prisma.projectMember.findMany.mockResolvedValue([])
  prisma.taskFollow.findMany.mockResolvedValue([])
  prisma.eOSTodo.updateMany.mockResolvedValue({ count: 0 })
  prisma.projectMeetingTodo.updateMany.mockResolvedValue({ count: 0 })
  prisma.leadAction.updateMany.mockResolvedValue({ count: 0 })
  prisma.leadAction.findUnique.mockResolvedValue(null)
  prisma.taskSession.updateMany.mockResolvedValue({ count: 1 })
  prisma.task.findFirst.mockResolvedValue(null) // assertNoActiveTask: sin tarea en curso
  prisma.taskSession.create.mockResolvedValue({ id: 1 })
}

const dbTask = (over = {}) => ({
  id: TASK_ID, userId: USER_ID, projectId: 7, workDayId: 1, status: 'IN_PROGRESS',
  description: 'Tarea de contenido', createdById: null,
  ...over,
})

const dbPiece = (over = {}) => ({
  id: 20, workspaceId: WORKSPACE_ID, projectId: 7, title: 'Reel de lanzamiento',
  status: 'produccion', taskId: TASK_ID,
  ...over,
})

beforeEach(() => jest.clearAllMocks())

describe('PATCH /tasks/:id/complete — sync con ContentPiece', () => {
  it('avanza la pieza de producción a revisión y registra el evento', async () => {
    mockBase()
    prisma.task.findUnique.mockResolvedValue(dbTask())
    prisma.task.update.mockResolvedValue(dbTask({ status: 'COMPLETED' }))
    prisma.contentPiece.findUnique.mockResolvedValue(dbPiece({ status: 'produccion' })) // linkedPiece (tasks.controller)
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece({ status: 'revision', assets: [] })) // loadPiece (content.controller)

    const res = await req('patch', `/api/tasks/${TASK_ID}/complete`)

    expect(res.status).toBe(200)
    expect(prisma.contentPiece.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data:  expect.objectContaining({ status: 'revision' }),
    })
    expect(prisma.contentStatusEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ pieceId: 20, action: 'task_completed', fromStatus: 'produccion', toStatus: 'revision' }),
    }))
    expect(emitTo).toHaveBeenCalledWith(
      `workspace:${WORKSPACE_ID}`, 'content:piece:updated',
      expect.objectContaining({ projectId: 7 }),
    )
  })

  it('no mueve una pieza en un estado fuera de ADVANCE_ON_TASK_DONE (ej. ya aprobada)', async () => {
    mockBase()
    prisma.task.findUnique.mockResolvedValue(dbTask())
    prisma.task.update.mockResolvedValue(dbTask({ status: 'COMPLETED' }))
    prisma.contentPiece.findUnique.mockResolvedValue(dbPiece({ status: 'aprobado' }))

    const res = await req('patch', `/api/tasks/${TASK_ID}/complete`)

    expect(res.status).toBe(200)
    expect(prisma.contentPiece.update).not.toHaveBeenCalled()
    expect(prisma.contentStatusEvent.create).not.toHaveBeenCalled()
    expect(emitTo).not.toHaveBeenCalled()
  })

  it('una tarea sin pieza vinculada no toca ContentPiece', async () => {
    mockBase()
    prisma.task.findUnique.mockResolvedValue(dbTask())
    prisma.task.update.mockResolvedValue(dbTask({ status: 'COMPLETED' }))
    prisma.contentPiece.findUnique.mockResolvedValue(null)

    const res = await req('patch', `/api/tasks/${TASK_ID}/complete`)

    expect(res.status).toBe(200)
    expect(prisma.contentPiece.update).not.toHaveBeenCalled()
  })
})

describe('PATCH /tasks/:id/start y /resume — NO revierten el estado de la pieza', () => {
  it('startTask nunca toca ContentPiece', async () => {
    mockBase()
    prisma.task.findUnique.mockResolvedValue(dbTask({ status: 'PENDING', isBacklog: false }))
    prisma.task.update.mockResolvedValue(dbTask({ status: 'IN_PROGRESS' }))

    await req('patch', `/api/tasks/${TASK_ID}/start`)

    expect(prisma.contentPiece.findUnique).not.toHaveBeenCalled()
    expect(prisma.contentPiece.update).not.toHaveBeenCalled()
  })

  it('resumeTask nunca toca ContentPiece', async () => {
    mockBase()
    prisma.task.findUnique.mockResolvedValue(dbTask({ status: 'PAUSED', isBacklog: false, pausedAt: new Date() }))
    prisma.task.update.mockResolvedValue(dbTask({ status: 'IN_PROGRESS' }))

    await req('patch', `/api/tasks/${TASK_ID}/resume`)

    expect(prisma.contentPiece.findUnique).not.toHaveBeenCalled()
    expect(prisma.contentPiece.update).not.toHaveBeenCalled()
  })
})
