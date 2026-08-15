jest.mock('../../src/lib/prisma', () => ({
  workspace:          { findUnique: jest.fn() },
  workspaceMember:    { findUnique: jest.fn(), findMany: jest.fn() },
  projectMember:      { findUnique: jest.fn(), findMany: jest.fn() },
  project:            { findFirst: jest.fn() },
  featureFlag:        { findUnique: jest.fn() },
  contentPiece:       { findFirst: jest.fn() },
  contentComment:     { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
  notification:       { createMany: jest.fn() },
}))

jest.mock('../../src/lib/socket', () => ({ emitTo: jest.fn() }))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const { emitTo } = require('../../src/lib/socket')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const PROJECT_ID     = 7
const PIECE_ID       = 10
const BASE           = `/api/contenido/projects/${PROJECT_ID}/pieces/${PIECE_ID}/comments`

function authHeader(userId = 1, role = 'admin', name = 'Ana') {
  const token = jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name, email: 'a@t.com' },
    SECRET,
  )
  return `Bearer ${token}`
}

function req(method, url, { userId = 1, role = 'admin', name = 'Ana' } = {}) {
  return request(app)[method](url)
    .set('Authorization', authHeader(userId, role, name))
    .set('X-Workspace', WORKSPACE_SLUG)
}

function mockBase({ workspaceRole = 'admin', flagOn = true } = {}) {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss',
    disabledFeatureKeys: '[]',
    members: [{ workspaceId: WORKSPACE_ID, userId: 1, role: workspaceRole, active: true }],
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: workspaceRole, active: true })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'contenido', enabledGlobally: flagOn, enabledWorkspaceIds: '[]' })
  prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID, timezone: 'America/Argentina/Buenos_Aires' })
  prisma.contentPiece.findFirst.mockResolvedValue({ id: PIECE_ID, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, title: 'Reel de lanzamiento', assets: [] })
}

const dbComment = (over = {}) => ({
  id: 1, workspaceId: WORKSPACE_ID, pieceId: PIECE_ID, visibility: 'internal',
  authorUserId: 1, authorContactId: null, authorName: 'Ana', body: 'hola equipo',
  createdAt: new Date(),
  authorUser: { id: 1, name: 'Ana', avatar: 'a.png' },
  ...over,
})

beforeEach(() => jest.clearAllMocks())

describe('Comentarios — gating', () => {
  it('403 FEATURE_NOT_ENABLED con el flag apagado', async () => {
    mockBase({ flagOn: false })
    const res = await req('get', BASE)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FEATURE_NOT_ENABLED')
  })

  it('401 sin token', async () => {
    mockBase()
    const res = await request(app).get(BASE).set('X-Workspace', WORKSPACE_SLUG)
    expect(res.status).toBe(401)
  })
})

describe('GET /comments', () => {
  it('lista todo el hilo (internal + client) sin exigir ser del equipo del proyecto', async () => {
    mockBase({ workspaceRole: 'member' })
    prisma.projectMember.findUnique.mockResolvedValue(null) // no es del equipo — igual puede leer
    prisma.contentComment.findMany.mockResolvedValue([
      dbComment({ id: 1, visibility: 'internal' }),
      dbComment({ id: 2, visibility: 'client', authorUser: null, authorContactId: 5, authorName: 'María (cliente)' }),
    ])

    const res = await req('get', BASE)

    expect(res.status).toBe(200)
    expect(res.body.comments).toHaveLength(2)
    expect(res.body.comments[0]).toEqual(expect.objectContaining({ visibility: 'internal', author: { id: 1, name: 'Ana', avatar: 'a.png', isTeam: true } }))
    expect(res.body.comments[1]).toEqual(expect.objectContaining({ visibility: 'client', author: { id: 5, name: 'María (cliente)', isTeam: false } }))
  })

  it('404 si la pieza no existe en el proyecto', async () => {
    mockBase()
    prisma.contentPiece.findFirst.mockResolvedValue(null)
    const res = await req('get', BASE)
    expect(res.status).toBe(404)
  })
})

