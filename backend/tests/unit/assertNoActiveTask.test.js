jest.mock('../../src/lib/prisma', () => ({
  task: {
    findFirst: jest.fn(),
  },
}))

const prisma = require('../../src/lib/prisma')
const { assertNoActiveTask } = require('../../src/controllers/tasks.controller')

const WORKSPACE_ID = 1

describe('assertNoActiveTask', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('no lanza error si no hay tarea en curso', async () => {
    prisma.task.findFirst.mockResolvedValue(null)
    await expect(assertNoActiveTask(1, WORKSPACE_ID)).resolves.toBeUndefined()
  })

  it('lanza error 409 si ya hay una tarea IN_PROGRESS en el mismo workspace', async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: 7, status: 'IN_PROGRESS',
      workDay: { workspaceId: WORKSPACE_ID },
    })
    await expect(assertNoActiveTask(1, WORKSPACE_ID)).rejects.toMatchObject({
      message: expect.stringContaining('tarea en curso'),
      status: 409,
    })
  })

  it('lanza error 409 con mensaje distinto si la tarea IN_PROGRESS es de otro workspace', async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: 7, status: 'IN_PROGRESS',
      workDay: { workspaceId: 99 },
    })
    // workspaceId diferente → igual lanza 409 pero con mensaje cross-workspace
    await expect(assertNoActiveTask(1, WORKSPACE_ID)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('otro workspace'),
    })
  })

  it('consulta Prisma con el userId correcto e incluye workDay.workspaceId', async () => {
    prisma.task.findFirst.mockResolvedValue(null)
    await assertNoActiveTask(42, WORKSPACE_ID)
    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { userId: 42, status: 'IN_PROGRESS' },
      include: { workDay: { select: { workspaceId: true } } },
    })
  })
})
