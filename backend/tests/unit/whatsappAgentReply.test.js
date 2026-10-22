// Agentes IA (MCP) en WhatsApp: el agente responde dentro de la ventana de 24hs
// y tiene prioridad sobre el bot (mandar o tomar el control lo apaga en esa
// conversación y la deja a nombre del agente).
jest.mock('../../src/lib/prisma', () => ({
  whatsappAccount:          { findFirst: jest.fn() },
  whatsappMessage:          { create: jest.fn() },
  whatsappConversation:     { update: jest.fn() },
  whatsappConversationRead: { upsert: jest.fn() },
  lead:                     { findFirst: jest.fn() },
  mcpToken:                 { findFirst: jest.fn() },
}))
jest.mock('../../src/lib/whatsappProvider', () => ({
  getProvider: jest.fn(),
  decryptAccount: jest.fn(a => a),
}))
jest.mock('../../src/lib/socket', () => ({ emitTo: jest.fn() }))
jest.mock('../../src/controllers/whatsapp/_shared', () => ({ assertConversation: jest.fn() }))
jest.mock('../../src/controllers/ventas/_shared', () => ({ logLeadEvent: jest.fn() }))

const prisma = require('../../src/lib/prisma')
const { getProvider } = require('../../src/lib/whatsappProvider')
const { emitTo } = require('../../src/lib/socket')
const { assertConversation } = require('../../src/controllers/whatsapp/_shared')
const { logLeadEvent } = require('../../src/controllers/ventas/_shared')
const { sendMessage, toggleConversationBot } = require('../../src/controllers/whatsapp/conversations.controller')

const AGENT = { id: 7, label: 'Grok ventas' }

function makeReq({ agentId = null, agentName = null, body = {} } = {}) {
  return {
    params: { id: '3' },
    body,
    workspace: { id: 1 },
    user: { userId: 2, ...(agentId ? { mcpTokenId: agentId, mcpAgentName: agentName } : {}) },
  }
}
function makeRes() {
  const res = {}
  res.status = jest.fn(() => res)
  res.json = jest.fn(() => res)
  return res
}

const sendSessionMessage = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  assertConversation.mockResolvedValue({
    id: 3, phoneE164: '+5491100000000', contactId: 9,
    lastInboundAt: new Date(Date.now() - 60 * 60 * 1000), // hace 1h: ventana abierta
  })
  prisma.whatsappAccount.findFirst.mockResolvedValue({ id: 1, provider: 'chakra', pluginId: 'p1' })
  sendSessionMessage.mockResolvedValue({ waMessageId: 'wamid.1' })
  getProvider.mockReturnValue({ sendSessionMessage })
  prisma.whatsappMessage.create.mockImplementation(({ data }) => Promise.resolve({
    id: 50, ...data, senderAgent: data.senderAgentId ? AGENT : null,
  }))
  prisma.lead.findFirst.mockResolvedValue({ id: 11 })
})

