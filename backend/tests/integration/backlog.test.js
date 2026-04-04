jest.mock('../../src/lib/prisma', () => ({
  task: {
    findUnique: jest.fn(),
    findFirst:  jest.fn(),
    findMany:   jest.fn(),
    update:     jest.fn(),
  },
  workDay: {
    findUnique: jest.fn(),
    create:     jest.fn(),
  },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET = process.env.JWT_SECRET

function authHeader(userId = 1) {
  const token = jwt.sign({ id: userId, role: 'USER', name: 'Test', email: 't@t.com' }, SECRET)
  return `Bearer ${token}`
}

function makeTask(overrides = {}) {
  return {
    id: 1, userId: 1, status: 'PENDING', isBacklog: false,
    description: 'Tarea de prueba',
    project: { id: 1, name: 'Proyecto Test' },
    createdBy: null,
    workDay: { date: '2026-04-05' },
    ...overrides,
  }
}

// ─── move-to-backlog ──────────────────────────────────────────────────────────

describe('PATCH /api/tasks/:id/move-to-backlog', () => {
  it('mueve una tarea PENDING al backlog', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ status: 'PENDING' }))
    prisma.task.update.mockResolvedValue(makeTask({ isBacklog: true }))

    const res = await request(app)
      .patch('/api/tasks/1/move-to-backlog')
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { isBacklog: true },
    }))
  })

  it('mueve una tarea PAUSED al backlog', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ status: 'PAUSED' }))
    prisma.task.update.mockResolvedValue(makeTask({ status: 'PAUSED', isBacklog: true }))

    const res = await request(app)
      .patch('/api/tasks/1/move-to-backlog')
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
  })

  it('mueve una tarea BLOCKED al backlog', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ status: 'BLOCKED' }))
    prisma.task.update.mockResolvedValue(makeTask({ status: 'BLOCKED', isBacklog: true }))

    const res = await request(app)
      .patch('/api/tasks/1/move-to-backlog')
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
  })

  it('retorna 400 si la tarea está IN_PROGRESS', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ status: 'IN_PROGRESS' }))

    const res = await request(app)
      .patch('/api/tasks/1/move-to-backlog')
      .set('Authorization', authHeader())

    expect(res.status).toBe(400)
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('retorna 400 si la tarea está COMPLETED', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ status: 'COMPLETED' }))

    const res = await request(app)
      .patch('/api/tasks/1/move-to-backlog')
      .set('Authorization', authHeader())

    expect(res.status).toBe(400)
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('retorna 404 si la tarea no existe', async () => {
    prisma.task.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/tasks/1/move-to-backlog')
      .set('Authorization', authHeader())

    expect(res.status).toBe(404)
  })

  it('retorna 404 si la tarea pertenece a otro usuario', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ userId: 99 }))

    const res = await request(app)
      .patch('/api/tasks/1/move-to-backlog')
      .set('Authorization', authHeader(1))

    expect(res.status).toBe(404)
  })

  it('retorna 401 sin autenticación', async () => {
    const res = await request(app).patch('/api/tasks/1/move-to-backlog')
    expect(res.status).toBe(401)
  })
})

// ─── add-to-today ─────────────────────────────────────────────────────────────

describe('PATCH /api/tasks/:id/add-to-today', () => {
  const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const workDayToday = { id: 10, userId: 1, date: TODAY }

  it('mueve una tarea de backlog al día de hoy', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ isBacklog: true, workDay: { date: TODAY } }))
    prisma.workDay.findUnique.mockResolvedValue(workDayToday)
    prisma.task.update.mockResolvedValue(makeTask({ isBacklog: false, workDayId: 10 }))

    const res = await request(app)
      .patch('/api/tasks/1/add-to-today')
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isBacklog: false, workDayId: 10 }),
    }))
  })

  it('crea la jornada si no existe', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ isBacklog: true, workDay: { date: '2026-04-04' } }))
    prisma.workDay.findUnique.mockResolvedValue(null)
    prisma.workDay.create.mockResolvedValue(workDayToday)
    prisma.task.update.mockResolvedValue(makeTask({ isBacklog: false, workDayId: 10 }))

    const res = await request(app)
      .patch('/api/tasks/1/add-to-today')
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(prisma.workDay.create).toHaveBeenCalled()
  })

  it('retorna 400 si la tarea está COMPLETED', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ status: 'COMPLETED', workDay: { date: TODAY } }))

    const res = await request(app)
      .patch('/api/tasks/1/add-to-today')
      .set('Authorization', authHeader())

    expect(res.status).toBe(400)
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('retorna 404 si la tarea no existe', async () => {
    prisma.task.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/tasks/1/add-to-today')
      .set('Authorization', authHeader())

    expect(res.status).toBe(404)
  })

  it('retorna 401 sin autenticación', async () => {
    const res = await request(app).patch('/api/tasks/1/add-to-today')
    expect(res.status).toBe(401)
  })
})

// ─── start bloqueado en backlog ───────────────────────────────────────────────

describe('PATCH /api/tasks/:id/start — bloqueado en backlog', () => {
  it('retorna 400 si la tarea está en el backlog', async () => {
    prisma.task.findFirst.mockResolvedValue(null)  // assertNoActiveTask: sin tarea activa
    prisma.task.findUnique.mockResolvedValue(makeTask({ isBacklog: true }))

    const res = await request(app)
      .patch('/api/tasks/1/start')
      .set('Authorization', authHeader())

    expect(res.status).toBe(400)
  })
})

// ─── GET /tasks/completed ─────────────────────────────────────────────────────

describe('GET /api/tasks/completed', () => {
  function makeCompleted(overrides = {}) {
    return {
      id: 1, description: 'Tarea completada', status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      startedAt:   new Date(Date.now() - 3600000).toISOString(),
      pausedMinutes: 0,
      minutesOverride: null,
      project: { id: 1, name: 'Proyecto Test' },
      workDay: { date: '2026-04-05' },
      ...overrides,
    }
  }

  it('devuelve las primeras 10 tareas con hasMore=false cuando hay menos de 11', async () => {
    const tasks = Array.from({ length: 5 }, (_, i) => makeCompleted({ id: i + 1 }))
    prisma.task.findMany.mockResolvedValue(tasks)

    const res = await request(app)
      .get('/api/tasks/completed')
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(res.body.tasks).toHaveLength(5)
    expect(res.body.hasMore).toBe(false)
  })

  it('devuelve hasMore=true cuando hay más de 10 resultados', async () => {
    // La query pide take+1 (11) para detectar si hay más
    const tasks = Array.from({ length: 11 }, (_, i) => makeCompleted({ id: i + 1 }))
    prisma.task.findMany.mockResolvedValue(tasks)

    const res = await request(app)
      .get('/api/tasks/completed')
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(res.body.tasks).toHaveLength(10)
    expect(res.body.hasMore).toBe(true)
  })

  it('pasa el filtro before a la query cuando se proporciona', async () => {
    prisma.task.findMany.mockResolvedValue([])

    await request(app)
      .get('/api/tasks/completed?skip=0&before=2026-04-05')
      .set('Authorization', authHeader())

    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workDay: { date: { lt: '2026-04-05' } },
      }),
    }))
  })

  it('retorna 401 sin autenticación', async () => {
    const res = await request(app).get('/api/tasks/completed')
    expect(res.status).toBe(401)
  })
})
