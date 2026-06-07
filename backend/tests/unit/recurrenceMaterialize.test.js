const {
  activateDueTasks, topUpUserRecurrences,
} = require('../../src/services/recurrence.service')

// Cliente Prisma falso: solo los métodos que usan las funciones de materialización.
function fakeClient() {
  return {
    task: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      count:      jest.fn().mockResolvedValue(0),
      create:     jest.fn().mockResolvedValue({ id: 99 }),
    },
    taskRecurrence: {
      findMany: jest.fn(),
      update:   jest.fn().mockResolvedValue({}),
    },
  }
}

const ctx = { userId: 1, workspaceId: 1, todayWorkDayId: 10, today: '2026-06-10' }

describe('activateDueTasks', () => {
  it('engancha al workday de hoy y limpia scheduledFor de las vencidas', async () => {
    const c = fakeClient()
    const count = await activateDueTasks(c, ctx)
    expect(count).toBe(2)
    const arg = c.task.updateMany.mock.calls[0][0]
    expect(arg.where.userId).toBe(1)
    expect(arg.where.scheduledFor).toEqual({ not: null, lte: '2026-06-10' })
    expect(arg.where.status).toEqual({ not: 'COMPLETED' })
    expect(arg.data).toEqual({ workDayId: 10, scheduledFor: null })
  })
})

describe('topUpUserRecurrences', () => {
  it('genera la próxima ocurrencia cuando no hay una futura pendiente', async () => {
    const c = fakeClient()
    c.taskRecurrence.findMany.mockResolvedValue([
      { id: 5, userId: 1, workspaceId: 1, frequency: 'daily', weekdays: '[]',
        startDate: '2026-06-01', endDate: null, lastSpawnedDate: '2026-06-09' },
    ])
    c.task.count.mockResolvedValue(0) // no hay futura pendiente

    await topUpUserRecurrences(c, ctx)

    // base = max(addDays('2026-06-09',1)='2026-06-10', today='2026-06-10') → daily → '2026-06-10'
    expect(c.task.create).toHaveBeenCalledTimes(1)
    const data = c.task.create.mock.calls[0][0].data
    expect(data.scheduledFor).toBe('2026-06-10')
    expect(data.recurrenceId).toBe(5)
    expect(data.status).toBe('PENDING')
  })

  it('NO genera si ya hay una instancia futura pendiente', async () => {
    const c = fakeClient()
    c.taskRecurrence.findMany.mockResolvedValue([
      { id: 5, userId: 1, workspaceId: 1, frequency: 'daily', weekdays: '[]',
        startDate: '2026-06-01', endDate: null, lastSpawnedDate: '2026-06-09' },
    ])
    c.task.count.mockResolvedValue(1) // ya existe una futura

    await topUpUserRecurrences(c, ctx)
    expect(c.task.create).not.toHaveBeenCalled()
  })

  it('desactiva la recurrencia vencida (endDate pasado)', async () => {
    const c = fakeClient()
    c.taskRecurrence.findMany.mockResolvedValue([
      { id: 7, userId: 1, workspaceId: 1, frequency: 'daily', weekdays: '[]',
        startDate: '2026-05-01', endDate: '2026-06-05', lastSpawnedDate: '2026-06-05' },
    ])

    await topUpUserRecurrences(c, ctx)
    expect(c.taskRecurrence.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { active: false } })
    expect(c.task.create).not.toHaveBeenCalled()
  })

  it('genera la próxima ocurrencia semanal en el día correcto', async () => {
    const c = fakeClient()
    // weekdays lunes(1) y jueves(4); lastSpawned lunes 2026-06-08 → próxima jueves 2026-06-11
    c.taskRecurrence.findMany.mockResolvedValue([
      { id: 9, userId: 1, workspaceId: 1, frequency: 'weekly', weekdays: '[1,4]',
        startDate: '2026-06-08', endDate: null, lastSpawnedDate: '2026-06-08' },
    ])
    c.task.count.mockResolvedValue(0)

    await topUpUserRecurrences(c, ctx)
    expect(c.task.create.mock.calls[0][0].data.scheduledFor).toBe('2026-06-11')
  })
})
