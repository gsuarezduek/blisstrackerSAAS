// Salud del webhook de WhatsApp (services/whatsappWebhookHealth.service.js):
// detectar que Chakra dejó de mandar eventos, avisar una vez por episodio y volver
// a 'ok' solo cuando llega un evento válido.
jest.mock('../../src/lib/prisma', () => ({
  whatsappAccount: { update: jest.fn(), findMany: jest.fn() },
  whatsappMessage: { findMany: jest.fn(), count: jest.fn() },
  workspaceMember: { findMany: jest.fn() },
  notification:    { createMany: jest.fn(), updateMany: jest.fn() },
}))
jest.mock('../../src/lib/socket', () => ({ emitTo: jest.fn() }))

const prisma = require('../../src/lib/prisma')
const { emitTo } = require('../../src/lib/socket')
const {
  markWebhookAlive, markBadSignature, evaluateAccount, checkAccount,
} = require('../../src/services/whatsappWebhookHealth.service')

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const NOW = new Date('2026-11-27T15:00:00Z')

const account = (over = {}) => ({
  id: 1, workspaceId: 9, phoneNumberId: 'pn', displayPhoneNumber: '+54 11 5555-0000',
  connectedAt: new Date(NOW - 60 * DAY),
  lastWebhookAt: new Date(NOW - 2 * HOUR),
  webhookHealth: 'ok', webhookHealthSince: null, webhookHealthNotifiedAt: null,
  ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  prisma.whatsappMessage.findMany.mockResolvedValue([])
  prisma.whatsappMessage.count.mockResolvedValue(0)
  prisma.whatsappAccount.update.mockImplementation(({ data }) => Promise.resolve({ ...account(), ...data }))
  prisma.workspaceMember.findMany.mockResolvedValue([{ userId: 1 }, { userId: 2 }])
})

describe('evaluateAccount', () => {
  it('unconfirmed: envíos nuestros a 2+ chats sin ningún evento posterior', async () => {
    prisma.whatsappMessage.findMany.mockResolvedValue([{ conversationId: 1 }, { conversationId: 2 }])
    expect(await evaluateAccount(account(), NOW)).toBe('unconfirmed')
    const { where, distinct, take } = prisma.whatsappMessage.findMany.mock.calls[0][0]
    expect(where.direction).toBe('out')
    expect(where.senderType).toEqual({ not: 'app_echo' })
    expect(where.conversation).toEqual({ accountId: 1 })
    expect(where.createdAt.gt).toEqual(account().lastWebhookAt)
    expect(where.createdAt.lte).toEqual(new Date(NOW - 20 * MIN))
    expect(distinct).toEqual(['conversationId'])
    expect(take).toBe(2)
  })

  it('un solo chat sin confirmar no alcanza (puede ser ese contacto)', async () => {
    prisma.whatsappMessage.findMany.mockResolvedValue([{ conversationId: 1 }])
    expect(await evaluateAccount(account(), NOW)).toBe('ok')
  })

  it('silent: más de un día sin nada cuando lo habitual son varios mensajes por día', async () => {
    prisma.whatsappMessage.count.mockResolvedValue(70) // 5/día los 14 días previos
    const acc = account({ lastWebhookAt: new Date(NOW - 26 * HOUR) })
    expect(await evaluateAccount(acc, NOW)).toBe('silent')
    // La base son los 14 días ANTERIORES al silencio, no los últimos 14.
    const { createdAt } = prisma.whatsappMessage.count.mock.calls[0][0].where
    expect(createdAt.lte).toEqual(acc.lastWebhookAt)
    expect(createdAt.gte).toEqual(new Date(acc.lastWebhookAt - 14 * DAY))
  })

  it('un número con poco tráfico no se marca por un día de silencio', async () => {
    prisma.whatsappMessage.count.mockResolvedValue(7) // 0,5/día → esperados ~0,5
    expect(await evaluateAccount(account({ lastWebhookAt: new Date(NOW - 26 * HOUR) }), NOW)).toBe('ok')
  })

  it('menos de 24 h de silencio ni siquiera mira la base', async () => {
    expect(await evaluateAccount(account({ lastWebhookAt: new Date(NOW - 20 * HOUR) }), NOW)).toBe('ok')
    expect(prisma.whatsappMessage.count).not.toHaveBeenCalled()
  })

  it('sin ningún evento todavía, cuenta desde que se conectó', async () => {
    const acc = account({ lastWebhookAt: null, connectedAt: new Date(NOW - 3 * HOUR) })
    await evaluateAccount(acc, NOW)
    expect(prisma.whatsappMessage.findMany.mock.calls[0][0].where.createdAt.gt).toEqual(acc.connectedAt)
  })

  it('bad_signature la decide el webhook: el cron la respeta', async () => {
    expect(await evaluateAccount(account({ webhookHealth: 'bad_signature' }), NOW)).toBe('bad_signature')
    expect(prisma.whatsappMessage.findMany).not.toHaveBeenCalled()
  })
})

