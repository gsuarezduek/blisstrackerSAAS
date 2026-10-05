jest.mock('../../src/lib/prisma', () => ({
  workspace:            { findUnique: jest.fn() },
  workspaceMember:      { findUnique: jest.fn(), findMany: jest.fn() },
  projectMember:        { findMany: jest.fn(), findUnique: jest.fn() },
  project:              { findUnique: jest.fn() },
  chatChannel:          { findFirst: jest.fn() },
  chatMessage:          { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  chatChannelRead:      { upsert: jest.fn(), findUnique: jest.fn() },
  chatMessageReaction:  { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
  notification:         { createMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  deviceToken:          { findMany: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1

function authHeader(userId = 1) {
  const token = jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role: 'member', isSuperAdmin: false, name: 'Autor', email: 't@t.com' },
    SECRET,
  )
  return `Bearer ${token}`
}

function mockWorkspace(role = 'member') {
  prisma.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss' })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role, active: true })
}

function makeChannel(overrides = {}) {
  return {
    id: 5, workspaceId: WORKSPACE_ID, kind: 'custom', slug: 'general', name: 'General',
    isPrivate: false, projectId: null, project: null,
    ...overrides,
  }
}

function makeMessage(overrides = {}) {
  return {
    id: 100, channelId: 5, authorId: 1, content: 'Hola equipo', pinnedAt: null,
    author: { id: 1, name: 'Autor', avatar: 'bee.png' },
    ...overrides,
  }
}

// deviceToken sin resultados — evita que sendPushToUser (best-effort) intente
// nada más allá de la query inicial.
beforeEach(() => {
  jest.clearAllMocks()
  prisma.deviceToken.findMany.mockResolvedValue([])
})

// ── POST /api/chat/channels/:id/messages (sendMessage) ────────────────────────

describe('POST /api/chat/channels/:id/messages', () => {
  beforeEach(() => mockWorkspace())

  it('devuelve 400 si el mensaje está vacío y no hay gif', async () => {
    const res = await request(app)
      .post('/api/chat/channels/5/messages')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ content: '   ' })

    expect(res.status).toBe(400)
  })

  it('devuelve 404 si el canal no existe', async () => {
    prisma.chatChannel.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/chat/channels/5/messages')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ content: 'Hola' })

    expect(res.status).toBe(404)
  })

  it('devuelve 403 si el canal es privado y el usuario no es admin/owner', async () => {
    mockWorkspace('member')
    prisma.chatChannel.findFirst.mockResolvedValue(makeChannel({ isPrivate: true }))

    const res = await request(app)
      .post('/api/chat/channels/5/messages')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ content: 'Hola' })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('CHANNEL_PRIVATE')
    expect(prisma.chatMessage.create).not.toHaveBeenCalled()
  })

  it('un admin sí puede postear en un canal privado', async () => {
    mockWorkspace('admin')
    prisma.chatChannel.findFirst.mockResolvedValue(makeChannel({ isPrivate: true }))
    prisma.chatMessage.create.mockResolvedValue(makeMessage())
    prisma.chatChannelRead.upsert.mockResolvedValue({})

    const res = await request(app)
      .post('/api/chat/channels/5/messages')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ content: 'Hola' })

    expect(res.status).toBe(201)
  })

  it('crea el mensaje y marca leído para el autor', async () => {
    prisma.chatChannel.findFirst.mockResolvedValue(makeChannel())
    prisma.chatMessage.create.mockResolvedValue(makeMessage())
    prisma.chatChannelRead.upsert.mockResolvedValue({})

    const res = await request(app)
      .post('/api/chat/channels/5/messages')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ content: 'Hola equipo' })

    expect(res.status).toBe(201)
    expect(prisma.chatChannelRead.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { channelId_userId: { channelId: 5, userId: 1 } },
    }))
  })

  it('"@everyone" notifica a todo el workspace activo salvo al autor', async () => {
    prisma.chatChannel.findFirst.mockResolvedValue(makeChannel())
    prisma.chatMessage.create.mockResolvedValue(makeMessage({ content: 'Aviso para @everyone' }))
    prisma.chatChannelRead.upsert.mockResolvedValue({})
    prisma.workspaceMember.findMany.mockResolvedValue([
      { user: { id: 1, name: 'Autor' } },
      { user: { id: 2, name: 'Otra Persona' } },
      { user: { id: 3, name: 'Tercera Persona' } },
    ])
    prisma.notification.createMany.mockResolvedValue({ count: 2 })

    await request(app)
      .post('/api/chat/channels/5/messages')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ content: 'Aviso para @everyone' })

    const call = prisma.notification.createMany.mock.calls[0][0]
    const notifiedIds = call.data.map(n => n.userId)
    expect(notifiedIds.sort()).toEqual([2, 3])
    expect(call.data[0].type).toBe('CHAT_MENTION')
    expect(call.data[0].message).toContain('mencionó a todo el equipo')
  })

  it('"@equipo" en un canal de proyecto solo notifica al equipo de ESE proyecto', async () => {
    prisma.chatChannel.findFirst.mockResolvedValue(makeChannel({ kind: 'project', projectId: 9, project: { name: 'Proyecto X', isPrivate: false } }))
    prisma.chatMessage.create.mockResolvedValue(makeMessage({ content: 'Che @equipo' }))
    prisma.chatChannelRead.upsert.mockResolvedValue({})
    prisma.workspaceMember.findMany.mockResolvedValue([
      { user: { id: 1, name: 'Autor' } },
      { user: { id: 2, name: 'Del Equipo' } },
      { user: { id: 3, name: 'Ajeno Al Proyecto' } },
    ])
    prisma.projectMember.findMany.mockResolvedValue([{ userId: 2 }])
    prisma.notification.createMany.mockResolvedValue({ count: 1 })

    await request(app)
      .post('/api/chat/channels/5/messages')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ content: 'Che @equipo' })

    const call = prisma.notification.createMany.mock.calls[0][0]
    const notifiedIds = call.data.map(n => n.userId)
    expect(notifiedIds).toEqual([2])
    expect(call.data[0].message).toContain('mencionó al equipo del proyecto')
  })

  it('menciona por nombre a un solo usuario (sin @everyone ni @equipo)', async () => {
    prisma.chatChannel.findFirst.mockResolvedValue(makeChannel())
    prisma.chatMessage.create.mockResolvedValue(makeMessage({ content: 'Avisale a @María José García' }))
    prisma.chatChannelRead.upsert.mockResolvedValue({})
    prisma.workspaceMember.findMany.mockResolvedValue([
      { user: { id: 1, name: 'Autor' } },
      { user: { id: 7, name: 'María José García' } },
    ])
    prisma.notification.createMany.mockResolvedValue({ count: 1 })

    await request(app)
      .post('/api/chat/channels/5/messages')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ content: 'Avisale a @María José García' })

    const call = prisma.notification.createMany.mock.calls[0][0]
    expect(call.data.map(n => n.userId)).toEqual([7])
    expect(call.data[0].message).toBe('te mencionó en #General')
  })

  it('responder a un mensaje notifica al autor original como si lo hubieran mencionado', async () => {
    prisma.chatChannel.findFirst.mockResolvedValue(makeChannel())
    prisma.chatMessage.findFirst.mockResolvedValue({ id: 50, authorId: 2 }) // replyTarget
    prisma.chatMessage.create.mockResolvedValue(makeMessage({ content: 'De acuerdo' }))
    prisma.chatChannelRead.upsert.mockResolvedValue({})
    prisma.notification.create.mockResolvedValue({})

    await request(app)
      .post('/api/chat/channels/5/messages')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ content: 'De acuerdo', replyToId: 50 })

    expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 2, type: 'CHAT_MENTION', message: expect.stringContaining('te respondió') }),
    }))
  })

  it('no notifica dos veces si responde Y menciona a la misma persona', async () => {
    prisma.chatChannel.findFirst.mockResolvedValue(makeChannel())
    prisma.chatMessage.findFirst.mockResolvedValue({ id: 50, authorId: 7 }) // replyTarget == mencionado
    prisma.chatMessage.create.mockResolvedValue(makeMessage({ content: '@María José García de acuerdo' }))
    prisma.chatChannelRead.upsert.mockResolvedValue({})
    prisma.workspaceMember.findMany.mockResolvedValue([
      { user: { id: 1, name: 'Autor' } },
      { user: { id: 7, name: 'María José García' } },
    ])
    prisma.notification.createMany.mockResolvedValue({ count: 1 })

    await request(app)
      .post('/api/chat/channels/5/messages')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ content: '@María José García de acuerdo', replyToId: 50 })

    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1)
    expect(prisma.notification.create).not.toHaveBeenCalled()
  })

  it('no se auto-notifica al responderse a sí mismo', async () => {
    prisma.chatChannel.findFirst.mockResolvedValue(makeChannel())
    prisma.chatMessage.findFirst.mockResolvedValue({ id: 50, authorId: 1 }) // mismo autor
    prisma.chatMessage.create.mockResolvedValue(makeMessage({ content: 'Aclaro algo' }))
    prisma.chatChannelRead.upsert.mockResolvedValue({})

    await request(app)
      .post('/api/chat/channels/5/messages')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ content: 'Aclaro algo', replyToId: 50 })

    expect(prisma.notification.create).not.toHaveBeenCalled()
  })

  it('devuelve 401 sin autenticación', async () => {
    const res = await request(app)
      .post('/api/chat/channels/5/messages')
      .send({ content: 'Hola' })

    expect(res.status).toBe(401)
  })
})

