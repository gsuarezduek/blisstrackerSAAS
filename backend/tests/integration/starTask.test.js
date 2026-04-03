jest.mock('../../src/lib/prisma', () => ({
  task: {
    findUnique: jest.fn(),
    count:      jest.fn(),
    update:     jest.fn(),
  },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET = process.env.JWT_SECRET

function authHeader(userId = 1, role = 'USER') {
  const token = jwt.sign({ id: userId, role, name: 'Test', email: 't@t.com' }, SECRET)
  return `Bearer ${token}`
}

function makeTask(overrides = {}) {
  return {
    id: 1, userId: 1, starred: 0, status: 'PENDING',
    description: 'Tarea de prueba',
    project: { id: 1, name: 'Proyecto Test' },
    createdBy: null,
    ...overrides,
  }
}

describe('PATCH /api/tasks/:id/star — ciclo de estrellas', () => {
  it('0 → 1 cuando no hay otras tareas destacadas', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ starred: 0 }))
    prisma.task.count.mockResolvedValue(0)
    prisma.task.update.mockResolvedValue(makeTask({ starred: 1 }))

    const res = await request(app)
      .patch('/api/tasks/1/star')
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(res.body.starred).toBe(1)
  })

  it('1 → 2 sin consultar el límite (ya está destacada)', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ starred: 1 }))
    prisma.task.update.mockResolvedValue(makeTask({ starred: 2 }))

    const res = await request(app)
      .patch('/api/tasks/1/star')
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(prisma.task.count).not.toHaveBeenCalled()
  })

  it('2 → 3', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ starred: 2 }))
    prisma.task.update.mockResolvedValue(makeTask({ starred: 3 }))

    const res = await request(app)
      .patch('/api/tasks/1/star')
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(res.body.starred).toBe(3)
  })

  it('3 → 0 (quita la estrella)', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ starred: 3 }))
    prisma.task.update.mockResolvedValue(makeTask({ starred: 0 }))

    const res = await request(app)
      .patch('/api/tasks/1/star')
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(res.body.starred).toBe(0)
  })

  it('retorna 409 si ya hay 3 tareas destacadas y se intenta agregar otra', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ starred: 0 }))
    prisma.task.count.mockResolvedValue(3)

    const res = await request(app)
      .patch('/api/tasks/1/star')
      .set('Authorization', authHeader())

    expect(res.status).toBe(409)
  })

  it('retorna 404 si la tarea no existe', async () => {
    prisma.task.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/tasks/1/star')
      .set('Authorization', authHeader())

    expect(res.status).toBe(404)
  })

  it('retorna 404 si la tarea pertenece a otro usuario', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ userId: 99 }))

    const res = await request(app)
      .patch('/api/tasks/1/star')
      .set('Authorization', authHeader(1)) // userId = 1, pero la tarea es userId: 99

    expect(res.status).toBe(404)
  })

  it('retorna 401 sin autenticación', async () => {
    const res = await request(app).patch('/api/tasks/1/star')
    expect(res.status).toBe(401)
  })
})