describe('checkAccount', () => {
  it('al salir de ok: marca el episodio, emite y avisa a los admins una vez', async () => {
    prisma.whatsappMessage.findMany.mockResolvedValue([{ conversationId: 1 }, { conversationId: 2 }])
    expect(await checkAccount(account(), NOW)).toBe('unconfirmed')

    expect(prisma.whatsappAccount.update.mock.calls[0][0].data).toEqual({ webhookHealth: 'unconfirmed', webhookHealthSince: NOW })
    expect(emitTo).toHaveBeenCalledWith('workspace:9', 'whatsapp:health', expect.objectContaining({ webhookHealth: 'unconfirmed' }))
    expect(prisma.workspaceMember.findMany.mock.calls[0][0].where).toEqual({ workspaceId: 9, active: true, role: { in: ['admin', 'owner'] } })
    const { data } = prisma.notification.createMany.mock.calls[0][0]
    expect(data.map(n => n.userId)).toEqual([1, 2])
    expect(data[0]).toMatchObject({ workspaceId: 9, type: 'WHATSAPP_CONNECTION' })
    expect(data[0].message).toContain('+54 11 5555-0000')
    expect(prisma.whatsappAccount.update.mock.calls[1][0].data).toEqual({ webhookHealthNotifiedAt: NOW })
  })

  it('ya avisado en este episodio: no vuelve a avisar', async () => {
    prisma.whatsappMessage.findMany.mockResolvedValue([{ conversationId: 1 }, { conversationId: 2 }])
    const since = new Date(NOW - HOUR)
    await checkAccount(account({ webhookHealth: 'unconfirmed', webhookHealthSince: since, webhookHealthNotifiedAt: since }), NOW)
    expect(prisma.whatsappAccount.update).not.toHaveBeenCalled()
    expect(prisma.notification.createMany).not.toHaveBeenCalled()
  })

  it('empeorar dentro del episodio (silent → unconfirmed) no lo reinicia ni re-avisa', async () => {
    prisma.whatsappMessage.findMany.mockResolvedValue([{ conversationId: 1 }, { conversationId: 2 }])
    const since = new Date(NOW - 5 * HOUR)
    await checkAccount(account({ webhookHealth: 'silent', webhookHealthSince: since, webhookHealthNotifiedAt: since }), NOW)
    expect(prisma.whatsappAccount.update.mock.calls[0][0].data).toEqual({ webhookHealth: 'unconfirmed' })
    expect(prisma.notification.createMany).not.toHaveBeenCalled()
  })

  it('el cron nunca mejora el estado (eso lo hace el webhook)', async () => {
    const since = new Date(NOW - 5 * HOUR)
    await checkAccount(account({ webhookHealth: 'unconfirmed', webhookHealthSince: since, webhookHealthNotifiedAt: since }), NOW)
    expect(prisma.whatsappAccount.update).not.toHaveBeenCalled()
  })

  it('firma inválida: espera 15 min antes de avisar', async () => {
    await checkAccount(account({ webhookHealth: 'bad_signature', webhookHealthSince: new Date(NOW - 5 * MIN) }), NOW)
    expect(prisma.notification.createMany).not.toHaveBeenCalled()

    await checkAccount(account({ webhookHealth: 'bad_signature', webhookHealthSince: new Date(NOW - 20 * MIN) }), NOW)
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1)
    expect(prisma.notification.createMany.mock.calls[0][0].data[0].message).toContain('firma inválida')
  })

  it('sano: no toca nada', async () => {
    expect(await checkAccount(account(), NOW)).toBe('ok')
    expect(prisma.whatsappAccount.update).not.toHaveBeenCalled()
    expect(emitTo).not.toHaveBeenCalled()
  })
})

describe('markWebhookAlive', () => {
  it('cuenta sana con un evento reciente: no escribe (una vez por minuto alcanza)', async () => {
    await markWebhookAlive(account({ lastWebhookAt: new Date(NOW - 30 * 1000) }), NOW)
    expect(prisma.whatsappAccount.update).not.toHaveBeenCalled()
  })

  it('cuenta sana: refresca lastWebhookAt sin emitir', async () => {
    await markWebhookAlive(account({ lastWebhookAt: new Date(NOW - 5 * MIN) }), NOW)
    expect(prisma.whatsappAccount.update.mock.calls[0][0].data).toEqual({ lastWebhookAt: NOW })
    expect(emitTo).not.toHaveBeenCalled()
  })

  it('cuenta caída: vuelve a ok, emite y apaga los avisos de la campana', async () => {
    await markWebhookAlive(account({ webhookHealth: 'unconfirmed', webhookHealthSince: new Date(NOW - DAY), lastWebhookAt: new Date(NOW - 2 * DAY) }), NOW)
    expect(prisma.whatsappAccount.update.mock.calls[0][0].data).toEqual({ lastWebhookAt: NOW, webhookHealth: 'ok', webhookHealthSince: null })
    expect(emitTo).toHaveBeenCalledWith('workspace:9', 'whatsapp:health', expect.objectContaining({ webhookHealth: 'ok' }))
    expect(prisma.notification.updateMany.mock.calls[0][0]).toEqual({
      where: { workspaceId: 9, type: 'WHATSAPP_CONNECTION', read: false },
      data: { read: true },
    })
  })

  it('un error de DB no rompe el webhook', async () => {
    prisma.whatsappAccount.update.mockRejectedValue(new Error('db caída'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    await expect(markWebhookAlive(account({ lastWebhookAt: null }), NOW)).resolves.toBeUndefined()
    spy.mockRestore()
  })
})

describe('markBadSignature', () => {
  it('marca y emite la primera vez; si ya estaba, no reescribe', async () => {
    await markBadSignature(account(), NOW)
    expect(prisma.whatsappAccount.update.mock.calls[0][0].data).toEqual({ webhookHealth: 'bad_signature', webhookHealthSince: NOW })
    expect(emitTo).toHaveBeenCalledWith('workspace:9', 'whatsapp:health', expect.objectContaining({ webhookHealth: 'bad_signature' }))

    jest.clearAllMocks()
    await markBadSignature(account({ webhookHealth: 'bad_signature' }), NOW)
    expect(prisma.whatsappAccount.update).not.toHaveBeenCalled()
  })
})
