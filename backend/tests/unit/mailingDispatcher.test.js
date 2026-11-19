// Dispatcher de Mailing: el tope diario manda cuántos salen por tick, fuera de la
// ventana horaria no sale nada, una credencial rechazada no quema intentos, y los
// errores temporales vuelven a la cola con backoff.
jest.mock('../../src/lib/prisma', () => ({
  mailingConfig:     { findUnique: jest.fn(), update: jest.fn() },
  mailingDailyUsage: { findUnique: jest.fn(), upsert: jest.fn(ops => ops) },
  mailingSend:       { findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn(a => a) },
  mailingCampaign:   { findMany: jest.fn(), update: jest.fn(a => a) },
  $transaction:      jest.fn(async ops => ops),
}))
jest.mock('../../src/lib/platformSettings', () => ({ getSetting: jest.fn().mockResolvedValue(0) }))
jest.mock('../../src/services/mailing/providers', () => {
  const provider = { sendBatch: jest.fn(), PER_TICK: 200 }
  return { getProvider: () => provider, PROVIDER_KEYS: ['resend', 'smtp'], __provider: provider }
})

const prisma = require('../../src/lib/prisma')
const { getSetting } = require('../../src/lib/platformSettings')
const { __provider: provider } = require('../../src/services/mailing/providers')
const { encrypt } = require('../../src/lib/encryption')
const { processProject } = require('../../src/services/mailing/dispatcher')

// 15:00 UTC = 12:00 en Buenos Aires: dentro de la ventana 09–20.
const NOW = new Date('2026-11-18T15:00:00Z')

function config(over = {}) {
  return {
    id: 1, projectId: 7, provider: 'resend', status: 'active',
    credentials: encrypt(JSON.stringify({ apiKey: 're_test_123456789' })),
    fromEmail: 'hola@cliente.com', fromName: 'Cliente', dailyLimit: 100,
    sendWindowStart: '09:00', sendWindowEnd: '20:00',
    workspace: { timezone: 'America/Argentina/Buenos_Aires' }, ...over,
  }
}

function sends(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1, campaignId: 9, token: `tok${i}`, email: `p${i}@x.com`, attempts: 0,
    contact: { email: `p${i}@x.com`, firstName: 'P', lastName: null, fields: {}, status: 'subscribed' },
  }))
}

beforeEach(() => {
  prisma.mailingCampaign.findMany.mockResolvedValue([{ id: 9, subject: 'Hola', html: '<p>{{nombre}}</p>', text: 'x' }])
  prisma.mailingSend.updateMany.mockResolvedValue({ count: 0 })
})

it('toma solo lo que queda del tope diario', async () => {
  prisma.mailingConfig.findUnique.mockResolvedValue(config({ dailyLimit: 100 }))
  prisma.mailingDailyUsage.findUnique.mockResolvedValue({ count: 97 })
  prisma.mailingSend.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]).mockResolvedValueOnce(sends(3))
  provider.sendBatch.mockResolvedValue([{ ok: true, messageId: 'a' }, { ok: true, messageId: 'b' }, { ok: true, messageId: 'c' }])

  const r = await processProject(7, NOW)

  expect(prisma.mailingSend.findMany.mock.calls[0][0].take).toBe(3)
  expect(r).toEqual({ sent: 3 })
  expect(prisma.mailingDailyUsage.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { projectId_date: { projectId: 7, date: '2026-11-18' } },
    update: { count: { increment: 3 } },
  }))
  // Cada mensaje lleva el one-click de baja que exigen Gmail/Yahoo.
  const msg = provider.sendBatch.mock.calls[0][1][0]
  expect(msg.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
  expect(msg.html).toBe('<p>P</p>')
})

it('el techo de plataforma gana sobre el tope del proyecto', async () => {
  getSetting.mockResolvedValueOnce(50)
  prisma.mailingConfig.findUnique.mockResolvedValue(config({ dailyLimit: 1000 }))
  prisma.mailingDailyUsage.findUnique.mockResolvedValue({ count: 50 })
  expect(await processProject(7, NOW)).toEqual({ skipped: 'cap' })
  expect(prisma.mailingSend.findMany).not.toHaveBeenCalled()
})

it('fuera de la ventana horaria no manda nada', async () => {
  prisma.mailingConfig.findUnique.mockResolvedValue(config())
  expect(await processProject(7, new Date('2026-11-18T23:30:00Z'))).toEqual({ skipped: 'window' }) // 20:30 local
})

