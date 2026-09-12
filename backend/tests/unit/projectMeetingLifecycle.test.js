jest.mock('../../src/lib/prisma', () => ({
  projectMeeting:     { findUnique: jest.fn(), update: jest.fn() },
  taskSession:        { updateMany: jest.fn() },
  task:               { updateMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  workspace:          { findUnique: jest.fn() },
  workspaceMember:    { findMany: jest.fn(), findUnique: jest.fn() },
  workDay:            { findUnique: jest.fn(), create: jest.fn() },
  projectMeetingTodo: { update: jest.fn(), findUnique: jest.fn() },
  notification:       { create: jest.fn() },
}))
jest.mock('../../src/lib/chatSystemMessage', () => ({
  SYSTEM_TYPES: { MEETING_HELD: 'MEETING_HELD' },
  postProjectSystemMessage: jest.fn().mockResolvedValue(undefined),
}))

const prisma = require('../../src/lib/prisma')
const { closeMeeting, maybeAutoFinishMeeting } = require('../../src/lib/projectMeetingLifecycle')

function makeMeeting(overrides = {}) {
  return {
    id: 1, projectId: 10, workspaceId: 1, type: 'internal', title: null,
    startedAt: new Date(Date.now() - 5 * 60000), endedAt: null,
    participants: [{ taskId: 100, task: { status: 'COMPLETED' } }, { taskId: 101, task: { status: 'COMPLETED' } }],
    ...overrides,
  }
}

describe('projectMeetingLifecycle.closeMeeting', () => {
  beforeEach(() => jest.clearAllMocks())

  it('completa las tareas colgadas y congela endedAt/durationMins', async () => {
    const meeting = makeMeeting()
    await closeMeeting(meeting, { actorName: 'Ana' })

    expect(prisma.taskSession.updateMany).toHaveBeenCalledWith({
      where: { taskId: { in: [100, 101] }, endedAt: null }, data: { endedAt: expect.any(Date) },
    })
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [100, 101] }, status: 'IN_PROGRESS' },
      data:  expect.objectContaining({ status: 'COMPLETED' }),
    })
    expect(prisma.projectMeeting.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data:  expect.objectContaining({ endedAt: expect.any(Date), durationMins: expect.any(Number) }),
    })
  })

  it('no toca taskSession/task si ningún participante tiene taskId', async () => {
    const meeting = makeMeeting({ participants: [{ taskId: null, task: null }] })
    await closeMeeting(meeting)

    expect(prisma.taskSession.updateMany).not.toHaveBeenCalled()
    expect(prisma.task.updateMany).not.toHaveBeenCalled()
    expect(prisma.projectMeeting.update).toHaveBeenCalled()
  })

  it('envía al dashboard los to-dos con responsable que no tienen tarea vinculada', async () => {
    const meeting = makeMeeting({
      todos: [
        { id: 1, title: 'Mandar propuesta', ownerId: 5, taskId: null },
        { id: 2, title: 'Sin dueño',        ownerId: null, taskId: null },
        { id: 3, title: 'Ya enviada',       ownerId: 6, taskId: 999 },
      ],
    })
    prisma.workspace.findUnique.mockResolvedValue({ timezone: 'America/Argentina/Buenos_Aires' })
    prisma.workspaceMember.findMany.mockResolvedValue([{ userId: 5 }])
    prisma.workDay.findUnique.mockResolvedValue({ id: 77 })
    prisma.task.create.mockResolvedValue({ id: 555 })

    await closeMeeting(meeting, { actorName: 'Ana' })

    expect(prisma.task.create).toHaveBeenCalledTimes(1)
    expect(prisma.task.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 5, projectId: meeting.projectId, workDayId: 77 }),
    }))
    expect(prisma.projectMeetingTodo.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { taskId: 555 } })
    expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 5, actorId: null, type: 'TASK_MENTION' }),
    }))
  })

  it('no envía un to-do cuyo responsable ya no es miembro activo', async () => {
    const meeting = makeMeeting({ todos: [{ id: 1, title: 'X', ownerId: 5, taskId: null }] })
    prisma.workspace.findUnique.mockResolvedValue({ timezone: 'UTC' })
    prisma.workspaceMember.findMany.mockResolvedValue([]) // nadie activo

    await closeMeeting(meeting)

    expect(prisma.task.create).not.toHaveBeenCalled()
  })
})

describe('projectMeetingLifecycle.maybeAutoFinishMeeting', () => {
  beforeEach(() => jest.clearAllMocks())

  it('no hace nada si la reunión no existe', async () => {
    prisma.projectMeeting.findUnique.mockResolvedValue(null)
    await maybeAutoFinishMeeting(1)
    expect(prisma.projectMeeting.update).not.toHaveBeenCalled()
  })

  it('no hace nada si la reunión no fue iniciada', async () => {
    prisma.projectMeeting.findUnique.mockResolvedValue(makeMeeting({ startedAt: null }))
    await maybeAutoFinishMeeting(1)
    expect(prisma.projectMeeting.update).not.toHaveBeenCalled()
  })

  it('no hace nada si la reunión ya fue finalizada', async () => {
    prisma.projectMeeting.findUnique.mockResolvedValue(makeMeeting({ endedAt: new Date() }))
    await maybeAutoFinishMeeting(1)
    expect(prisma.projectMeeting.update).not.toHaveBeenCalled()
  })

  it('no hace nada si no hay participantes', async () => {
    prisma.projectMeeting.findUnique.mockResolvedValue(makeMeeting({ participants: [] }))
    await maybeAutoFinishMeeting(1)
    expect(prisma.projectMeeting.update).not.toHaveBeenCalled()
  })

  it('no cierra si todavía falta un participante por completar', async () => {
    prisma.projectMeeting.findUnique.mockResolvedValue(makeMeeting({
      participants: [
        { taskId: 100, task: { status: 'COMPLETED' } },
        { taskId: 101, task: { status: 'IN_PROGRESS' } },
      ],
    }))
    await maybeAutoFinishMeeting(1)
    expect(prisma.projectMeeting.update).not.toHaveBeenCalled()
  })

  it('cierra sola cuando todos los participantes completaron su tarea', async () => {
    prisma.projectMeeting.findUnique.mockResolvedValue(makeMeeting())
    await maybeAutoFinishMeeting(1)
    expect(prisma.projectMeeting.update).toHaveBeenCalledWith({
      where: { id: 1 }, data: expect.objectContaining({ endedAt: expect.any(Date) }),
    })
  })

  it('cuenta como resuelto a un participante que nunca llegó a tener taskId', async () => {
    prisma.projectMeeting.findUnique.mockResolvedValue(makeMeeting({
      participants: [
        { taskId: 100, task: { status: 'COMPLETED' } },
        { taskId: null, task: null },
      ],
    }))
    await maybeAutoFinishMeeting(1)
    expect(prisma.projectMeeting.update).toHaveBeenCalled()
  })
})