// ── GET /api/chat/channels/:id/messages (listMessages — acceso) ───────────────

describe('GET /api/chat/channels/:id/messages', () => {
  beforeEach(() => mockWorkspace())

  it('devuelve 403 en un canal privado para un miembro no-admin', async () => {
    prisma.chatChannel.findFirst.mockResolvedValue(makeChannel({ isPrivate: true }))

    const res = await request(app)
      .get('/api/chat/channels/5/messages')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('CHANNEL_PRIVATE')
  })

  it('un canal de un proyecto privado solo lo ve su equipo (no cualquier miembro)', async () => {
    prisma.chatChannel.findFirst.mockResolvedValue(makeChannel({ kind: 'project', projectId: 9 }))
    prisma.project.findUnique.mockResolvedValue({ isPrivate: true })
    prisma.projectMember.findUnique.mockResolvedValue(null) // no es del equipo -> canWrite() false

    const res = await request(app)
      .get('/api/chat/channels/5/messages')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('PROJECT_PRIVATE')
  })
})

// ── PATCH /api/chat/messages/:messageId (editMessage) ──────────────────────────

describe('PATCH /api/chat/messages/:messageId', () => {
  beforeEach(() => mockWorkspace())

  it('devuelve 403 si no es el autor del mensaje', async () => {
    prisma.chatMessage.findFirst.mockResolvedValue(makeMessage({ authorId: 2 }))

    const res = await request(app)
      .patch('/api/chat/messages/100')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ content: 'Editado' })

    expect(res.status).toBe(403)
    expect(prisma.chatMessage.update).not.toHaveBeenCalled()
  })

  it('edita el propio mensaje', async () => {
    prisma.chatMessage.findFirst.mockResolvedValue(makeMessage({ authorId: 1 }))
    prisma.chatMessage.update.mockResolvedValue(makeMessage({ content: 'Editado' }))

    const res = await request(app)
      .patch('/api/chat/messages/100')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ content: 'Editado' })

    expect(res.status).toBe(200)
    expect(res.body.content).toBe('Editado')
  })
})

