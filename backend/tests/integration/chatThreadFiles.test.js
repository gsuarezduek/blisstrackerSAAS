jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  user:            { findUnique: jest.fn() },
  chatChannel:     { findFirst: jest.fn() },
  chatMessage:     { findFirst: jest.fn(), findMany: jest.fn() },
  project:         { findUnique: jest.fn() },
  projectMember:   { findUnique: jest.fn() },   // canWrite → isProjectMember usa findUnique
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const CHANNEL_ID     = 7

// Las dos piezas que la página de chat suma y el panel de 400px no podía dar: el hilo
// de un mensaje (dos listas de mensajes a la vez) y lo compartido en el canal.

function authHeader(role = 'member') {
  return `Bearer ${jwt.sign(
    { userId: 1, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )}`
}

function mockWorkspace(role = 'member') {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss', disabledFeatureKeys: '[]',
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({
    workspaceId: WORKSPACE_ID, userId: 1, role, active: true,
  })
  prisma.user.findUnique.mockResolvedValue({ sessionValidAfter: null })
}

const channel = (over = {}) => ({
  id: CHANNEL_ID, workspaceId: WORKSPACE_ID, name: 'general', slug: 'general',
  kind: 'general', isPrivate: false, projectId: null, archived: false, ...over,
})

const message = (over = {}) => ({
  id: 100, channelId: CHANNEL_ID, content: 'hola', authorId: 1, createdAt: new Date(), ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  prisma.chatMessage.findMany.mockResolvedValue([])
})

describe('GET /api/chat/messages/:messageId/replies', () => {
  function get(id = 100, role = 'member') {
    return request(app)
      .get(`/api/chat/messages/${id}/replies`)
      .set('Authorization', authHeader(role))
      .set('X-Workspace', WORKSPACE_SLUG)
  }

  it('devuelve el mensaje raíz y sus respuestas en orden', async () => {
    mockWorkspace()
    prisma.chatMessage.findFirst.mockResolvedValue(message())
    prisma.chatChannel.findFirst.mockResolvedValue(channel())
    prisma.chatMessage.findMany.mockResolvedValue([message({ id: 101, replyToId: 100 })])

    const res = await get()
    expect(res.status).toBe(200)
    expect(res.body.root.id).toBe(100)
    expect(res.body.replies).toHaveLength(1)

    const call = prisma.chatMessage.findMany.mock.calls[0][0]
    expect(call.where).toEqual({ replyToId: 100 })
    expect(call.orderBy).toEqual({ id: 'asc' })
  })

  it('404 si el mensaje no existe', async () => {
    mockWorkspace()
    prisma.chatMessage.findFirst.mockResolvedValue(null)
    expect((await get()).status).toBe(404)
  })

  it('400 si el id no es un número', async () => {
    mockWorkspace()
    expect((await get('abc')).status).toBe(400)
  })

  it('no deja leer el hilo de un canal privado a quien no es admin', async () => {
    mockWorkspace('member')
    prisma.chatMessage.findFirst.mockResolvedValue(message())
    prisma.chatChannel.findFirst.mockResolvedValue(channel({ isPrivate: true }))

    const res = await get()
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('CHANNEL_PRIVATE')
    expect(prisma.chatMessage.findMany).not.toHaveBeenCalled()
  })

  it('no deja leer el hilo del canal de un proyecto privado ajeno', async () => {
    mockWorkspace('member')
    prisma.chatMessage.findFirst.mockResolvedValue(message())
    prisma.chatChannel.findFirst.mockResolvedValue(channel({ kind: 'project', projectId: 3 }))
    prisma.project.findUnique.mockResolvedValue({ isPrivate: true })
    prisma.projectMember.findUnique.mockResolvedValue(null)

    const res = await get()
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('PROJECT_PRIVATE')
  })

  it('un mensaje de otro workspace no se puede leer por su canal', async () => {
    mockWorkspace()
    prisma.chatMessage.findFirst.mockResolvedValue(message())
    prisma.chatChannel.findFirst.mockResolvedValue(null) // el findFirst ya scopea por workspaceId
    expect((await get()).status).toBe(404)
  })
})

describe('GET /api/chat/channels/:id/files', () => {
  function get(qs = '', role = 'member') {
    return request(app)
      .get(`/api/chat/channels/${CHANNEL_ID}/files${qs}`)
      .set('Authorization', authHeader(role))
      .set('X-Workspace', WORKSPACE_SLUG)
  }

  it('lista solo los mensajes que tienen adjunto, de los más nuevos a los más viejos', async () => {
    mockWorkspace()
    prisma.chatChannel.findFirst.mockResolvedValue(channel())
    prisma.chatMessage.findMany.mockResolvedValue([message({ id: 20, attachment: { id: 2, kind: 'image' } })])

    const res = await get()
    expect(res.status).toBe(200)
    expect(res.body.messages).toHaveLength(1)
    expect(res.body.hasMore).toBe(false)

    const call = prisma.chatMessage.findMany.mock.calls[0][0]
    expect(call.where.channelId).toBe(CHANNEL_ID)
    expect(call.where.attachment).toEqual({ isNot: null })
    expect(call.orderBy).toEqual({ id: 'desc' })
  })

  it('pide uno de más para saber si hay más, y no lo devuelve', async () => {
    mockWorkspace()
    prisma.chatChannel.findFirst.mockResolvedValue(channel())
    const rows = Array.from({ length: 41 }, (_, i) => message({ id: i + 1, attachment: { id: i + 1 } }))
    prisma.chatMessage.findMany.mockResolvedValue(rows)

    const res = await get()
    expect(prisma.chatMessage.findMany.mock.calls[0][0].take).toBe(41)
    expect(res.body.messages).toHaveLength(40)
    expect(res.body.hasMore).toBe(true)
  })

  it('pagina hacia atrás con ?before=', async () => {
    mockWorkspace()
    prisma.chatChannel.findFirst.mockResolvedValue(channel())
    await get('?before=50')
    expect(prisma.chatMessage.findMany.mock.calls[0][0].where.id).toEqual({ lt: 50 })
  })

  it('tiene tope de límite', async () => {
    mockWorkspace()
    prisma.chatChannel.findFirst.mockResolvedValue(channel())
    await get('?limit=900')
    expect(prisma.chatMessage.findMany.mock.calls[0][0].take).toBe(101)
  })

  it('respeta la privacidad del canal', async () => {
    mockWorkspace('member')
    prisma.chatChannel.findFirst.mockResolvedValue(channel({ isPrivate: true }))
    expect((await get()).status).toBe(403)
    expect(prisma.chatMessage.findMany).not.toHaveBeenCalled()
  })
})
