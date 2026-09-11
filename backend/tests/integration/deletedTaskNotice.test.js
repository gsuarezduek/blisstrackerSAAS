jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  task: {
    findFirst: jest.fn(),
    findMany:  jest.fn(),
    delete:    jest.fn(),
  },
  notification: {
    deleteMany: jest.fn(),
    create:     jest.fn(),
  },
  deletedTaskNotice: {
    create:     jest.fn(),
    findMany:   jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(ops => Promise.all(ops)),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1

function authHeader(userId = 1) {
  const token = jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role: 'member', isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )
  return `Bearer ${token}`
}

function mockWorkspace() {
  prisma.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss' })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: 'member', active: true })
}

function makeTask(overrides = {}) {
  return {
    id: 1, userId: 2, createdById: 1, status: 'PENDING', recurrenceId: null,
    description: 'Tarea de prueba', projectId: 1,
    ...overrides,
  }
}

describe('DELETE /api/tasks/:id — aviso de tarea delegada eliminada', () => {
  beforeEach(() => { jest.clearAllMocks(); mockWorkspace() })

  it('el asignado borra una tarea que le delegaron: crea DeletedTaskNotice + Notification TASK_DELETED para el creador', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ userId: 2, createdById: 1 }))
    prisma.notification.deleteMany.mockResolvedValue({ count: 0 })
    prisma.task.delete.mockResolvedValue({})
    prisma.deletedTaskNotice.create.mockResolvedValue({})
    prisma.notification.create.mockResolvedValue({})

    const res = await request(app)
      .delete('/api/tasks/1')
      .set('Authorization', authHeader(2)) // borra el asignado, no el creador
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(prisma.deletedTaskNotice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        workspaceId: WORKSPACE_ID, projectId: 1, description: 'Tarea de prueba',
        userId: 2, createdById: 1, deletedById: 2,
      }),
    }))
    expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 1, actorId: 2, type: 'TASK_DELETED' }),
    }))
  })

  it('el delegante borra su propia tarea delegada: no se autonotifica', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ userId: 2, createdById: 1 }))
    prisma.notification.deleteMany.mockResolvedValue({ count: 0 })
    prisma.task.delete.mockResolvedValue({})

    const res = await request(app)
      .delete('/api/tasks/1')
      .set('Authorization', authHeader(1)) // borra el propio creador
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(prisma.deletedTaskNotice.create).not.toHaveBeenCalled()
    expect(prisma.notification.create).not.toHaveBeenCalled()
  })

  it('tarea no delegada (propia, sin createdById): borrado normal sin aviso', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ userId: 1, createdById: null }))
    prisma.notification.deleteMany.mockResolvedValue({ count: 0 })
    prisma.task.delete.mockResolvedValue({})

    const res = await request(app)
      .delete('/api/tasks/1')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(prisma.deletedTaskNotice.create).not.toHaveBeenCalled()
    expect(prisma.notification.create).not.toHaveBeenCalled()
  })

  it('tarea delegada borrada por un admin (ni asignado ni creador): sí avisa al creador', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ userId: 2, createdById: 1 }))
    prisma.notification.deleteMany.mockResolvedValue({ count: 0 })
    prisma.task.delete.mockResolvedValue({})
    prisma.deletedTaskNotice.create.mockResolvedValue({})
    prisma.notification.create.mockResolvedValue({})
    // isAdmin() lee req.workspaceMember.role (resuelto por middleware contra la DB, no el rol del JWT)
    prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 99, role: 'admin', active: true })

    const token = jwt.sign(
      { userId: 99, workspaceId: WORKSPACE_ID, role: 'admin', isSuperAdmin: false, name: 'Admin', email: 'a@a.com' },
      SECRET,
    )

    const res = await request(app)
      .delete('/api/tasks/1')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(prisma.deletedTaskNotice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ createdById: 1, deletedById: 99 }),
    }))
  })
})

describe('GET /api/tasks/delegated — incluye avisos de eliminación', () => {
  beforeEach(() => { jest.clearAllMocks(); mockWorkspace() })

  it('mezcla tareas reales con avisos de eliminación (__deletedNotice)', async () => {
    prisma.task.findMany.mockResolvedValue([])
    prisma.deletedTaskNotice.findMany.mockResolvedValue([{
      id: 5, description: 'Tarea borrada', deletedAt: new Date(),
      project: { id: 1, name: 'Proyecto Test' },
      user: { id: 2, name: 'Asignado', avatar: 'a.png' },
      deletedBy: { id: 2, name: 'Asignado', avatar: 'a.png' },
    }])

    const res = await request(app)
      .get('/api/tasks/delegated')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ id: 5, __deletedNotice: true, status: 'DELETED', description: 'Tarea borrada' })
  })
})

describe('DELETE /api/tasks/delegated/notices/:id', () => {
  beforeEach(() => { jest.clearAllMocks(); mockWorkspace() })

  it('marca el aviso como descartado', async () => {
    prisma.deletedTaskNotice.updateMany.mockResolvedValue({ count: 1 })

    const res = await request(app)
      .delete('/api/tasks/delegated/notices/5')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(prisma.deletedTaskNotice.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 5, createdById: 1, workspaceId: WORKSPACE_ID }),
      data: { dismissed: true },
    }))
  })

  it('retorna 404 si el aviso no existe o no es propio', async () => {
    prisma.deletedTaskNotice.updateMany.mockResolvedValue({ count: 0 })

    const res = await request(app)
      .delete('/api/tasks/delegated/notices/999')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(404)
  })
})
