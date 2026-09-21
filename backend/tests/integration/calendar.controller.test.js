jest.mock('../../src/lib/prisma', () => {
  const prisma = {
    workspace:                { findUnique: jest.fn() },
    featureFlag:               { findUnique: jest.fn() },
    workspaceMember:           { findUnique: jest.fn(), findMany: jest.fn() },
    project:                   { findFirst: jest.fn() },
    projectMember:             { findUnique: jest.fn() },
    calendarEvent:             { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
    calendarEventParticipant:  { update: jest.fn(), updateMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
    calendarEventRecurrence:   { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    calendarEventException:    { findMany: jest.fn(), upsert: jest.fn() },
    notification:              { create: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
    task:                      { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
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
  // Sin series recurrentes por default — los tests que las necesitan lo pisan.
  prisma.calendarEventRecurrence.findMany.mockResolvedValue([])
})

// ── POST /api/calendar/events ───────────────────────────────────────────────

describe('POST /api/calendar/events', () => {
  it('crea el evento, agrega al organizador como accepted y notifica a los invitados activos', async () => {
    prisma.workspaceMember.findMany.mockResolvedValue([{ userId: 2 }]) // solo el 2 sigue activo
    prisma.project.findFirst.mockResolvedValue({ id: 7 })
    const created = {
      id: 10, workspaceId: WORKSPACE_ID, organizerId: 1, title: 'Sync semanal',
      date: '2026-09-25', startTime: '10:00', durationMins: 30, projectId: 7,
      meetLink: null, notes: null, realMeetingId: null, createdAt: new Date(), updatedAt: new Date(),
      organizer: { id: 1, name: 'Organizador', avatar: 'x.png' }, project: { id: 7, name: 'Proyecto X' },
      participants: [
        { id: 1000, userId: 1, status: 'accepted', respondedAt: new Date(), taskId: null, user: { id: 1, name: 'Organizador', avatar: 'x.png' } },
        { id: 1001, userId: 2, status: 'pending', respondedAt: null, taskId: null, user: { id: 2, name: 'Invitado', avatar: 'y.png' } },
      ],
    }
    prisma.calendarEvent.create.mockResolvedValue(created)
    // Task "reserva" del organizador (queda accepted desde la creación) — el
    // workDay de "hoy" ya existe, ensureWorkDay solo lo busca.
    prisma.workDay.findUnique.mockResolvedValue({ id: 900, userId: 1, workspaceId: WORKSPACE_ID })
    prisma.task.create.mockResolvedValue({ id: 701 })
    // Reload final (loadEvent) tras vincular la tarea del organizador.
    prisma.calendarEvent.findFirst.mockResolvedValue({
      ...created,
      participants: [
        { ...created.participants[0], taskId: 701 },
        created.participants[1],
      ],
    })

    const res = await request(app)
      .post('/api/calendar/events')
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ title: 'Sync semanal', date: '2026-09-25', startTime: '10:00', durationMins: 30, projectId: 7, participantIds: [2, 3] })

    expect(res.status).toBe(201)
    expect(res.body.confirmationStatus).toBe('pending')
    expect(res.body.participants).toHaveLength(2)
    // El organizador (accepted) ya tiene su tarea "reserva" vinculada.
    expect(res.body.participants.find(p => p.userId === 1).taskId).toBe(701)

    // participantIds [2,3] pero solo el 2 es miembro activo -> solo se crea/notifica al 2
    const createCall = prisma.calendarEvent.create.mock.calls[0][0]
    expect(createCall.data.participants.create).toEqual([
      { workspaceId: WORKSPACE_ID, userId: 1, status: 'accepted', respondedAt: expect.any(Date) },
      { workspaceId: WORKSPACE_ID, userId: 2, status: 'pending' },
    ])
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: 2, type: 'CALENDAR_INVITE', calendarEventId: 10 })],
    })
    // Tarea "reserva" del organizador: el evento (2026-09-25) es a futuro -> scheduledFor con esa fecha.
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: 'Sync semanal', projectId: 7, userId: 1, workDayId: 900,
        scheduledFor: '2026-09-25', scheduledTime: '10:00', scheduledDurationMins: 30,
      }),
    })
    expect(prisma.calendarEventParticipant.update).toHaveBeenCalledWith({ where: { id: 1000 }, data: { taskId: 701 } })
  })

  it('rechaza fecha/hora inválidas', async () => {
    const res = await request(app)
      .post('/api/calendar/events')
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ title: 'x', date: '25-09-2026', startTime: '10:00' })
    expect(res.status).toBe(400)
  })

  it('sin proyecto, devuelve 400', async () => {
    const res = await request(app)
      .post('/api/calendar/events')
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ title: 'x', date: '2026-09-25', startTime: '10:00' })
    expect(res.status).toBe(400)
    expect(prisma.calendarEvent.create).not.toHaveBeenCalled()
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

  it('acepta con proyecto: crea la tarea "reserva" en el dashboard y la vincula', async () => {
    mockEvent({ projectId: 7, project: { id: 7, name: 'Proyecto X' } })
    prisma.workDay.findUnique.mockResolvedValue({ id: 900, userId: 2, workspaceId: WORKSPACE_ID })
    prisma.task.create.mockResolvedValue({ id: 800 })

    const res = await request(app)
      .post('/api/calendar/events/10/respond')
      .set('Authorization', makeToken(2))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ status: 'accepted' })

    expect(res.status).toBe(200)
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: 'Sync', projectId: 7, userId: 2, workDayId: 900,
        scheduledFor: '2026-09-25', scheduledTime: '10:00', scheduledDurationMins: 30,
        createdById: 1, // organizador != invitado -> queda como quien la delegó
      }),
    })
    expect(prisma.calendarEventParticipant.update).toHaveBeenCalledWith({ where: { id: 101 }, data: { taskId: 800 } })
  })

  it('rechaza: borra la tarea "reserva" si todavía estaba PENDING', async () => {
    mockEvent({
      projectId: 7,
      participants: [
        { id: 100, userId: 1, status: 'accepted', respondedAt: new Date(), user: { id: 1, name: 'Organizador', avatar: 'x' } },
        { id: 101, userId: 2, status: 'accepted', respondedAt: new Date(), taskId: 800, user: { id: 2, name: 'Invitado', avatar: 'y' } },
      ],
    })
    prisma.task.findUnique.mockResolvedValue({ id: 800, status: 'PENDING' })

    const res = await request(app)
      .post('/api/calendar/events/10/respond')
      .set('Authorization', makeToken(2))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ status: 'declined' })

    expect(res.status).toBe(200)
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { taskId: 800 } })
    expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: 800 } })
  })

  it('rechaza: NO toca la tarea si ya la había empezado', async () => {
    mockEvent({
      projectId: 7,
      participants: [
        { id: 100, userId: 1, status: 'accepted', respondedAt: new Date(), user: { id: 1, name: 'Organizador', avatar: 'x' } },
        { id: 101, userId: 2, status: 'accepted', respondedAt: new Date(), taskId: 800, user: { id: 2, name: 'Invitado', avatar: 'y' } },
      ],
    })
    prisma.task.findUnique.mockResolvedValue({ id: 800, status: 'IN_PROGRESS' })

    const res = await request(app)
      .post('/api/calendar/events/10/respond')
      .set('Authorization', makeToken(2))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ status: 'declined' })

    expect(res.status).toBe(200)
    expect(prisma.task.delete).not.toHaveBeenCalled()
  })
})

