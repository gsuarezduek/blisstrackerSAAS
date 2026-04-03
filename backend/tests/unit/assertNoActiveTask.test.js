jest.mock('../../src/lib/prisma', () => ({
  task: {
    findFirst: jest.fn(),
  },
}))

const prisma = require('../../src/lib/prisma')
const { assertNoActiveTask } = require('../../src/controllers/tasks.controller')

describe('assertNoActiveTask', () => {
  it('no lanza error si no hay tarea en curso', async () => {
    prisma.task.findFirst.mockResolvedValue(null)
    await expect(assertNoActiveTask(1)).resolves.toBeUndefined()
  })

  it('lanza error 409 si ya hay una tarea IN_PROGRESS', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 7, status: 'IN_PROGRESS' })
    await expect(assertNoActiveTask(1)).rejects.toMatchObject({
      message: expect.stringContaining('tarea en curso'),
      status: 409,
    })
  })

  it('consulta Prisma con el userId correcto', async () => {
    prisma.task.findFirst.mockResolvedValue(null)
    await assertNoActiveTask(42)
    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { userId: 42, status: 'IN_PROGRESS' },
    })
  })
})
