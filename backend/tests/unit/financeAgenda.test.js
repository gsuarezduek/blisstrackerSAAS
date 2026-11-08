jest.mock('../../src/lib/prisma', () => ({
  financeTask: { findMany: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const { listOwnFinanceTasks } = require('../../src/lib/financeAgenda')

describe('financeAgenda', () => {
  const tz = 'America/Argentina/Buenos_Aires'

  it('una pospuesta se muestra el día nuevo, no el original', async () => {
    prisma.financeTask.findMany.mockResolvedValue([
      {
        id: 2, title: 'Cobrar', status: 'postponed',
        date: new Date('2026-11-01T12:00:00Z'),
        postponedUntil: new Date('2026-11-08T12:00:00Z'),
        taskId: 40,
        item: { name: 'Acme' },
      },
    ])

    const rows = await listOwnFinanceTasks({
      workspaceId: 1, userId: 7, from: '2026-11-08', to: '2026-11-08', tz,
    })

    expect(rows).toEqual([
      { id: 2, title: 'Cobrar', date: '2026-11-08', itemName: 'Acme', taskId: 40 },
    ])
    const where = prisma.financeTask.findMany.mock.calls[0][0].where
    expect(where.responsibleId).toBe(7)
    expect(where.OR[1].status).toBe('postponed')
  })

  it('sin fecha efectiva no entra en el rango', async () => {
    prisma.financeTask.findMany.mockResolvedValue([
      { id: 3, title: 'Sin día', status: 'open', date: null, postponedUntil: null, taskId: null, item: null },
    ])
    const rows = await listOwnFinanceTasks({
      workspaceId: 1, userId: 7, from: '2026-11-08', to: '2026-11-08', tz,
    })
    expect(rows).toEqual([])
  })
})