// ── DELETE /api/chat/messages/:messageId (deleteMessage) ───────────────────────

describe('DELETE /api/chat/messages/:messageId', () => {
  it('devuelve 403 si no es el autor ni admin/owner', async () => {
    mockWorkspace('member')
    prisma.chatMessage.findFirst.mockResolvedValue(makeMessage({ authorId: 2 }))

    const res = await request(app)
      .delete('/api/chat/messages/100')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(403)
    expect(prisma.chatMessage.delete).not.toHaveBeenCalled()
  })

  it('un admin puede eliminar el mensaje de otra persona', async () => {
    mockWorkspace('admin')
    prisma.chatMessage.findFirst.mockResolvedValue(makeMessage({ authorId: 2 }))
    prisma.chatMessage.delete.mockResolvedValue({})

    const res = await request(app)
      .delete('/api/chat/messages/100')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(prisma.chatMessage.delete).toHaveBeenCalledWith({ where: { id: 100 } })
  })

  it('el propio autor puede eliminar su mensaje aunque sea member', async () => {
    mockWorkspace('member')
    prisma.chatMessage.findFirst.mockResolvedValue(makeMessage({ authorId: 1 }))
    prisma.chatMessage.delete.mockResolvedValue({})

    const res = await request(app)
      .delete('/api/chat/messages/100')
      .set('Authorization', authHeader(1))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
  })
})

