// Leído COMPARTIDO de las conversaciones de WhatsApp (lib/whatsappRead.js): el
// criterio de "no leída" y que el puntero de lo visto nunca retroceda.
jest.mock('../../src/lib/prisma', () => ({
  whatsappConversation: { updateMany: jest.fn(ops => ops) },
  whatsappMessage:      { groupBy: jest.fn() },
  $transaction:         jest.fn(),
}))

const prisma = require('../../src/lib/prisma')
const { isConversationUnread, lastUnreadableMessageIds, markConversationRead } = require('../../src/lib/whatsappRead')

beforeEach(() => jest.clearAllMocks())

describe('isConversationUnread', () => {
  it('un mensaje del contacto posterior a lo visto la deja no leída', () => {
    expect(isConversationUnread({ lastReadMessageId: 10 }, 12)).toBe(true)
  })

  it('si lo último del contacto ya se vio, está leída aunque después haya respondido el equipo', () => {
    // 12 es lo último ENTRANTE; las respuestas del equipo/bot no entran al cálculo
    expect(isConversationUnread({ lastReadMessageId: 12 }, 12)).toBe(false)
  })

  it('nunca vista y con mensajes del contacto: no leída', () => {
    expect(isConversationUnread({ lastReadMessageId: null }, 1)).toBe(true)
  })

  it('sin mensajes del contacto: leída', () => {
    expect(isConversationUnread({ lastReadMessageId: null }, undefined)).toBe(false)
  })

  it('marcada a mano como no leída: no leída aunque no haya nada nuevo', () => {
    expect(isConversationUnread({ lastReadMessageId: 12, markedUnreadAt: new Date() }, 12)).toBe(true)
  })
})

describe('lastUnreadableMessageIds', () => {
  it('pide solo los entrantes sin reacción, en una sola query', async () => {
    prisma.whatsappMessage.groupBy.mockResolvedValue([{ conversationId: 1, _max: { id: 9 } }])
    const map = await lastUnreadableMessageIds([1, 2])
    expect(prisma.whatsappMessage.groupBy).toHaveBeenCalledTimes(1)
    expect(prisma.whatsappMessage.groupBy.mock.calls[0][0].where).toMatchObject({ conversationId: { in: [1, 2] }, direction: 'in', reactionEmoji: null })
    expect(map.get(1)).toBe(9)
    expect(map.get(2)).toBeUndefined()
  })

  it('sin conversaciones no consulta', async () => {
    await lastUnreadableMessageIds([])
    expect(prisma.whatsappMessage.groupBy).not.toHaveBeenCalled()
  })
})

describe('markConversationRead', () => {
  it('mueve el puntero solo hacia adelante y saca la marca manual', async () => {
    await markConversationRead(3, 20)
    const [move, clear] = prisma.$transaction.mock.calls[0][0]
    expect(move.where).toEqual({ id: 3, OR: [{ lastReadMessageId: null }, { lastReadMessageId: { lt: 20 } }] })
    expect(move.data).toMatchObject({ lastReadMessageId: 20 })
    expect(clear.where).toEqual({ id: 3, markedUnreadAt: { not: null } })
    expect(clear.data).toEqual({ markedUnreadAt: null })
  })

  it('una conversación sin mensajes solo pierde la marca manual', async () => {
    await markConversationRead(3, null)
    const ops = prisma.$transaction.mock.calls[0][0]
    expect(ops).toHaveLength(1)
    expect(ops[0].data).toEqual({ markedUnreadAt: null })
  })
})