// ── POST /api/calendar/events/:id/respond — serie recurrente ───────────────
// Aceptar una ocurrencia acepta automáticamente toda la serie; rechazar sigue
// siendo por ocurrencia salvo que se pida ?scope=series.

describe('POST /api/calendar/events/:id/respond — serie recurrente', () => {
  function occurrence(id, date, invitedStatus) {
    return {
      id, workspaceId: WORKSPACE_ID, organizerId: 1, title: 'EOS', date, startTime: '09:00',
      durationMins: 30, projectId: 7, meetLink: null, notes: null, realMeetingId: null, recurrenceId: 50,
      createdAt: new Date(), updatedAt: new Date(), organizer: { id: 1, name: 'Organizador', avatar: 'x' }, project: { id: 7, name: 'Proyecto' },
      participants: [
        { id: id * 10, userId: 1, status: 'accepted', respondedAt: new Date(), user: { id: 1, name: 'Organizador', avatar: 'x' } },
        { id: id * 10 + 1, userId: 2, status: invitedStatus, respondedAt: null, user: { id: 2, name: 'Invitado', avatar: 'y' } },
      ],
    }
  }

  it('aceptar una ocurrencia acepta automáticamente las demás ya materializadas de la serie', async () => {
    const occ1 = occurrence(10, '2026-09-28', 'pending')
    const occ2 = occurrence(11, '2026-10-05', 'pending')
    prisma.calendarEvent.findFirst.mockImplementation(({ where }) => Promise.resolve([occ1, occ2].find(o => o.id === where.id) || null))
    prisma.calendarEventRecurrence.findFirst.mockResolvedValue({ id: 50, workspaceId: WORKSPACE_ID, organizerId: 1, autoAcceptUserIds: '[]' })
    prisma.calendarEvent.findMany.mockResolvedValue([{ id: 10 }, { id: 11 }])
    prisma.workDay.findUnique.mockResolvedValue({ id: 900, userId: 2, workspaceId: WORKSPACE_ID })
    prisma.task.create.mockResolvedValue({ id: 800 })

    const res = await request(app)
      .post('/api/calendar/events/10/respond')
      .set('Authorization', makeToken(2))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ status: 'accepted' })

    expect(res.status).toBe(200)
    expect(prisma.calendarEventRecurrence.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data:  { autoAcceptUserIds: JSON.stringify([2]) },
    })
    expect(prisma.calendarEventParticipant.update).toHaveBeenCalledWith({ where: { id: 101 }, data: { status: 'accepted', respondedAt: expect.any(Date) } })
    expect(prisma.calendarEventParticipant.update).toHaveBeenCalledWith({ where: { id: 111 }, data: { status: 'accepted', respondedAt: expect.any(Date) } })
  })

  it('aceptar no vuelve a tocar una ocurrencia que ya estaba accepted', async () => {
    const occ1 = occurrence(10, '2026-09-28', 'pending')
    const occ2 = occurrence(11, '2026-10-05', 'accepted')
    prisma.calendarEvent.findFirst.mockImplementation(({ where }) => Promise.resolve([occ1, occ2].find(o => o.id === where.id) || null))
    prisma.calendarEventRecurrence.findFirst.mockResolvedValue({ id: 50, workspaceId: WORKSPACE_ID, organizerId: 1, autoAcceptUserIds: '[]' })
    prisma.calendarEvent.findMany.mockResolvedValue([{ id: 10 }, { id: 11 }])
    prisma.workDay.findUnique.mockResolvedValue({ id: 900, userId: 2, workspaceId: WORKSPACE_ID })
    prisma.task.create.mockResolvedValue({ id: 800 })

    const res = await request(app)
      .post('/api/calendar/events/10/respond')
      .set('Authorization', makeToken(2))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ status: 'accepted' })

    expect(res.status).toBe(200)
    expect(prisma.calendarEventParticipant.update).toHaveBeenCalledWith({ where: { id: 101 }, data: { status: 'accepted', respondedAt: expect.any(Date) } })
    expect(prisma.calendarEventParticipant.update).not.toHaveBeenCalledWith({ where: { id: 111 }, data: expect.anything() })
  })

  it('rechazar sin scope solo afecta la ocurrencia abierta', async () => {
    const occ1 = occurrence(10, '2026-09-28', 'accepted')
    prisma.calendarEvent.findFirst.mockResolvedValue(occ1)
    prisma.task.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/calendar/events/10/respond')
      .set('Authorization', makeToken(2))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ status: 'declined' })

    expect(res.status).toBe(200)
    expect(prisma.calendarEventRecurrence.findFirst).not.toHaveBeenCalled()
    expect(prisma.calendarEventParticipant.update).toHaveBeenCalledWith({ where: { id: 101 }, data: { status: 'declined', respondedAt: expect.any(Date) } })
  })

  it('rechazar con ?scope=series declina esta y las siguientes, y saca al usuario de autoAcceptUserIds', async () => {
    const occ1 = occurrence(10, '2026-09-28', 'accepted')
    const occ2 = occurrence(11, '2026-10-05', 'accepted')
    prisma.calendarEvent.findFirst.mockImplementation(({ where }) => Promise.resolve([occ1, occ2].find(o => o.id === where.id) || null))
    prisma.calendarEventRecurrence.findFirst.mockResolvedValue({ id: 50, workspaceId: WORKSPACE_ID, organizerId: 1, autoAcceptUserIds: JSON.stringify([2]) })
    prisma.calendarEvent.findMany.mockResolvedValue([{ id: 10 }, { id: 11 }])
    prisma.task.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/calendar/events/10/respond?scope=series')
      .set('Authorization', makeToken(2))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ status: 'declined' })

    expect(res.status).toBe(200)
    expect(prisma.calendarEventRecurrence.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data:  { autoAcceptUserIds: '[]' },
    })
    expect(prisma.calendarEventParticipant.update).toHaveBeenCalledWith({ where: { id: 101 }, data: { status: 'declined', respondedAt: expect.any(Date) } })
    expect(prisma.calendarEventParticipant.update).toHaveBeenCalledWith({ where: { id: 111 }, data: { status: 'declined', respondedAt: expect.any(Date) } })
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

  it('cancelar borra las tareas "reserva" de los participantes que seguían PENDING', async () => {
    prisma.calendarEvent.findFirst.mockResolvedValue({
      id: 10, workspaceId: WORKSPACE_ID, organizerId: 1, realMeetingId: null, title: 'x', date: '2026-09-25', startTime: '10:00',
      participants: [
        { userId: 1, taskId: 700 }, // organizador, tarea aún pendiente
        { userId: 2, taskId: 800 }, // invitado, ya la había empezado
        { userId: 3, taskId: null }, // nunca aceptó, no tiene tarea
      ],
    })
    prisma.task.findUnique
      .mockResolvedValueOnce({ id: 700, status: 'PENDING' })
      .mockResolvedValueOnce({ id: 800, status: 'IN_PROGRESS' })

    const res = await request(app)
      .delete('/api/calendar/events/10')
      .set('Authorization', makeToken(1))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(prisma.task.delete).toHaveBeenCalledTimes(1)
    expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: 700 } })
    expect(prisma.calendarEvent.delete).toHaveBeenCalledWith({ where: { id: 10 } })
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