describe('sendMessage vía agente', () => {
  it('firma el mensaje, apaga el bot y deja la conversación tomada por el agente', async () => {
    const res = makeRes()
    await sendMessage(makeReq({ agentId: AGENT.id, body: { content: 'Hola!' } }), res, jest.fn())

    expect(res.status).toHaveBeenCalledWith(201)
    expect(prisma.whatsappMessage.create.mock.calls[0][0].data).toMatchObject({ senderType: 'user', senderUserId: 2, senderAgentId: AGENT.id })
    expect(prisma.whatsappConversation.update.mock.calls[0][0].data).toMatchObject({ botEnabled: false, agentControlId: AGENT.id, botReplyDueAt: null })
    expect(emitTo).toHaveBeenCalledWith('workspace:1', 'whatsapp:bot', { conversationId: 3, botEnabled: false, agentControl: AGENT, agentControlName: null })
    // No marca leída la conversación para el dueño
    expect(prisma.whatsappConversationRead.upsert).not.toHaveBeenCalled()
    expect(logLeadEvent.mock.calls[0][0].content).toContain('vía su agente «Grok ventas»')
  })

  it('guarda el nombre que declaró el agente en el mensaje, la conversación y el lead', async () => {
    await sendMessage(makeReq({ agentId: AGENT.id, agentName: 'Ventas', body: { content: 'Hola!' } }), makeRes(), jest.fn())

    expect(prisma.whatsappMessage.create.mock.calls[0][0].data.senderAgentName).toBe('Ventas')
    expect(prisma.whatsappConversation.update.mock.calls[0][0].data.agentControlName).toBe('Ventas')
    expect(logLeadEvent.mock.calls[0][0].content).toContain('vía su agente «Grok ventas · Ventas»')
  })

  it('una persona que responde no toca el bot ni la marca de agente', async () => {
    await sendMessage(makeReq({ body: { content: 'Hola!' } }), makeRes(), jest.fn())

    expect(prisma.whatsappMessage.create.mock.calls[0][0].data.senderAgentId).toBeNull()
    expect(prisma.whatsappConversation.update.mock.calls[0][0].data).not.toHaveProperty('botEnabled')
    // Ya se contestó: se cancela la respuesta del bot en espera
    expect(prisma.whatsappConversation.update.mock.calls[0][0].data.botReplyDueAt).toBeNull()
    expect(prisma.whatsappConversationRead.upsert).toHaveBeenCalled()
  })

  it('fuera de la ventana de 24hs devuelve 400 y no manda nada', async () => {
    assertConversation.mockResolvedValue({ id: 3, phoneE164: '+5491100000000', lastInboundAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
    const res = makeRes()
    await sendMessage(makeReq({ agentId: AGENT.id, body: { content: 'Hola!' } }), res, jest.fn())

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json.mock.calls[0][0].code).toBe('SESSION_WINDOW_EXPIRED')
    expect(sendSessionMessage).not.toHaveBeenCalled()
    expect(prisma.whatsappConversation.update).not.toHaveBeenCalled()
  })
})

describe('toggleConversationBot', () => {
  beforeEach(() => {
    prisma.whatsappConversation.update.mockImplementation(({ data }) => Promise.resolve({
      id: 3, botEnabled: data.botEnabled, agentControl: data.agentControlId ? AGENT : null,
    }))
  })

  it('el agente que toma el control queda a su nombre', async () => {
    await toggleConversationBot(makeReq({ agentId: AGENT.id, body: { botEnabled: false } }), makeRes(), jest.fn())
    expect(prisma.whatsappConversation.update.mock.calls[0][0].data).toEqual({ botEnabled: false, agentControlId: AGENT.id, agentControlName: null, botReplyDueAt: null })
  })

  it('una persona que toma el control limpia la marca del agente', async () => {
    await toggleConversationBot(makeReq({ body: { botEnabled: false } }), makeRes(), jest.fn())
    expect(prisma.whatsappConversation.update.mock.calls[0][0].data).toEqual({ botEnabled: false, agentControlId: null, agentControlName: null, botReplyDueAt: null })
  })

  it('desde la app se le asigna la conversación a un agente propio', async () => {
    prisma.mcpToken.findFirst.mockResolvedValue({ id: AGENT.id })
    await toggleConversationBot(makeReq({ body: { botEnabled: false, agentId: AGENT.id } }), makeRes(), jest.fn())
    expect(prisma.mcpToken.findFirst.mock.calls[0][0].where).toMatchObject({ id: AGENT.id, userId: 2, workspaceId: 1, revokedAt: null })
    expect(prisma.whatsappConversation.update.mock.calls[0][0].data).toEqual({ botEnabled: false, agentControlId: AGENT.id, agentControlName: null, botReplyDueAt: null })
  })

  it('no deja asignarle la conversación al agente de otra persona', async () => {
    prisma.mcpToken.findFirst.mockResolvedValue(null)
    const next = jest.fn()
    await toggleConversationBot(makeReq({ body: { botEnabled: false, agentId: 99 } }), makeRes(), next)
    expect(next.mock.calls[0][0].status).toBe(400)
    expect(prisma.whatsappConversation.update).not.toHaveBeenCalled()
  })

  it('devolver al bot (aunque lo pida el agente) limpia la marca', async () => {
    const res = makeRes()
    await toggleConversationBot(makeReq({ agentId: AGENT.id, body: { botEnabled: true } }), res, jest.fn())
    expect(prisma.whatsappConversation.update.mock.calls[0][0].data).toEqual({ botEnabled: true, agentControlId: null, agentControlName: null })
    expect(res.json).toHaveBeenCalledWith({ id: 3, botEnabled: true, agentControl: null, agentControlName: undefined })
  })
})
