// Una tarea arrastrada de días anteriores sigue colgada del WorkDay del día en que se
// creó, y el resumen del Dashboard ("N completadas · Xh registradas") se arma por
// workDayId: `tasks` (jornada de hoy) + `carryOverTasks` (solo las ABIERTAS de días
// previos). Sin re-alojarla, la tarea de ayer que se trabaja y se completa hoy se cae de
// las dos listas y el día no la cuenta. Ver lib/workDay.js#rehomeToTodayData.

jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  task:        { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  taskSession: { create: jest.fn(), updateMany: jest.fn() },
  workDay:     { findUnique: jest.fn(), create: jest.fn() },
  taskFollow:     { findMany: jest.fn() },
  projectMember:  { findMany: jest.fn() },
  notification:   { createMany: jest.fn() },
  eOSTodo:              { updateMany: jest.fn() },
  projectMeetingTodo:   { updateMany: jest.fn() },
  financeTask:          { updateMany: jest.fn() },
  leadAction:           { updateMany: jest.fn(), findUnique: jest.fn() },
  calendarEventParticipant:   { findUnique: jest.fn() },
  projectMeetingParticipant:  { findUnique: jest.fn() },
  $transaction: jest.fn(ops => Promise.all(ops)),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const TZ             = 'America/Argentina/Buenos_Aires'
const TODAY          = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
const YESTERDAY      = new Date(Date.now() - 864e5).toLocaleDateString('en-CA', { timeZone: TZ })
const TODAY_WORKDAY  = { id: 77, userId: 1, workspaceId: WORKSPACE_ID, date: TODAY }

function authHeader(userId = 1) {
  return `Bearer ${jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role: 'member', isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )}`
}

// `prisma.task.findFirst` lo usan dos consultas distintas por request: la búsqueda de
// ESTA tarea (por id) y el assertNoActiveTask de "ya tenés una en curso" (por estado, sin
// id). Devolver lo mismo a las dos haría que toda acción choque con un 409.
function mockTaskLookup(task) {
  prisma.task.findFirst.mockImplementation(({ where }) =>
    Promise.resolve(where.id == null && where.status === 'IN_PROGRESS' ? null : task))
}

function makeTask(overrides = {}) {
  return {
    id: 1, userId: 1, projectId: 1, status: 'PENDING', isBacklog: false, isAgentTask: false,
    agentId: null, createdById: 1, contentPieceId: null, contentPiece: null,
    description: 'Tarea arrastrada', pausedAt: null, pausedMinutes: 0,
    project: { id: 1, name: 'Proyecto Test' }, createdBy: null, _count: { comments: 0 },
    workDay: { date: YESTERDAY },
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss', timezone: TZ,
    members: [{ workspaceId: WORKSPACE_ID, userId: 1, role: 'member', active: true }],
  })
  prisma.workDay.findUnique.mockResolvedValue(TODAY_WORKDAY)
  prisma.task.update.mockImplementation(({ data }) => Promise.resolve(makeTask({ ...data, workDay: undefined })))
  prisma.taskSession.create.mockResolvedValue({})
  prisma.taskSession.updateMany.mockResolvedValue({ count: 0 })
  // Sin seguidores ni equipo: la acción no dispara notificaciones (no es lo que se prueba acá).
  prisma.taskFollow.findMany.mockResolvedValue([])
  prisma.projectMember.findMany.mockResolvedValue([])
  prisma.calendarEventParticipant.findUnique.mockResolvedValue(null)
  prisma.projectMeetingParticipant.findUnique.mockResolvedValue(null)
  prisma.leadAction.findUnique.mockResolvedValue(null)
  for (const m of ['eOSTodo', 'projectMeetingTodo', 'financeTask', 'leadAction']) {
    prisma[m].updateMany.mockResolvedValue({ count: 0 })
  }
})

function patch(path) {
  return request(app).patch(path).set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)
}

const updateData = () => prisma.task.update.mock.calls[0][0].data

describe('Re-alojar en la jornada de hoy la tarea arrastrada de días anteriores', () => {
  it('iniciar una PENDING de ayer la pasa al workday de hoy', async () => {
    mockTaskLookup(makeTask({ status: 'PENDING' }))

    const res = await patch('/api/tasks/1/start')

    expect(res.status).toBe(200)
    expect(updateData()).toMatchObject({ status: 'IN_PROGRESS', workDayId: TODAY_WORKDAY.id })
  })

  it('retomar una PAUSED de ayer la pasa al workday de hoy', async () => {
    mockTaskLookup(makeTask({ status: 'PAUSED', pausedAt: new Date() }))

    const res = await patch('/api/tasks/1/resume')

    expect(res.status).toBe(200)
    expect(updateData()).toMatchObject({ status: 'IN_PROGRESS', workDayId: TODAY_WORKDAY.id })
  })

  it('desbloquear una BLOCKED de ayer la pasa al workday de hoy', async () => {
    mockTaskLookup(makeTask({ status: 'BLOCKED', pausedAt: new Date() }))

    const res = await patch('/api/tasks/1/unblock')

    expect(res.status).toBe(200)
    expect(updateData()).toMatchObject({ status: 'IN_PROGRESS', workDayId: TODAY_WORKDAY.id })
  })

  it('completar una IN_PROGRESS que quedó de ayer la cierra en el día de hoy', async () => {
    mockTaskLookup(makeTask({ status: 'IN_PROGRESS' }))

    const res = await patch('/api/tasks/1/complete')

    expect(res.status).toBe(200)
    expect(updateData()).toMatchObject({ status: 'COMPLETED', workDayId: TODAY_WORKDAY.id })
  })

  it('crea la jornada de hoy si la persona todavía no la abrió', async () => {
    mockTaskLookup(makeTask({ status: 'PENDING' }))
    prisma.workDay.findUnique.mockResolvedValue(null)
    prisma.workDay.create.mockResolvedValue(TODAY_WORKDAY)

    const res = await patch('/api/tasks/1/start')

    expect(res.status).toBe(200)
    expect(prisma.workDay.create).toHaveBeenCalledWith({
      data: { userId: 1, workspaceId: WORKSPACE_ID, date: TODAY },
    })
    expect(updateData()).toMatchObject({ workDayId: TODAY_WORKDAY.id })
  })

  it('no toca el workday de una tarea que ya es de hoy', async () => {
    mockTaskLookup(makeTask({ status: 'PENDING', workDay: { date: TODAY } }))

    const res = await patch('/api/tasks/1/start')

    expect(res.status).toBe(200)
    expect(updateData()).not.toHaveProperty('workDayId')
    expect(prisma.workDay.findUnique).not.toHaveBeenCalled()
    expect(prisma.workDay.create).not.toHaveBeenCalled()
  })

  it('no re-aloja una tarea de agente (abriría una jornada que la persona no abrió)', async () => {
    mockTaskLookup(makeTask({ status: 'PENDING', isAgentTask: true, agentId: 5 }))

    const res = await patch('/api/tasks/1/start')

    expect(res.status).toBe(200)
    expect(updateData()).not.toHaveProperty('workDayId')
    expect(prisma.workDay.create).not.toHaveBeenCalled()
  })
})
