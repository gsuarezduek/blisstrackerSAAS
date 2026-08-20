jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn(), findMany: jest.fn() },
  task:            { findUnique: jest.fn(), findFirst: jest.fn() },
  projectMember:   { findUnique: jest.fn(), findMany: jest.fn() },
  taskComment:     { create: jest.fn(), findMany: jest.fn() },
  taskFollow:      { findMany: jest.fn() },
  notification:    { createMany: jest.fn() },
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
    id: 10, userId: 2, projectId: 5,
    description: 'Tarea de prueba',
    project: { id: 5, name: 'Proyecto Test' },
    ...overrides,
  }
}

function makeComment(overrides = {}) {
  return {
    id: 1, taskId: 10, userId: 1, content: 'Buen trabajo',
    createdAt: new Date().toISOString(),
    user: { id: 1, name: 'Test', avatar: 'bee.png' },
    ...overrides,
  }
}

// ── GET /api/tasks/:id/comments ───────────────────────────────────────────────

describe('GET /api/tasks/:id/comments', () => {
  beforeEach(() => { jest.clearAllMocks(); mockWorkspace() })

  it('devuelve 200 con lista de comentarios si el usuario es miembro', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask())
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: 5, userId: 1 })
    prisma.taskComment.findMany.mockResolvedValue([makeComment()])

    const res = await request(app)
      .get('/api/tasks/10/comments')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].content).toBe('Buen trabajo')
  })

  it('devuelve 403 si el usuario no es miembro del proyecto', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask())
    prisma.projectMember.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/tasks/10/comments')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(403)
  })

  it('devuelve 403 si la tarea no existe', async () => {
    prisma.task.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/tasks/10/comments')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(403)
  })

  it('devuelve 401 sin autenticación', async () => {
    const res = await request(app).get('/api/tasks/10/comments')
    expect(res.status).toBe(401)
  })
})

// ── POST /api/tasks/:id/comments ─────────────────────────────────────────────

describe('POST /api/tasks/:id/comments', () => {
  beforeEach(() => { jest.clearAllMocks(); mockWorkspace(); prisma.taskFollow.findMany.mockResolvedValue([]) })

  it('crea el comentario y devuelve 201', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask())
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: 5, userId: 1 })
    prisma.taskComment.create.mockResolvedValue(makeComment())
    prisma.taskComment.findMany.mockResolvedValue([])
    prisma.notification.createMany.mockResolvedValue({ count: 1 })

    const res = await request(app)
      .post('/api/tasks/10/comments')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ text: 'Buen trabajo' })

    expect(res.status).toBe(201)
    expect(res.body.content).toBe('Buen trabajo')
  })

  it('notifica al dueño de la tarea si el comentador es distinto', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ userId: 2 }))
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: 5, userId: 1 })
    prisma.taskComment.create.mockResolvedValue(makeComment())
    prisma.taskComment.findMany.mockResolvedValue([])
    prisma.notification.createMany.mockResolvedValue({ count: 1 })

    await request(app)
      .post('/api/tasks/10/comments')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ text: 'Buen trabajo' })

    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 2, type: 'TASK_COMMENT' }),
        ]),
      })
    )
  })

  it('no se auto-notifica cuando el comentador es el dueño de la tarea', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ userId: 1 }))
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: 5, userId: 1 })
    prisma.taskComment.create.mockResolvedValue(makeComment())
    prisma.taskComment.findMany.mockResolvedValue([])

    await request(app)
      .post('/api/tasks/10/comments')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ text: 'Agrego contexto' })

    expect(prisma.notification.createMany).not.toHaveBeenCalled()
  })

  it('notifica también a comentadores previos únicos (sin duplicados)', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ userId: 2 }))
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: 5, userId: 1 })
    prisma.taskComment.create.mockResolvedValue(makeComment())
    prisma.taskComment.findMany.mockResolvedValue([{ userId: 3 }])
    prisma.notification.createMany.mockResolvedValue({ count: 2 })

    await request(app)
      .post('/api/tasks/10/comments')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ text: 'Comentario nuevo' })

    const call = prisma.notification.createMany.mock.calls[0][0]
    const notifiedIds = call.data.map(n => n.userId)
    expect(notifiedIds).toContain(2) // dueño
    expect(notifiedIds).toContain(3) // comentador previo
    expect(notifiedIds).toHaveLength(2) // sin duplicados
  })

  it('notifica con TASK_MENTION a un nombre completo de 3 palabras (autocompletado)', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ userId: 1 }))
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: 5, userId: 1 })
    prisma.workspaceMember.findMany.mockResolvedValue([
      { user: { id: 7, name: 'María José García' } },
    ])
    prisma.taskComment.create.mockResolvedValue(makeComment())
    prisma.taskComment.findMany.mockResolvedValue([])
    prisma.notification.createMany.mockResolvedValue({ count: 1 })

    await request(app)
      .post('/api/tasks/10/comments')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ text: 'dale una mano @María José García por favor' })

    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 7, type: 'TASK_MENTION' }),
        ]),
      })
    )
  })

  it('menciona a alguien del workspace que NO es del equipo del proyecto', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ userId: 1 }))
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: 5, userId: 1 })
    // Resuelve contra TODO el workspace, no contra ProjectMember — no hace falta
    // (ni se consulta) que la persona mencionada sea parte del equipo del proyecto.
    prisma.workspaceMember.findMany.mockResolvedValue([
      { user: { id: 9, name: 'Persona Externa Al Equipo' } },
    ])
    prisma.taskComment.create.mockResolvedValue(makeComment())
    prisma.taskComment.findMany.mockResolvedValue([])
    prisma.notification.createMany.mockResolvedValue({ count: 1 })

    await request(app)
      .post('/api/tasks/10/comments')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ text: 'avisale a @Persona Externa Al Equipo' })

    expect(prisma.projectMember.findMany).not.toHaveBeenCalled()
    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 9, type: 'TASK_MENTION' }),
        ]),
      })
    )
  })

  it('no confunde un prefijo: "@Ana" no menciona a "Analía"', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ userId: 1 }))
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: 5, userId: 1 })
    prisma.workspaceMember.findMany.mockResolvedValue([
      { user: { id: 8, name: 'Analía Suárez' } },
    ])
    prisma.taskComment.create.mockResolvedValue(makeComment())
    prisma.taskComment.findMany.mockResolvedValue([])

    await request(app)
      .post('/api/tasks/10/comments')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ text: 'gracias @Ana' })

    expect(prisma.notification.createMany).not.toHaveBeenCalled()
  })

  it('devuelve 400 si el texto está vacío', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask())
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: 5, userId: 1 })

    const res = await request(app)
      .post('/api/tasks/10/comments')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ text: '   ' })

    expect(res.status).toBe(400)
  })

  it('devuelve 403 si el usuario no es miembro del proyecto', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask())
    prisma.projectMember.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/tasks/10/comments')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ text: 'Hola' })

    expect(res.status).toBe(403)
  })

  it('devuelve 401 sin autenticación', async () => {
    const res = await request(app)
      .post('/api/tasks/10/comments')
      .send({ text: 'Hola' })

    expect(res.status).toBe(401)
  })
})
