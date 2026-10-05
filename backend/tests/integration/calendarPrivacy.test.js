jest.mock('../../src/lib/prisma', () => {
  const prisma = {
    workspace:                { findUnique: jest.fn() },
    featureFlag:               { findUnique: jest.fn() },
    workspaceMember:           { findUnique: jest.fn(), findMany: jest.fn() },
    project:                   { findFirst: jest.fn(), findMany: jest.fn() },
    projectMember:             { findUnique: jest.fn(), findMany: jest.fn() },
    calendarEvent:             { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    calendarEventParticipant:  { createMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
    calendarEventRecurrence:   { findMany: jest.fn() },
    calendarEventException:    { findMany: jest.fn() },
    notification:              { create: jest.fn(), createMany: jest.fn() },
    task:                      { findMany: jest.fn(), create: jest.fn() },
    workDay:                   { findUnique: jest.fn(), create: jest.fn() },
    taskSession:               { create: jest.fn() },
    vacationRequest:           { findMany: jest.fn() },
  }
  prisma.$transaction = jest.fn((arg) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)))
  return prisma
})

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const PROJECT_ID     = 7

function authHeader(userId = 1, role = 'member') {
  return `Bearer ${jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )}`
}

function mockWorkspace(role = 'member') {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss', timezone: 'America/Argentina/Buenos_Aires',
    disabledFeatureKeys: '[]', moduleAccess: null,
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role, active: true })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'calendario', enabledGlobally: true, enabledWorkspaceIds: '[]' })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockWorkspace('member')
  prisma.calendarEventRecurrence.findMany.mockResolvedValue([])
  prisma.calendarEventException.findMany.mockResolvedValue([])
  prisma.vacationRequest.findMany.mockResolvedValue([])
})

describe('GET /api/calendar/events?projectId= — proyecto privado', () => {
  it('403 PROJECT_PRIVATE si el proyecto es privado y no soy del equipo', async () => {
    prisma.project.findFirst.mockResolvedValue({ isPrivate: true })
    prisma.projectMember.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .get(`/api/calendar/events?from=2027-01-01&to=2027-01-31&projectId=${PROJECT_ID}`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('PROJECT_PRIVATE')
  })

  it('200 si el proyecto es privado pero soy del equipo', async () => {
    prisma.project.findFirst.mockResolvedValue({ isPrivate: true })
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: PROJECT_ID, userId: 1 })
    prisma.calendarEvent.findMany.mockResolvedValue([])

    const res = await request(app)
      .get(`/api/calendar/events?from=2027-01-01&to=2027-01-31&projectId=${PROJECT_ID}`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
  })
})

describe('POST /api/calendar/events — proyecto privado', () => {
  const body = {
    title: 'Reunión', date: '2027-03-25', startTime: '10:00', durationMins: 30,
    projectId: PROJECT_ID, participantIds: [2, 3],
  }

  it('403 si el organizador no es del equipo ni admin', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID, isPrivate: true })
    prisma.projectMember.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/calendar/events')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send(body)

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('PROJECT_PRIVATE')
    expect(prisma.calendarEvent.create).not.toHaveBeenCalled()
  })

  it('crea el evento solo con los invitados que son del equipo o admin', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID, isPrivate: true })
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: PROJECT_ID, userId: 1 }) // organizador: sí es del equipo
    prisma.workspaceMember.findMany
      .mockResolvedValueOnce([{ userId: 2 }, { userId: 3 }]) // filterActiveMembers: ambos activos
      .mockResolvedValueOnce([]) // filterEligibleForPrivateProject: ningún admin entre los invitados
    prisma.projectMember.findMany.mockResolvedValue([{ userId: 2 }]) // del equipo: solo el 2

    const created = {
      id: 10, workspaceId: WORKSPACE_ID, organizerId: 1, title: 'Reunión',
      date: '2027-03-25', startTime: '10:00', durationMins: 30, projectId: PROJECT_ID,
      meetLink: null, notes: null, realMeetingId: null, createdAt: new Date(), updatedAt: new Date(),
      organizer: { id: 1, name: 'Yo', avatar: 'x.png' }, project: { id: PROJECT_ID, name: 'Proyecto', isPrivate: true },
      participants: [{ id: 1, userId: 1, status: 'accepted', respondedAt: new Date(), taskId: null, user: { id: 1, name: 'Yo', avatar: 'x.png' } }],
    }
    prisma.calendarEvent.create.mockResolvedValue(created)
    prisma.calendarEvent.findFirst.mockResolvedValue(created)
    prisma.task.findMany.mockResolvedValue([])
    prisma.task.create.mockResolvedValue({ id: 900 })
    prisma.workDay.findUnique.mockResolvedValue({ id: 500 })
    prisma.calendarEvent.update.mockResolvedValue({})
    prisma.calendarEventParticipant.updateMany.mockResolvedValue({ count: 0 })

    const res = await request(app)
      .post('/api/calendar/events')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send(body)

    expect(res.status).toBe(201)
    expect(prisma.calendarEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        participants: expect.objectContaining({
          create: expect.arrayContaining([expect.objectContaining({ userId: 2 })]),
        }),
      }),
    }))
    // El 3 no es del equipo ni admin: no debería estar entre los invitados creados.
    const call = prisma.calendarEvent.create.mock.calls[0][0]
    const invitedIds = call.data.participants.create.map(p => p.userId)
    expect(invitedIds).not.toContain(3)
  })
})

describe('GET /api/calendar/availability — proyecto privado', () => {
  it('enmascara el bloque de un calendar_event de un proyecto privado ajeno', async () => {
    prisma.workspaceMember.findMany.mockResolvedValue([{ userId: 2, workStartTime: null, workEndTime: null }])
    prisma.vacationRequest.findMany.mockResolvedValue([])
    prisma.task.findMany.mockResolvedValue([])
    // getBusyBlocks usa prisma.calendarEventParticipant.findMany directamente.
    prisma.calendarEventParticipant.findMany.mockResolvedValue([
      {
        userId: 2, status: 'accepted', taskId: null,
        event: { id: 99, date: '2027-03-25', startTime: '09:00', durationMins: 30, title: 'Secreta', projectId: PROJECT_ID, recurrenceId: null },
      },
    ])
    prisma.project.findMany.mockResolvedValue([{ id: PROJECT_ID }]) // es privado
    prisma.projectMember.findMany.mockResolvedValue([]) // yo (userId 1) no soy del equipo de ese proyecto

    const res = await request(app)
      .get(`/api/calendar/availability?userIds=2&from=2027-03-25&to=2027-03-25`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    const block = res.body['2'].blocks[0]
    expect(block.title).toBeUndefined()
    expect(block.projectId).toBeUndefined()
    expect(block.kind).toBe('calendar_event')
  })
})
