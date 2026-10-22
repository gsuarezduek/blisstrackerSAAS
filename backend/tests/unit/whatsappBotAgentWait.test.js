// Prioridad a los agentes de IA: el bot espera `agentWaitMins` antes de
// responder (handleInboundForBot agenda botReplyDueAt) y el cron
// runDueBotReplies responde solo si nadie tomó ni contestó la conversación.
jest.mock('../../src/lib/prisma', () => ({
  whatsappBotConfig:    { findUnique: jest.fn() },
  whatsappConversation: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  whatsappMessage:      { findFirst: jest.fn(), findMany: jest.fn() },
  mcpToken:             { count: jest.fn() },
}))
jest.mock('../../src/lib/claude', () => ({ createMessage: jest.fn() }))
jest.mock('../../src/lib/whatsappProvider', () => ({ getProvider: jest.fn(), decryptAccount: jest.fn(a => a) }))
jest.mock('../../src/lib/socket', () => ({ emitTo: jest.fn() }))
jest.mock('../../src/controllers/ventas/_shared', () => ({ logLeadEvent: jest.fn() }))
jest.mock('../../src/services/whatsappBotDocument.service', () => ({ buildKnowledgeBlock: jest.fn() }))

const prisma = require('../../src/lib/prisma')
const { handleInboundForBot, runDueBotReplies } = require('../../src/services/whatsappBot.service')

const account = { id: 1, workspaceId: 1, provider: 'chakra' }
const conversation = { id: 3 }

beforeEach(() => {
  jest.clearAllMocks()
  // maybeRespondWithBot corta enseguida si la conversación no es del bot: alcanza
  // para saber si se la llamó (lee la config del workspace al arrancar).
  prisma.whatsappConversation.findUnique.mockResolvedValue({ id: 3, botEnabled: false })
})

describe('handleInboundForBot', () => {
  it('con espera configurada y agentes conectados, agenda la respuesta en vez de responder', async () => {
    prisma.whatsappBotConfig.findUnique.mockResolvedValue({ enabled: true, agentWaitMins: 5 })
    prisma.mcpToken.count.mockResolvedValue(2)
    const before = Date.now()

    await handleInboundForBot({ account, conversation, contact: null })

    const call = prisma.whatsappConversation.updateMany.mock.calls[0][0]
    expect(call.where).toEqual({ id: 3, botEnabled: true, isBlocked: false })
    const due = call.data.botReplyDueAt.getTime()
    expect(due).toBeGreaterThanOrEqual(before + 5 * 60 * 1000)
    expect(due).toBeLessThan(before + 5 * 60 * 1000 + 5000)
    // No pasó a responder (maybeRespondWithBot vuelve a leer la config)
    expect(prisma.whatsappBotConfig.findUnique).toHaveBeenCalledTimes(1)
  })

  it('sin agentes conectados responde como siempre', async () => {
    prisma.whatsappBotConfig.findUnique.mockResolvedValue({ enabled: true, agentWaitMins: 5 })
    prisma.mcpToken.count.mockResolvedValue(0)

    await handleInboundForBot({ account, conversation, contact: null })

    expect(prisma.whatsappConversation.updateMany).not.toHaveBeenCalled()
    expect(prisma.whatsappBotConfig.findUnique).toHaveBeenCalledTimes(2)
  })

  it('sin espera configurada no mira los agentes', async () => {
    prisma.whatsappBotConfig.findUnique.mockResolvedValue({ enabled: true, agentWaitMins: 0 })

    await handleInboundForBot({ account, conversation, contact: null })

    expect(prisma.mcpToken.count).not.toHaveBeenCalled()
    expect(prisma.whatsappConversation.updateMany).not.toHaveBeenCalled()
  })

  it('con el bot apagado en el workspace no hace nada', async () => {
    prisma.whatsappBotConfig.findUnique.mockResolvedValue({ enabled: false, agentWaitMins: 5 })

    await handleInboundForBot({ account, conversation, contact: null })

    expect(prisma.mcpToken.count).not.toHaveBeenCalled()
    expect(prisma.whatsappConversation.updateMany).not.toHaveBeenCalled()
  })
})

describe('runDueBotReplies', () => {
  const dueAt = new Date('2026-10-22T12:00:00Z')
  const now = new Date('2026-10-22T12:01:00Z')

  beforeEach(() => {
    prisma.whatsappConversation.findMany.mockResolvedValue([{ id: 3, botReplyDueAt: dueAt }])
    prisma.whatsappConversation.updateMany.mockResolvedValue({ count: 1 })
    prisma.whatsappBotConfig.findUnique.mockResolvedValue({ enabled: true })
  })

  function mockConversation(overrides = {}) {
    // 1ª lectura: la del cron (con cuenta y contacto); las siguientes, las de maybeRespondWithBot
    prisma.whatsappConversation.findUnique
      .mockResolvedValueOnce({ id: 3, botEnabled: true, isBlocked: false, account, contact: null, ...overrides })
      .mockResolvedValue({ id: 3, botEnabled: false })
  }

  it('reclama la conversación con el mismo botReplyDueAt y responde si el último mensaje es del contacto', async () => {
    mockConversation()
    prisma.whatsappMessage.findFirst.mockResolvedValue({ direction: 'in' })

    const result = await runDueBotReplies(now)

    expect(prisma.whatsappConversation.findMany.mock.calls[0][0].where).toEqual({ botReplyDueAt: { lte: now } })
    expect(prisma.whatsappConversation.updateMany).toHaveBeenCalledWith({ where: { id: 3, botReplyDueAt: dueAt }, data: { botReplyDueAt: null } })
    expect(prisma.whatsappBotConfig.findUnique).toHaveBeenCalled()
    expect(result).toEqual({ due: 1, responded: 1 })
  })

  it('no responde si alguien ya contestó mientras el bot esperaba', async () => {
    mockConversation()
    prisma.whatsappMessage.findFirst.mockResolvedValue({ direction: 'out' })

    const result = await runDueBotReplies(now)

    expect(prisma.whatsappBotConfig.findUnique).not.toHaveBeenCalled()
    expect(result.responded).toBe(0)
  })

  it('no responde si un agente o una persona tomó el control', async () => {
    mockConversation({ botEnabled: false })

    await runDueBotReplies(now)

    expect(prisma.whatsappMessage.findFirst).not.toHaveBeenCalled()
    expect(prisma.whatsappBotConfig.findUnique).not.toHaveBeenCalled()
  })

  it('si entró otro mensaje y corrió la hora (o la tomó otra corrida), la saltea', async () => {
    prisma.whatsappConversation.updateMany.mockResolvedValue({ count: 0 })

    const result = await runDueBotReplies(now)

    expect(prisma.whatsappConversation.findUnique).not.toHaveBeenCalled()
    expect(result).toEqual({ due: 1, responded: 0 })
  })
})
