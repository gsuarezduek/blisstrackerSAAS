jest.mock('../../src/lib/prisma', () => {
  const prisma = {
    workspace:                { findUnique: jest.fn() },
    featureFlag:               { findUnique: jest.fn() },
    workspaceMember:           { findUnique: jest.fn(), findMany: jest.fn() },
    project:                   { findFirst: jest.fn() },
    projectMember:             { findUnique: jest.fn() },
    calendarEvent:             { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
    calendarEventParticipant:  { update: jest.fn(), updateMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
    notification:              { create: jest.fn(), createMany: jest.fn() },
    task:                      { findMany: jest.fn(), create: jest.fn() },
    workDay:                   { findUnique: jest.fn(), create: jest.fn() },
    taskSession:               { create: jest.fn() },
    projectMeeting:            { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    projectMeetingParticipant: { createMany: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  }
  prisma.$transaction = jest.fn((arg) => (
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg)
  ))
  return prisma
})

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1

function makeToken(userId = 1, role = 'member') {
  return `Bearer ${jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Organizador', email: 'o@bliss.ar' },
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
})

// ── POST /api/calendar/events ───────────────────────────────────────────────

describe('POST /api/calendar/events', () => {
  it('crea el evento, agrega al organizador como accepted y notifica a los invitados activos', async () => {
    prisma.workspaceMember.findMany.mockResolvedValue([{ userId: 2 }]) // solo el 2 sigue activo
    const created = {
      id: 10, workspaceId: WORKSPACE_ID, organizerId: 1, title: 'Sync semanal',
      date: '2026-09-25', startTime: '10:00', durationMins: 30, projectId: null,
      meetLink: null, notes: null, realMeetingId: null, createdAt: new Date(), updatedAt: new Date(),
      organizer: { id: 1, name: 'Organizador', avatar: 'x.png' }, project: null,
      participants: [
        { userId: 1, status: 'accepted', respondedAt: new Date(), user: { id: 1, name: 'Organizador', avatar: 'x.png' } },
        { userId: 2, status: 'pending', respondedAt: null, user: { id: 2, name: 'Invitado', avatar: 'y.png' } },
      ],
    }
    prisma.calendarEvent.create.mockResolvedValue(created)

    const res = await request(app)
      .post('/api/calendar/events')
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ title: 'Sync semanal', date: '2026-09-25', startTime: '10:00', durationMins: 30, participantIds: [2, 3] })

    expect(res.status).toBe(201)
    expect(res.body.confirmationStatus).toBe('pending')
    expect(res.body.participants).toHaveLength(2)

    // participantIds [2,3] pero solo el 2 es miembro activo -> solo se crea/notifica al 2
    const createCall = prisma.calendarEvent.create.mock.calls[0][0]
    expect(createCall.data.participants.create).toEqual([
      { workspaceId: WORKSPACE_ID, userId: 1, status: 'accepted', respondedAt: expect.any(Date) },
      { workspaceId: WORKSPACE_ID, userId: 2, status: 'pending' },
    ])
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: 2, type: 'CALENDAR_INVITE', calendarEventId: 10 })],
    })
  })

  it('rechaza fecha/hora inválidas', async () => {
    const res = await request(app)
      .post('/api/calendar/events')
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ title: 'x', date: '25-09-2026', startTime: '10:00' })
    expect(res.status).toBe(400)
  })
})

// ── POST /api/calendar/events/:id/respond ───────────────────────────────────

describe('POST /api/calendar/events/:id/respond', () => {
  function mockEvent(overrides = {}) {
    const base = {
      id: 10, workspaceId: WORKSPACE_ID, organizerId: 1, title: 'Sync', date: '2026-09-25', startTime: '10:00',
      durationMins: 30, projectId: null, meetLink: null, notes: null, realMeetingId: null,
      createdAt: new Date(), updatedAt: new Date(), organizer: { id: 1, name: 'Organizador', avatar: 'x' }, project: null,
      participants: [
        { id: 100, userId: 1, status: 'accepted', respondedAt: new Date(), user: { id: 1, name: 'Organizador', avatar: 'x' } },
        { id: 101, userId: 2, status: 'pending', respondedAt: null, user: { id: 2, name: 'Invitado', avatar: 'y' } },
      ],
      ...overrides,
    }
    prisma.calendarEvent.findFirst.mockResolvedValue(base)
    return base
  }

  it('el invitado acepta: actualiza su participación y notifica al organizador', async () => {
    mockEvent()
    const res = await request(app)
      .post('/api/calendar/events/10/respond')
      .set('Authorization', makeToken(2))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ status: 'accepted' })

    expect(res.status).toBe(200)
    expect(prisma.calendarEventParticipant.update).toHaveBeenCalledWith({
      where: { id: 101 },
      data:  { status: 'accepted', respondedAt: expect.any(Date) },
    })
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 1, actorId: 2, type: 'CALENDAR_RESPONSE' }),
    })
  })

  it('alguien que no fue invitado no puede responder', async () => {
    mockEvent()
    const res = await request(app)
      .post('/api/calendar/events/10/respond')
      .set('Authorization', makeToken(99))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ status: 'accepted' })
    expect(res.status).toBe(403)
  })

  it('no se puede responder una vez que la reunión real ya se inició', async () => {
    mockEvent({ realMeetingId: 55 })
    const res = await request(app)
      .post('/api/calendar/events/10/respond')
      .set('Authorization', makeToken(2))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ status: 'accepted' })
    expect(res.status).toBe(409)
  })
})

// ── DELETE /api/calendar/events/:id ─────────────────────────────────────────

describe('DELETE /api/calendar/events/:id', () => {
  it('solo el organizador puede cancelar', async () => {
    prisma.calendarEvent.findFirst.mockResolvedValue({
      id: 10, workspaceId: WORKSPACE_ID, organizerId: 1, realMeetingId: null, title: 'x', date: 'd', startTime: 't',
      participants: [{ userId: 1 }, { userId: 2 }],
    })
    const res = await request(app)
      .delete('/api/calendar/events/10')
      .set('Authorization', makeToken(2))
      .set('X-Workspace', WORKSPACE_SLUG)
    expect(res.status).toBe(403)
    expect(prisma.calendarEvent.delete).not.toHaveBeenCalled()
  })
})

// ── POST /api/calendar/events/:id/start-meeting ─────────────────────────────

describe('POST /api/calendar/events/:id/start-meeting', () => {
  it('crea la ProjectMeeting real solo con los participantes accepted y la vincula al evento', async () => {
    mockWorkspace('admin') // canWrite() necesita admin/owner (o ProjectMember) para iniciar la reunión real
    prisma.calendarEvent.findFirst.mockResolvedValue({
      id: 10, workspaceId: WORKSPACE_ID, organizerId: 1, title: 'Kickoff', date: '2026-09-25', startTime: '10:00',
      durationMins: 30, projectId: 7, meetLink: null, notes: null, realMeetingId: null,
      createdAt: new Date(), updatedAt: new Date(), organizer: { id: 1, name: 'Organizador', avatar: 'x' },
      project: { id: 7, name: 'Proyecto X' },
      participants: [
        { userId: 1, status: 'accepted', respondedAt: new Date(), user: { id: 1, name: 'Organizador', avatar: 'x' } },
        { userId: 2, status: 'accepted', respondedAt: new Date(), user: { id: 2, name: 'Invitado', avatar: 'y' } },
        { userId: 3, status: 'pending',  respondedAt: null,       user: { id: 3, name: 'SinResponder', avatar: 'z' } },
      ],
    })
    prisma.projectMeeting.create.mockResolvedValue({ id: 500, projectId: 7, workspaceId: WORKSPACE_ID, type: 'internal', title: 'Kickoff' })
    prisma.projectMeetingParticipant.findMany.mockResolvedValue([
      { id: 1, meetingId: 500, workspaceId: WORKSPACE_ID, userId: 1, taskId: null },
      { id: 2, meetingId: 500, workspaceId: WORKSPACE_ID, userId: 2, taskId: null },
    ])
    prisma.task.findMany.mockResolvedValue([]) // nadie tiene tarea IN_PROGRESS
    prisma.workDay.findUnique.mockResolvedValue({ id: 900, userId: 1, workspaceId: WORKSPACE_ID, date: '2026-09-17' })
    prisma.task.create.mockResolvedValue({ id: 700 })
    prisma.projectMeetingParticipant.update.mockResolvedValue({})

    const res = await request(app)
      .post('/api/calendar/events/10/start-meeting')
      .set('Authorization', makeToken(1, 'admin'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.meetingId).toBe(500)
    // Solo los 2 accepted (no el pending) se llevan a la reunión real.
    expect(prisma.projectMeetingParticipant.createMany).toHaveBeenCalledWith({
      data: [
        { meetingId: 500, workspaceId: WORKSPACE_ID, userId: 1 },
        { meetingId: 500, workspaceId: WORKSPACE_ID, userId: 2 },
      ],
      skipDuplicates: true,
    })
    expect(prisma.calendarEvent.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { realMeetingId: 500 } })
  })

  it('sin proyecto asociado, devuelve 400', async () => {
    prisma.calendarEvent.findFirst.mockResolvedValue({
      id: 10, workspaceId: WORKSPACE_ID, organizerId: 1, projectId: null, realMeetingId: null,
      participants: [{ userId: 1, status: 'accepted' }],
    })
    const res = await request(app)
      .post('/api/calendar/events/10/start-meeting')
      .set('Authorization', makeToken(1, 'admin'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({})
    expect(res.status).toBe(400)
  })
})