describe('POST /comments', () => {
  it('crea un comentario interno por default', async () => {
    mockBase()
    prisma.contentComment.create.mockResolvedValue(dbComment({ body: 'todo listo' }))

    const res = await req('post', BASE).send({ body: 'todo listo' })

    expect(res.status).toBe(201)
    expect(res.body.visibility).toBe('internal')
    expect(prisma.contentComment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ pieceId: PIECE_ID, visibility: 'internal', authorUserId: 1, body: 'todo listo' }),
    }))
    expect(emitTo).toHaveBeenCalledWith(
      `workspace:${WORKSPACE_ID}`, 'content:comment:new',
      expect.objectContaining({ projectId: PROJECT_ID, pieceId: PIECE_ID }),
    )
  })

  it('acepta visibility: client — el equipo respondiendo en el hilo del cliente', async () => {
    mockBase()
    prisma.contentComment.create.mockResolvedValue(dbComment({ visibility: 'client' }))

    const res = await req('post', BASE).send({ body: 'ya lo corregimos', visibility: 'client' })

    expect(res.status).toBe(201)
    expect(prisma.contentComment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ visibility: 'client' }),
    }))
  })

  it('un visibility inválido cae a internal (nunca deja pasar un valor arbitrario)', async () => {
    mockBase()
    prisma.contentComment.create.mockResolvedValue(dbComment())

    await req('post', BASE).send({ body: 'x', visibility: 'algo-raro' })

    expect(prisma.contentComment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ visibility: 'internal' }),
    }))
  })

  it('400 con body vacío', async () => {
    mockBase()
    const res = await req('post', BASE).send({ body: '   ' })
    expect(res.status).toBe(400)
    expect(prisma.contentComment.create).not.toHaveBeenCalled()
  })

  it('400 con body demasiado largo', async () => {
    mockBase()
    const res = await req('post', BASE).send({ body: 'x'.repeat(4001) })
    expect(res.status).toBe(400)
  })

  it('403 si no puede escribir', async () => {
    mockBase({ workspaceRole: 'member' })
    prisma.projectMember.findUnique.mockResolvedValue(null)
    const res = await req('post', BASE).send({ body: 'hola' })
    expect(res.status).toBe(403)
    expect(prisma.contentComment.create).not.toHaveBeenCalled()
  })

  it('404 si la pieza no existe', async () => {
    mockBase()
    prisma.contentPiece.findFirst.mockResolvedValue(null)
    const res = await req('post', BASE).send({ body: 'hola' })
    expect(res.status).toBe(404)
  })

  describe('menciones', () => {
    it('notifica a cada mencionado y emite notification:new', async () => {
      mockBase()
      prisma.contentComment.create.mockResolvedValue(dbComment({ body: '@Bruno y @Carla revisen esto' }))
      prisma.workspaceMember.findMany.mockResolvedValue([
        { userId: 2, user: { id: 2, name: 'Bruno' } },
        { userId: 3, user: { id: 3, name: 'Carla' } },
        { userId: 1, user: { id: 1, name: 'Ana' } }, // el autor, no debería notificarse a sí mismo
      ])

      const res = await req('post', BASE).send({ body: '@Bruno y @Carla revisen esto' })

      expect(res.status).toBe(201)
      expect(prisma.notification.createMany).toHaveBeenCalledTimes(1)
      const data = prisma.notification.createMany.mock.calls[0][0].data
      expect(data).toHaveLength(2)
      expect(data.every(n => n.type === 'CONTENT_MENTION' && n.contentPieceId === PIECE_ID)).toBe(true)
      expect(data.map(n => n.userId).sort()).toEqual([2, 3])
      expect(emitTo).toHaveBeenCalledWith('user:2', 'notification:new', expect.objectContaining({ type: 'CONTENT_MENTION' }))
      expect(emitTo).toHaveBeenCalledWith('user:3', 'notification:new', expect.objectContaining({ type: 'CONTENT_MENTION' }))
    })

    it('no consulta miembros si el texto no tiene @', async () => {
      mockBase()
      prisma.contentComment.create.mockResolvedValue(dbComment({ body: 'sin menciones' }))

      await req('post', BASE).send({ body: 'sin menciones' })

      expect(prisma.workspaceMember.findMany).not.toHaveBeenCalled()
      expect(prisma.notification.createMany).not.toHaveBeenCalled()
    })

    it('un nombre que no matchea ningún miembro no genera notificación', async () => {
      mockBase()
      prisma.contentComment.create.mockResolvedValue(dbComment({ body: '@NadieConEseNombre revisá esto' }))
      prisma.workspaceMember.findMany.mockResolvedValue([{ userId: 2, user: { id: 2, name: 'Bruno' } }])

      await req('post', BASE).send({ body: '@NadieConEseNombre revisá esto' })

      expect(prisma.notification.createMany).not.toHaveBeenCalled()
    })

    it('la query de miembros solo trae activos del workspace, no del proyecto', async () => {
      mockBase()
      prisma.contentComment.create.mockResolvedValue(dbComment({ body: '@Bruno' }))
      prisma.workspaceMember.findMany.mockResolvedValue([{ userId: 2, user: { id: 2, name: 'Bruno' } }])

      await req('post', BASE).send({ body: '@Bruno' })

      expect(prisma.workspaceMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { workspaceId: WORKSPACE_ID, active: true },
      }))
    })
  })
})

describe('DELETE /comments/:cid', () => {
  it('el autor puede borrar su propio comentario', async () => {
    mockBase({ workspaceRole: 'member' })
    prisma.projectMember.findUnique.mockResolvedValue(null) // ni siquiera hace falta ser del equipo
    prisma.contentComment.findFirst.mockResolvedValue(dbComment({ authorUserId: 1 }))

    const res = await req('delete', `${BASE}/1`, { userId: 1, role: 'member' })

    expect(res.status).toBe(200)
    expect(prisma.contentComment.delete).toHaveBeenCalledWith({ where: { id: 1 } })
    expect(emitTo).toHaveBeenCalledWith(`workspace:${WORKSPACE_ID}`, 'content:comment:deleted', expect.objectContaining({ id: 1 }))
  })

  it('un admin puede borrar el comentario de otra persona (moderación)', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentComment.findFirst.mockResolvedValue(dbComment({ authorUserId: 99 }))

    const res = await req('delete', `${BASE}/1`, { userId: 1, role: 'admin' })

    expect(res.status).toBe(200)
    expect(prisma.contentComment.delete).toHaveBeenCalled()
  })

  it('403 si no es ni el autor ni admin', async () => {
    mockBase({ workspaceRole: 'member' })
    prisma.contentComment.findFirst.mockResolvedValue(dbComment({ authorUserId: 99 }))

    const res = await req('delete', `${BASE}/1`, { userId: 1, role: 'member' })

    expect(res.status).toBe(403)
    expect(prisma.contentComment.delete).not.toHaveBeenCalled()
  })

  it('404 si el comentario no existe en esta pieza', async () => {
    mockBase()
    prisma.contentComment.findFirst.mockResolvedValue(null)
    const res = await req('delete', `${BASE}/999`)
    expect(res.status).toBe(404)
  })

  it('404 si la pieza no existe', async () => {
    mockBase()
    prisma.contentPiece.findFirst.mockResolvedValue(null)
    const res = await req('delete', `${BASE}/1`)
    expect(res.status).toBe(404)
  })
})