// ── POST /api/calendar/events con recurrence (serie) ────────────────────────

describe('POST /api/calendar/events — serie recurrente', () => {
  it('crea la CalendarEventRecurrence y materializa la primera ocurrencia', async () => {
    prisma.workspaceMember.findMany.mockResolvedValue([{ userId: 2 }])
    prisma.project.findFirst.mockResolvedValue({ id: 7 })
    prisma.calendarEventRecurrence.create.mockResolvedValue({
      id: 50, workspaceId: WORKSPACE_ID, organizerId: 1, projectId: 7,
      title: 'Standup diario', meetLink: null, notes: null, startTime: '09:00', durationMins: 15,
      participantIds: JSON.stringify([2]), frequency: 'daily', weekdays: '[]', dayOfMonth: null, month: null,
      startDate: '2026-09-25', endDate: null, active: true,
    })
    prisma.calendarEvent.create.mockResolvedValue({
      id: 900, workspaceId: WORKSPACE_ID, organizerId: 1, title: 'Standup diario',
      date: '2026-09-25', startTime: '09:00', durationMins: 15, projectId: 7, recurrenceId: 50,
      meetLink: null, notes: null, realMeetingId: null, createdAt: new Date(), updatedAt: new Date(),
      organizer: { id: 1, name: 'Organizador', avatar: 'x' }, project: { id: 7, name: 'Proyecto X' },
      participants: [
        { id: 2000, userId: 1, status: 'accepted', respondedAt: new Date(), taskId: null, user: { id: 1, name: 'Organizador', avatar: 'x' } },
        { id: 2001, userId: 2, status: 'pending', respondedAt: null, taskId: null, user: { id: 2, name: 'Invitado', avatar: 'y' } },
      ],
    })
    prisma.workDay.findUnique.mockResolvedValue({ id: 900, userId: 1, workspaceId: WORKSPACE_ID })
    prisma.task.create.mockResolvedValue({ id: 701 })

    const res = await request(app)
      .post('/api/calendar/events')
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({
        title: 'Standup diario', date: '2026-09-25', startTime: '09:00', durationMins: 15, projectId: 7,
        participantIds: [2], recurrence: { frequency: 'daily' },
      })

    expect(res.status).toBe(201)
    expect(prisma.calendarEventRecurrence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: WORKSPACE_ID, organizerId: 1, projectId: 7, title: 'Standup diario',
        startTime: '09:00', durationMins: 15, participantIds: JSON.stringify([2]),
        frequency: 'daily', startDate: '2026-09-25', endDate: null,
      }),
    })
    // Primera ocurrencia materializada de una — mismo criterio de creación que un evento suelto.
    expect(prisma.calendarEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ recurrenceId: 50, date: '2026-09-25' }),
      include: expect.any(Object),
    })
    expect(res.body.recurrence).toEqual(expect.objectContaining({ id: 50, frequency: 'daily' }))
    expect(res.body.event).toEqual(expect.objectContaining({ id: 900, recurrenceId: 50 }))
  })

  it('frecuencia inválida devuelve 400 y no crea nada', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: 7 })
    const res = await request(app)
      .post('/api/calendar/events')
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({
        title: 'x', date: '2026-09-25', startTime: '09:00', projectId: 7,
        recurrence: { frequency: 'hourly' },
      })
    expect(res.status).toBe(400)
    expect(prisma.calendarEventRecurrence.create).not.toHaveBeenCalled()
  })
})

