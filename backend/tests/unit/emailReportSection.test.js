// Sección "Email marketing" del informe al cliente: tasas sobre lo enviado, deltas
// en PUNTOS, nada si no salió ninguna campaña — y NUNCA datos de contactos ni
// nombres de bases (pueden decir cosas internas), que es lo que este test fija.
jest.mock('../../src/lib/prisma', () => ({
  mailingCampaign: { findMany: jest.fn() },
  mailingContact: { count: jest.fn() },
}))
const prisma = require('../../src/lib/prisma')
const { buildEmailSection, previousRange } = require('../../src/services/monthlyReport/sectionBuilders/email')

const period = { start: '2026-10-01', end: '2026-10-31' }
const c = over => ({
  name: 'Interno: leads fríos', subject: 'Novedades de octubre', launchedAt: new Date('2026-10-10T12:00:00Z'),
  sentCount: 1000, deliveredCount: 990, openCount: 300, clickCount: 40, unsubscribeCount: 3, bounceCount: 5,
  subjectB: null, abWinner: null, ...over,
})

it('el período anterior tiene el mismo largo', () => {
  expect(previousRange('2026-10-01', '2026-10-31')).toEqual({ start: '2026-08-31', end: '2026-09-30' })
})

it('sin campañas en el período no hay sección', async () => {
  prisma.mailingCampaign.findMany.mockResolvedValue([])
  prisma.mailingContact.count.mockResolvedValue(10)
  expect(await buildEmailSection({ projectId: 7, period })).toBeNull()
})

it('calcula tasas, deltas en puntos y no expone nada de contactos ni bases', async () => {
  prisma.mailingCampaign.findMany
    .mockResolvedValueOnce([c(), c({ subject: 'A', subjectB: 'B gana', abWinner: 'B', sentCount: 1000, openCount: 200, clickCount: 20 })])
    .mockResolvedValueOnce([c({ sentCount: 1000, openCount: 200, clickCount: 20 })])
  prisma.mailingContact.count.mockResolvedValueOnce(5000).mockResolvedValueOnce(120).mockResolvedValueOnce(8)
  const s = await buildEmailSection({ projectId: 7, period })
  expect(s).toMatchObject({ campaigns: 2, sent: 2000, openRate: 25, clickRate: 3, subscribers: 5000, newSubscribers: 120, unsubscribedInPeriod: 8 })
  expect(s.delta).toEqual({ sent: 100, openRatePts: 5, clickRatePts: 1 })
  expect(s.list[1]).toMatchObject({ subject: 'B gana', abTest: true })

  const json = JSON.stringify(s)
  expect(json).not.toMatch(/@/)            // ningún email
  expect(json).not.toMatch(/leads fríos/)  // ni el nombre interno de la campaña
  for (const key of ['email', 'emails', 'contacts', 'lists', 'listName', 'includeListIds', 'excludeListIds']) {
    expect(JSON.stringify(Object.keys(s))).not.toContain(`"${key}"`)
  }
})
