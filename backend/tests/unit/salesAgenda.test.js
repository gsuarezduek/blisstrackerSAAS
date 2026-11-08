jest.mock('../../src/lib/prisma', () => ({
  leadAction: { findMany: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const { actionDate, listOwnSalesActions } = require('../../src/lib/salesAgenda')

describe('salesAgenda', () => {
  it('el día de pared de una fecha a mediodía UTC no se corre en Buenos Aires', () => {
    expect(actionDate(new Date('2026-11-08T12:00:00Z'), 'America/Argentina/Buenos_Aires')).toBe('2026-11-08')
  })

  it('devuelve las acciones pendientes del responsable, sin la tarea vinculada', async () => {
    prisma.leadAction.findMany.mockResolvedValue([
      {
        id: 5, title: 'Llamar', dueAt: new Date('2026-11-08T12:00:00Z'), taskId: 90,
        lead: { id: 3, title: 'Web nueva', company: { name: 'Acme' } },
      },
      {
        id: 6, title: 'Fuera de rango', dueAt: new Date('2026-11-01T12:00:00Z'), taskId: null,
        lead: { id: 4, title: 'Otra', company: null },
      },
    ])

    const rows = await listOwnSalesActions({
      workspaceId: 1, userId: 7, from: '2026-11-08', to: '2026-11-08', tz: 'America/Argentina/Buenos_Aires',
    })

    expect(rows).toEqual([
      { id: 5, title: 'Llamar', date: '2026-11-08', leadId: 3, leadTitle: 'Web nueva', companyName: 'Acme', taskId: 90 },
    ])
    const where = prisma.leadAction.findMany.mock.calls[0][0].where
    expect(where.status).toBe('pending')
    expect(where.OR[0].ownerId).toBe(7)
    expect(where.OR[0].lead.status).toEqual({ notIn: ['ganado', 'perdido'] })
    expect(where.OR[1].lead.ownerId).toBe(7)
  })
})