// ── GET /api/calendar/events — materialización perezosa de series ───────────

describe('GET /api/calendar/events', () => {
  it('materializa la ocurrencia del día pedido si la serie no tiene una fila todavía', async () => {
    const rec = {
      id: 50, workspaceId: WORKSPACE_ID, organizerId: 1, projectId: 7,
      title: 'Standup', meetLink: null, notes: null, startTime: '09:00', durationMins: 15,
      participantIds: JSON.stringify([2]), frequency: 'daily', weekdays: '[]', dayOfMonth: null, month: null,
      startDate: '2026-09-20', endDate: null, active: true,
    }
    prisma.calendarEventRecurrence.findMany.mockResolvedValueOnce([rec])
    prisma.calendarEventException.findMany.mockResolvedValueOnce([])
    prisma.workspaceMember.findMany.mockResolvedValue([{ userId: 2 }])

    const materialized = {
      id: 901, workspaceId: WORKSPACE_ID, organizerId: 1, title: 'Standup',
      date: '2026-09-21', startTime: '09:00', durationMins: 15, projectId: 7, recurrenceId: 50,
      meetLink: null, notes: null, realMeetingId: null, createdAt: new Date(), updatedAt: new Date(),
      organizer: { id: 1, name: 'Organizador', avatar: 'x' }, project: { id: 7, name: 'Proyecto X' },
      participants: [
        { id: 3000, userId: 1, status: 'accepted', respondedAt: new Date(), taskId: null, user: { id: 1, name: 'Organizador', avatar: 'x' } },
        { id: 3001, userId: 2, status: 'pending', respondedAt: null, taskId: null, user: { id: 2, name: 'Invitado', avatar: 'y' } },
      ],
    }
    prisma.workDay.findUnique.mockResolvedValue({ id: 900, userId: 1, workspaceId: WORKSPACE_ID })
    prisma.task.create.mockResolvedValue({ id: 701 })

    // 1ª llamada a calendarEvent.findMany: chequeo de "ya materializado" (ninguna
    // fila) dentro de ensureOccurrences. 2ª: la query real de listEvents.
    prisma.calendarEvent.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([materialized])
    prisma.calendarEvent.create.mockResolvedValue(materialized)

    const res = await request(app)
      .get('/api/calendar/events')
      .query({ from: '2026-09-21', to: '2026-09-21' })
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(prisma.calendarEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ recurrenceId: 50, date: '2026-09-21' }),
      include: expect.any(Object),
    })
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toEqual(expect.objectContaining({ id: 901, recurrenceId: 50 }))
  })

  it('no vuelve a materializar una fecha con excepción (borrada "solo esta")', async () => {
    const rec = {
      id: 50, workspaceId: WORKSPACE_ID, organizerId: 1, projectId: 7,
      title: 'Standup', meetLink: null, notes: null, startTime: '09:00', durationMins: 15,
      participantIds: '[]', frequency: 'daily', weekdays: '[]', dayOfMonth: null, month: null,
      startDate: '2026-09-20', endDate: null, active: true,
    }
    prisma.calendarEventRecurrence.findMany.mockResolvedValueOnce([rec])
    prisma.calendarEventException.findMany.mockResolvedValueOnce([{ date: '2026-09-21' }])
    prisma.calendarEvent.findMany
      .mockResolvedValueOnce([]) // nada materializado todavía
      .mockResolvedValueOnce([]) // query real de listEvents: sigue vacía

    const res = await request(app)
      .get('/api/calendar/events')
      .query({ from: '2026-09-21', to: '2026-09-21' })
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(prisma.calendarEvent.create).not.toHaveBeenCalled()
  })
})

