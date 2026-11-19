// Test A/B de asunto: el reparto de la audiencia, el criterio del ganador y el
// cierre del test (el resto de la audiencia recibe el asunto ganador).
jest.mock('../../src/lib/prisma', () => ({
  mailingCampaign: { findMany: jest.fn(), updateMany: jest.fn() },
  mailingSend: { count: jest.fn(), updateMany: jest.fn() },
}))
const prisma = require('../../src/lib/prisma')
const { assignVariants, pickWinner, decideAbTests, subjectFor } = require('../../src/services/mailing/dispatcher')

const count = (arr, pred) => arr.filter(pred).length

describe('assignVariants', () => {
  it('el % de prueba se parte mitad A / mitad B y el resto espera al ganador', () => {
    const v = assignVariants(1000, 20)
    expect(count(v, x => x.variant === 'A')).toBe(100)
    expect(count(v, x => x.variant === 'B')).toBe(100)
    expect(count(v, x => x.status === 'held' && x.variant === null)).toBe(800)
  })
  it('con 100% o una audiencia chica se parte toda, sin nadie esperando', () => {
    expect(count(assignVariants(1000, 100), x => x.status === 'held')).toBe(0)
    expect(count(assignVariants(60, 20), x => x.status === 'held')).toBe(0)
  })
  it('sin test, nadie lleva variante', () => {
    expect(assignVariants(3, null)).toEqual([{}, {}, {}])
  })
})

describe('pickWinner', () => {
  it('manda la tasa de clics aunque B abra menos', () => {
    expect(pickWinner({ A: { sent: 100, opens: 40, clicks: 2 }, B: { sent: 100, opens: 20, clicks: 6 } })).toBe('B')
  })
  it('sin clics decide la apertura; empate → A', () => {
    expect(pickWinner({ A: { sent: 100, opens: 10, clicks: 0 }, B: { sent: 100, opens: 30, clicks: 0 } })).toBe('B')
    expect(pickWinner({ A: { sent: 100, opens: 10, clicks: 0 }, B: { sent: 100, opens: 10, clicks: 0 } })).toBe('A')
  })
})

describe('subjectFor', () => {
  it('B solo si tiene asunto B', () => {
    expect(subjectFor({ subject: 'a', subjectB: 'b' }, 'B')).toBe('b')
    expect(subjectFor({ subject: 'a', subjectB: 'b' }, 'A')).toBe('a')
    expect(subjectFor({ subject: 'a', subjectB: 'b' }, null)).toBe('a')
  })
})

describe('decideAbTests', () => {
  const NOW = new Date('2026-11-18T15:00:00Z')
  const camp = { id: 9, launchedAt: new Date('2026-11-18T10:00:00Z'), abWaitHours: 4 }

  it('no decide mientras la prueba no terminó de salir', async () => {
    prisma.mailingCampaign.findMany.mockResolvedValue([camp])
    prisma.mailingSend.count.mockResolvedValueOnce(3) // todavía hay A/B en cola
    await decideAbTests(NOW)
    expect(prisma.mailingCampaign.updateMany).not.toHaveBeenCalled()
  })

  it('no decide antes de las horas de espera', async () => {
    prisma.mailingCampaign.findMany.mockResolvedValue([{ ...camp, abWaitHours: 8 }])
    await decideAbTests(NOW)
    expect(prisma.mailingSend.count).not.toHaveBeenCalled()
  })

  it('elige el ganador y libera al resto con ese asunto', async () => {
    prisma.mailingCampaign.findMany.mockResolvedValue([camp])
    // unsent=0, después A: sent/opens/clicks, B: sent/opens/clicks
    prisma.mailingSend.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(100).mockResolvedValueOnce(30).mockResolvedValueOnce(1)
      .mockResolvedValueOnce(100).mockResolvedValueOnce(25).mockResolvedValueOnce(5)
    prisma.mailingCampaign.updateMany.mockResolvedValue({ count: 1 })
    await decideAbTests(NOW)
    expect(prisma.mailingCampaign.updateMany).toHaveBeenCalledWith({ where: { id: 9, abWinner: null }, data: { abWinner: 'B', abDecidedAt: NOW } })
    expect(prisma.mailingSend.updateMany).toHaveBeenCalledWith({ where: { campaignId: 9, status: 'held' }, data: { status: 'queued', variant: 'B' } })
  })
})
