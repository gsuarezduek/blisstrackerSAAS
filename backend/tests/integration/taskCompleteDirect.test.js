// Completar directo una tarea PENDIENTE o PAUSADA, sin pasar por "en curso" — el botón
// "Completar" del detalle de la tarea (TaskCommentsModal), pensado para cuando la buscás
// por número en Cmd+K. Ver completeTask en controllers/tasks/lifecycle.controller.js.

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
const NEXT_WEEK      = new Date(Date.now() + 7 * 864e5).toLocaleDateString('en-CA', { timeZone: TZ })
const TODAY_WORKDAY  = { id: 77, userId: 1, workspaceId: WORKSPACE_ID, date: TODAY }

function authHeader(extra = {}) {
  return `Bearer ${jwt.sign(
    { userId: 1, workspaceId: WORKSPACE_ID, role: 'member', isSuperAdmin: false, name: 'Test', email: 't@t.com', ...extra },
    SECRET,
  )}`
}

function makeTask(overrides = {}) {
  return {
    id: 1, userId: 1, projectId: 1, status: 'PENDING', isBacklog: false, isAgentTask: false,
    agentId: null, createdById: 1, contentPieceId: null, contentPiece: null, scheduledFor: null,
    description: 'Tarea', pausedAt: null, pausedMinutes: 0,
    project: { id: 1, name: 'Proyecto Test' }, createdBy: null, _count: { comments: 0 },
    workDay: { date: TODAY },
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
  prisma.taskSession.updateMany.mockResolvedValue({ count: 0 })
  prisma.taskFollow.findMany.mockResolvedValue([])
  prisma.projectMember.findMany.mockResolvedValue([])
  prisma.calendarEventParticipant.findUnique.mockResolvedValue(null)
  prisma.projectMeetingParticipant.findUnique.mockResolvedValue(null)
  prisma.leadAction.findUnique.mockResolvedValue(null)
  for (const m of ['eOSTodo', 'projectMeetingTodo', 'financeTask', 'leadAction']) {
    prisma[m].updateMany.mockResolvedValue({ count: 0 })
  }
})

function complete(body, headers = {}) {
  return request(app).patch('/api/tasks/1/complete')
    .set('Authorization', headers.auth || authHeader())
    .set('X-Workspace', WORKSPACE_SLUG)
    .send(body)
}

const updateData = () => prisma.task.update.mock.calls[0][0].data

describe('PATCH /tasks/:id/complete — completar directo', () => {
  it('una PENDIENTE se completa sin iniciarla y sin tocar la tarea en curso', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ status: 'PENDING', isBacklog: true }))

    const res = await complete()

    expect(res.status).toBe(200)
    const data = updateData()
    expect(data).toMatchObject({ status: 'COMPLETED', isBacklog: false, scheduledFor: null })
    expect(data.startedAt).toBeInstanceOf(Date)
    expect(data.minutesOverride).toBeUndefined()
    // Un solo update (esta tarea): no se pausó ninguna otra ni se consultó la activa.
    expect(prisma.task.update).toHaveBeenCalledTimes(1)
    expect(prisma.task.findFirst).toHaveBeenCalledTimes(1)
  })

  it('una PENDIENTE con duración declarada la guarda como minutesOverride', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ status: 'PENDING' }))

    const res = await complete({ minutes: 45 })

    expect(res.status).toBe(200)
    expect(updateData()).toMatchObject({ status: 'COMPLETED', minutesOverride: 45 })
  })

  it('una PAUSADA conserva lo trabajado: el tiempo desde la pausa cuenta como pausa', async () => {
    const pausedAt = new Date(Date.now() - 30 * 60000)
    prisma.task.findFirst.mockResolvedValue(makeTask({ status: 'PAUSED', pausedAt, startedAt: new Date(Date.now() - 90 * 60000) }))

    const res = await complete()

    expect(res.status).toBe(200)
    const data = updateData()
    expect(data).toMatchObject({ status: 'COMPLETED', pausedAt: null, pausedMinutes: { increment: 30 } })
    expect(data.startedAt).toBeUndefined()
  })

  it('una programada a futuro (o arrastrada) se cierra hoy y sale de Programadas', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ status: 'PENDING', scheduledFor: NEXT_WEEK, workDay: { date: YESTERDAY } }))

    const res = await complete()

    expect(res.status).toBe(200)
    expect(updateData()).toMatchObject({ scheduledFor: null, workDayId: TODAY_WORKDAY.id })
  })

  it('una BLOQUEADA hay que desbloquearla primero', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ status: 'BLOCKED' }))

    const res = await complete()

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Desbloque/)
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('una ya COMPLETADA no se vuelve a completar', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ status: 'COMPLETED' }))

    const res = await complete()

    expect(res.status).toBe(400)
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('la duración solo se acepta en una PENDIENTE, y con el tope de 24h', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ status: 'PAUSED', pausedAt: new Date() }))
    expect((await complete({ minutes: 30 })).status).toBe(400)

    prisma.task.findFirst.mockResolvedValue(makeTask({ status: 'PENDING' }))
    expect((await complete({ minutes: 1441 })).status).toBe(400)
    expect((await complete({ minutes: 'mucho' })).status).toBe(400)
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('una tarea de otra persona sigue siendo 404', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ status: 'PENDING', userId: 2 }))

    expect((await complete()).status).toBe(404)
  })

  it('vía MCP sigue exigiendo que esté en curso (el agente registra su tiempo iniciando)', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask({ status: 'PENDING', isAgentTask: true, agentId: 9 }))

    const res = await complete(undefined, { auth: authHeader({ mcpTokenId: 9 }) })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Solo se puede completar una tarea en curso.')
    expect(prisma.task.update).not.toHaveBeenCalled()
  })
})