// ── DELETE /api/calendar/events/:id?scope=series ─────────────────────────────

describe('DELETE /api/calendar/events/:id?scope=series', () => {
  it('cancela esta ocurrencia y las siguientes ya materializadas, y corta la serie ahí', async () => {
    prisma.calendarEvent.findFirst.mockResolvedValue({
      id: 10, workspaceId: WORKSPACE_ID, organizerId: 1, realMeetingId: null, recurrenceId: 50,
      title: 'Standup', date: '2026-09-25', startTime: '09:00',
      participants: [{ userId: 1, taskId: null }, { userId: 2, taskId: null }],
    })
    prisma.calendarEventRecurrence.findFirst.mockResolvedValue({
      id: 50, workspaceId: WORKSPACE_ID, organizerId: 1, startDate: '2026-09-18',
    })
    prisma.calendarEvent.findMany.mockResolvedValue([
      {
        id: 10, date: '2026-09-25', title: 'Standup', startTime: '09:00',
        participants: [{ userId: 1, taskId: null }, { userId: 2, taskId: null }],
      },
      {
        id: 11, date: '2026-10-02', title: 'Standup', startTime: '09:00',
        participants: [{ userId: 1, taskId: null }, { userId: 2, taskId: null }],
      },
    ])

    const res = await request(app)
      .delete('/api/calendar/events/10')
      .query({ scope: 'series' })
      .set('Authorization', makeToken(1))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.seriesEnded).toBe(true)
    expect(prisma.calendarEvent.delete).toHaveBeenCalledWith({ where: { id: 10 } })
    expect(prisma.calendarEvent.delete).toHaveBeenCalledWith({ where: { id: 11 } })
    // La ocurrencia borrada (25/9) no era la primera de la serie (18/9) -> la
    // serie se corta el día anterior, no se desactiva por completo.
    expect(prisma.calendarEventRecurrence.update).toHaveBeenCalledWith({
      where: { id: 50 }, data: { endDate: '2026-09-24' },
    })
  })
})