it('una config sin verificar no manda', async () => {
  prisma.mailingConfig.findUnique.mockResolvedValue(config({ status: 'unverified' }))
  expect(await processProject(7, NOW)).toEqual({ skipped: 'config' })
})

it('quien se dio de baja mientras esperaba en cola no recibe el mail', async () => {
  prisma.mailingConfig.findUnique.mockResolvedValue(config())
  prisma.mailingDailyUsage.findUnique.mockResolvedValue(null)
  const s = sends(2)
  s[1].contact.status = 'unsubscribed'
  prisma.mailingSend.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]).mockResolvedValueOnce(s)
  provider.sendBatch.mockResolvedValue([{ ok: true, messageId: 'a' }])
  await processProject(7, NOW)
  expect(provider.sendBatch.mock.calls[0][1]).toHaveLength(1)
  expect(prisma.mailingSend.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [2] } }, data: expect.objectContaining({ status: 'cancelled' }) }))
})

it('una credencial rechazada invalida la config y devuelve a la cola sin gastar intento', async () => {
  prisma.mailingConfig.findUnique.mockResolvedValue(config())
  prisma.mailingDailyUsage.findUnique.mockResolvedValue(null)
  prisma.mailingSend.findMany.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce(sends(1))
  provider.sendBatch.mockResolvedValue([{ ok: false, fatal: true, error: 'API key inválida' }])
  const r = await processProject(7, NOW)
  expect(r.fatal).toBe('API key inválida')
  expect(prisma.mailingConfig.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'invalid' }) }))
  expect(prisma.mailingSend.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: 'queued' } }))
  expect(prisma.mailingSend.update).not.toHaveBeenCalled()
})

it('un error temporal vuelve a la cola con backoff; uno permanente queda fallido', async () => {
  prisma.mailingConfig.findUnique.mockResolvedValue(config())
  prisma.mailingDailyUsage.findUnique.mockResolvedValue(null)
  prisma.mailingSend.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]).mockResolvedValueOnce(sends(2))
  provider.sendBatch.mockResolvedValue([
    { ok: false, retryable: true, error: '429' },
    { ok: false, retryable: false, error: 'dirección inválida' },
  ])
  await processProject(7, NOW)
  const [retry, failed] = prisma.mailingSend.update.mock.calls.map(c => c[0])
  expect(retry.data).toMatchObject({ status: 'queued', attempts: 1 })
  expect(retry.data.nextAttemptAt.getTime()).toBe(NOW.getTime() + 5 * 60000)
  expect(failed.data).toMatchObject({ status: 'failed', attempts: 1 })
  expect(prisma.mailingCampaign.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { failedCount: { increment: 1 } } })
  expect(prisma.mailingDailyUsage.upsert).not.toHaveBeenCalled()
})

it('el día del tope es el del workspace, no el UTC (ni el del reloj)', async () => {
  // 01:30 UTC del 19 = 22:30 del 18 en Buenos Aires.
  prisma.mailingConfig.findUnique.mockResolvedValue(config({ sendWindowStart: '00:00', sendWindowEnd: '23:59' }))
  prisma.mailingDailyUsage.findUnique.mockResolvedValue(null)
  prisma.mailingSend.findMany.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce(sends(1))
  provider.sendBatch.mockResolvedValue([{ ok: true, messageId: 'a' }])
  await processProject(7, new Date('2026-11-19T01:30:00Z'))
  const day = { projectId_date: { projectId: 7, date: '2026-11-18' } }
  expect(prisma.mailingDailyUsage.findUnique).toHaveBeenCalledWith({ where: day })
  expect(prisma.mailingDailyUsage.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: day }))
})

it('un error temporal en el último intento deja el envío fallido', async () => {
  prisma.mailingConfig.findUnique.mockResolvedValue(config())
  prisma.mailingDailyUsage.findUnique.mockResolvedValue(null)
  const s = sends(1)
  s[0].attempts = 2
  prisma.mailingSend.findMany.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce(s)
  provider.sendBatch.mockResolvedValue([{ ok: false, retryable: true, error: '503' }])
  await processProject(7, NOW)
  expect(prisma.mailingSend.update.mock.calls[0][0].data).toMatchObject({ status: 'failed', attempts: 3 })
})