// ── POST /api/chat/messages/:messageId/reactions (toggleReaction) ─────────────

describe('POST /api/chat/messages/:messageId/reactions', () => {
  beforeEach(() => {
    mockWorkspace()
    prisma.chatMessage.findFirst.mockResolvedValue(makeMessage())
    prisma.chatChannel.findFirst.mockResolvedValue(makeChannel())
  })

  it('agrega la reacción si no existía (toggle on)', async () => {
    prisma.chatMessageReaction.findUnique.mockResolvedValue(null)
    prisma.chatMessageReaction.create.mockResolvedValue({ id: 1 })
    prisma.chatMessage.findUnique.mockResolvedValue({ ...makeMessage(), reactions: [{ id: 1, emoji: '👍', userId: 1, user: { name: 'Autor' } }] })

    const res = await request(app)
      .post('/api/chat/messages/100/reactions')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ emoji: '👍' })

    expect(res.status).toBe(200)
    expect(prisma.chatMessageReaction.create).toHaveBeenCalledWith({ data: { workspaceId: WORKSPACE_ID, messageId: 100, userId: 1, emoji: '👍' } })
    expect(prisma.chatMessageReaction.delete).not.toHaveBeenCalled()
  })

  it('quita la reacción si ya existía (toggle off)', async () => {
    prisma.chatMessageReaction.findUnique.mockResolvedValue({ id: 77 })
    prisma.chatMessage.findUnique.mockResolvedValue({ ...makeMessage(), reactions: [] })

    const res = await request(app)
      .post('/api/chat/messages/100/reactions')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ emoji: '👍' })

    expect(res.status).toBe(200)
    expect(prisma.chatMessageReaction.delete).toHaveBeenCalledWith({ where: { id: 77 } })
    expect(prisma.chatMessageReaction.create).not.toHaveBeenCalled()
  })

  it('devuelve 400 con emoji vacío', async () => {
    const res = await request(app)
      .post('/api/chat/messages/100/reactions')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ emoji: '   ' })

    expect(res.status).toBe(400)
  })
})

// ── POST /api/chat/channels/:id/read (markRead) ────────────────────────────────

describe('POST /api/chat/channels/:id/read', () => {
  beforeEach(() => mockWorkspace())

  it('marca leído el canal y limpia las notificaciones CHAT_MENTION pendientes', async () => {
    prisma.chatChannel.findFirst.mockResolvedValue(makeChannel())
    prisma.chatMessage.findFirst.mockResolvedValue({ id: 123 })
    prisma.chatChannelRead.upsert.mockResolvedValue({})
    prisma.notification.updateMany.mockResolvedValue({ count: 2 })

    const res = await request(app)
      .post('/api/chat/channels/5/read')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(prisma.chatChannelRead.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { channelId_userId: { channelId: 5, userId: 1 } },
      update: expect.objectContaining({ lastReadMessageId: 123 }),
    }))
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 1, workspaceId: WORKSPACE_ID, channelId: 5, type: 'CHAT_MENTION', read: false },
      data: { read: true },
    })
  })
})

// ── PATCH /api/chat/messages/:messageId/pin (togglePin) ────────────────────────

describe('PATCH /api/chat/messages/:messageId/pin', () => {
  beforeEach(() => {
    mockWorkspace()
    prisma.chatMessage.findFirst.mockResolvedValue(makeMessage())
    prisma.chatChannel.findFirst.mockResolvedValue(makeChannel())
  })

  it('fija un mensaje y guarda quién lo fijó', async () => {
    prisma.chatMessage.update.mockResolvedValue(makeMessage({ pinnedAt: new Date(), pinnedById: 1 }))

    const res = await request(app)
      .patch('/api/chat/messages/100/pin')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ pinned: true })

    expect(res.status).toBe(200)
    expect(prisma.chatMessage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ pinnedById: 1 }),
    }))
  })

  it('desfija un mensaje (limpia pinnedAt/pinnedById)', async () => {
    prisma.chatMessage.update.mockResolvedValue(makeMessage({ pinnedAt: null, pinnedById: null }))

    const res = await request(app)
      .patch('/api/chat/messages/100/pin')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ pinned: false })

    expect(res.status).toBe(200)
    expect(prisma.chatMessage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { pinnedAt: null, pinnedById: null },
    }))
  })
})