// ── PATCH /api/calendar/events/:id — ocurrencias de una serie ───────────────

describe('PATCH /api/calendar/events/:id — serie recurrente', () => {
  function mockOccurrence(overrides = {}) {
    return {
      id: 10, workspaceId: WORKSPACE_ID, organizerId: 1, realMeetingId: null, recurrenceId: 50,
      title: 'Standup', date: '2026-09-25', startTime: '09:00', durationMins: 15, projectId: 7,
      meetLink: null, notes: null, createdAt: new Date(), updatedAt: new Date(),
      organizer: { id: 1, name: 'Organizador', avatar: 'x' }, project: { id: 7, name: 'Proyecto X' },
      participants: [
        { id: 100, userId: 1, status: 'accepted', respondedAt: new Date(), taskId: null, user: { id: 1, name: 'Organizador', avatar: 'x' } },
      ],
      ...overrides,
    }
  }

  it('rechaza mover la fecha de una sola ocurrencia de la serie', async () => {
    prisma.calendarEvent.findFirst.mockResolvedValue(mockOccurrence())
    const res = await request(app)
      .patch('/api/calendar/events/10')
      .set('Authorization', makeToken(1))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ date: '2026-09-26' })
    expect(res.status).toBe(400)
    expect(prisma.calendarEvent.update).not.toHaveBeenCalled()
  })

  it('?scope=series edita la plantilla + las ocurrencias futuras ya materializadas, no las pasadas', async () => {
    prisma.calendarEvent.findFirst.mockResolvedValue(mockOccurrence())
    prisma.calendarEventRecurrence.findFirst.mockResolvedValue({
      id: 50, workspaceId: WORKSPACE_ID, organizerId: 1, startTime: '09:00', durationMins: 15, projectId: 7,
    })
    prisma.calendarEventRecurrence.findUnique.mockResolvedValue({
      id: 50, title: 'Standup renombrado', projectId: 7, startTime: '09:30', durationMins: 15,
      meetLink: null, notes: null, participantIds: '[]', frequency: 'daily', weekdays: '[]',
      dayOfMonth: null, month: null, startDate: '2026-09-18', endDate: null, active: true,
    })
    // Solo la de hoy (>= 25/9) se toca — una anterior (18/9) no aparece acá porque
    // el where de la serie ya filtra date >= existing.date.
    prisma.calendarEvent.findMany.mockResolvedValue([{ id: 10 }])

    const res = await request(app)
      .patch('/api/calendar/events/10')
      .query({ scope: 'series' })
      .set('Authorization', makeToken(1))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ title: 'Standup renombrado', startTime: '09:30' })

    expect(res.status).toBe(200)
    expect(prisma.calendarEventRecurrence.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data: { title: 'Standup renombrado', startTime: '09:30' },
    })
    expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith({
      where: { recurrenceId: 50, date: { gte: '2026-09-25' }, realMeetingId: null },
      select: { id: true },
    })
    expect(prisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { title: 'Standup renombrado', startTime: '09:30' },
    })
  })
})
