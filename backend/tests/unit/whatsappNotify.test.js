// Avisos de la campana por chats de WhatsApp sin leer (services/whatsappNotify.service.js):
// a quién se le avisa (responsable vs. todo Ventas) y que haya UNO por chat sin leer.
jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findMany: jest.fn() },
  notification:    {
    findMany: jest.fn(),
    create:   jest.fn(args => ({ op: 'create', ...args })),
    update:   jest.fn(args => ({ op: 'update', ...args })),
  },
  $transaction:    jest.fn(),
}))
jest.mock('../../src/lib/socket', () => ({ emitTo: jest.fn() }))

const prisma = require('../../src/lib/prisma')
const { emitTo } = require('../../src/lib/socket')
const { notifyWhatsappConversation, salesRecipientIds } = require('../../src/services/whatsappNotify.service')

const MEMBERS = [
  { userId: 1, role: 'owner',  teamRole: null,       extraTeamRoles: [] },
  { userId: 2, role: 'member', teamRole: 'SALES',    extraTeamRoles: [] },
  { userId: 3, role: 'member', teamRole: 'DESIGNER', extraTeamRoles: [] },
  { userId: 4, role: 'member', teamRole: 'DESIGNER', extraTeamRoles: ['SALES'] },
]

beforeEach(() => {
  jest.clearAllMocks()
  prisma.workspace.findUnique.mockResolvedValue({ moduleAccess: { ventas: { allMembers: false, roles: ['SALES'] } } })
  prisma.workspaceMember.findMany.mockResolvedValue(MEMBERS)
  prisma.notification.findMany.mockResolvedValue([])
})

const txOps = () => prisma.$transaction.mock.calls[0][0]

describe('salesRecipientIds', () => {
  it('admins/owners y los roles con acceso a Ventas (principal o adicional), solo miembros activos', async () => {
    expect(await salesRecipientIds(9)).toEqual([1, 2, 4])
    expect(prisma.workspaceMember.findMany.mock.calls[0][0].where).toEqual({ workspaceId: 9, active: true })
  })
})

describe('notifyWhatsappConversation', () => {
  it('chat sin lead ni responsable (lo típico del bot): avisa a todo Ventas', async () => {
    await notifyWhatsappConversation({ workspaceId: 9, conversation: { id: 5 }, message: 'Ana te escribió' })
    const ops = txOps()
    expect(ops.map(o => o.data.userId)).toEqual([1, 2, 4])
    expect(ops[0]).toMatchObject({ op: 'create', data: { type: 'WHATSAPP_MESSAGE', whatsappConversationId: 5, leadId: null } })
    expect(emitTo).toHaveBeenCalledTimes(3)
  })

  it('con responsable del chat: solo a esa persona', async () => {
    await notifyWhatsappConversation({ workspaceId: 9, conversation: { id: 5, assignedToId: 3 }, message: 'x' })
    expect(txOps().map(o => o.data.userId)).toEqual([3])
    expect(prisma.workspaceMember.findMany).not.toHaveBeenCalled()
  })

  it('sin responsable del chat pero con lead activo: al dueño del lead', async () => {
    await notifyWhatsappConversation({ workspaceId: 9, conversation: { id: 5 }, lead: { id: 70, ownerId: 2 }, message: 'x' })
    expect(txOps()).toEqual([expect.objectContaining({ op: 'create', data: expect.objectContaining({ userId: 2, leadId: 70 }) })])
  })

  it('si ya tiene un aviso sin leer de ese chat, lo actualiza en vez de sumar otro', async () => {
    prisma.notification.findMany.mockResolvedValue([{ id: 100, userId: 2 }])
    await notifyWhatsappConversation({ workspaceId: 9, conversation: { id: 5 }, message: 'segundo mensaje' })
    const ops = txOps()
    const forUser2 = ops.find(o => o.op === 'update')
    expect(forUser2.where).toEqual({ id: 100 })
    expect(forUser2.data).toMatchObject({ message: 'segundo mensaje', createdAt: expect.any(Date) })
    expect(ops.filter(o => o.op === 'create').map(o => o.data.userId)).toEqual([1, 4])
    // solo busca avisos SIN LEER de este chat
    expect(prisma.notification.findMany.mock.calls[0][0].where).toMatchObject({ whatsappConversationId: 5, read: false, type: 'WHATSAPP_MESSAGE' })
  })

  it('ownerOnly (una reacción) sin responsable: no avisa a nadie', async () => {
    await notifyWhatsappConversation({ workspaceId: 9, conversation: { id: 5 }, message: 'x', ownerOnly: true })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('nunca lanza', async () => {
    prisma.workspaceMember.findMany.mockRejectedValue(new Error('db caída'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    await expect(notifyWhatsappConversation({ workspaceId: 9, conversation: { id: 5 }, message: 'x' })).resolves.toBeUndefined()
    spy.mockRestore()
  })
})
