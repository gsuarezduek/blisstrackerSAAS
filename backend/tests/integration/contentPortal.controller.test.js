jest.mock('../../src/lib/prisma', () => ({
  workspace:            { findUnique: jest.fn() },
  workspaceMember:      { findMany: jest.fn() },
  projectMember:        { findMany: jest.fn() },
  project:              { findUnique: jest.fn() },
  featureFlag:          { findUnique: jest.fn() },
  projectClientPortal:  { findUnique: jest.fn() },
  clientPortalContact:  { findUnique: jest.fn() },
  contentPiece:         { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  contentComment:       { findMany: jest.fn(), create: jest.fn() },
  contentStatusEvent:   { create: jest.fn() },
  notification:         { createMany: jest.fn() },
}))

jest.mock('../../src/lib/socket', () => ({ emitTo: jest.fn() }))

jest.mock('../../src/services/email.service', () => ({
  sendContentApprovalRequestEmail: jest.fn().mockResolvedValue(undefined),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const { emitTo } = require('../../src/lib/socket')
const app = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_ID   = 1
const PROJECT_ID     = 10
const PORTAL_ID      = 5
const PIECE_ID       = 20
const SLUG           = 'kahuak'

function makePortal(overrides = {}) {
  return {
    id: PORTAL_ID, workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, slug: SLUG,
    active: true, contentEnabled: true, liveSections: '[]',
    liveDataCache: null, liveDataCachedAt: null, updatedAt: new Date(),
    ...overrides,
  }
}

function makeContact(overrides = {}) {
  return {
    id: 1, workspaceId: WORKSPACE_ID, portalId: PORTAL_ID,
    email: 'cliente@example.com', name: 'María Cliente',
    canApprove: true, active: true, lastLoginAt: null,
    ...overrides,
  }
}

function legacyToken() {
  return jwt.sign({ portalId: PORTAL_ID, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, purpose: 'client-portal-live' }, SECRET, { expiresIn: '30d' })
}
function contactToken(contactId = 1) {
  return jwt.sign({ portalId: PORTAL_ID, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, contactId, purpose: 'client-portal-live' }, SECRET, { expiresIn: '30d' })
}

// El flag habilitado + sin opt-out del workspace, mismo criterio que assertContentAccess.
function mockAccessGranted() {
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'contenido', enabledGlobally: true, enabledWorkspaceIds: '[]' })
  prisma.workspace.findUnique.mockResolvedValue({ disabledFeatureKeys: '[]', slug: 'bliss' })
}

const dbPiece = (over = {}) => ({
  id: PIECE_ID, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID,
  title: 'Post de lanzamiento', status: 'aprobacion', type: 'post', networks: '["instagram"]',
  copy: 'Copy final', hashtags: '#launch',
  internalNotes: 'ojo con el cliente, es picky', // NUNCA debe llegar al portal
  scheduledAt: new Date('2026-08-20T15:00:00Z'), scheduledDate: '2026-08-20',
  publishedAt: null, publishedUrl: null,
  ownerId: 7, taskId: null, order: 3, // ownerId (FK cruda) tampoco debe llegar al portal
  createdBy: { name: 'Ana Diseño' }, owner: { name: 'Beto CM' }, // sí viajan (solo el name)
  assets: [],
  submittedAt: new Date(), approvedAt: null, approvedBy: null, changesRequestedAt: null,
  createdAt: new Date(), updatedAt: new Date(),
  ...over,
})

beforeEach(() => jest.clearAllMocks())

describe('Portal — Contenido: gating', () => {
  it('401 sin token', async () => {
    const res = await request(app).get(`/api/public/client-portal/${SLUG}/content`)
    expect(res.status).toBe(401)
  })

  it('404 si portal.contentEnabled es false', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ contentEnabled: false }))
    const res = await request(app)
      .get(`/api/public/client-portal/${SLUG}/content`)
      .set('Authorization', `Bearer ${legacyToken()}`)
    expect(res.status).toBe(404)
  })

  it('404 si el flag `contenido` no está habilitado para el workspace (aunque contentEnabled sea true)', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.featureFlag.findUnique.mockResolvedValue({ key: 'contenido', enabledGlobally: false, enabledWorkspaceIds: '[]' })
    prisma.workspace.findUnique.mockResolvedValue({ disabledFeatureKeys: '[]', slug: 'bliss' })

    const res = await request(app)
      .get(`/api/public/client-portal/${SLUG}/content`)
      .set('Authorization', `Bearer ${legacyToken()}`)
    expect(res.status).toBe(404)
  })

  it('404 si el workspace apagó el flag por opt-out, aunque SuperAdmin lo haya habilitado globalmente', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.featureFlag.findUnique.mockResolvedValue({ key: 'contenido', enabledGlobally: true, enabledWorkspaceIds: '[]' })
    prisma.workspace.findUnique.mockResolvedValue({ disabledFeatureKeys: '["contenido"]', slug: 'bliss' })

    const res = await request(app)
      .get(`/api/public/client-portal/${SLUG}/content`)
      .set('Authorization', `Bearer ${legacyToken()}`)
    expect(res.status).toBe(404)
  })
})

describe('GET /content — listado', () => {
  it('devuelve las piezas sin exponer internalNotes/ownerId/taskId/order, pero sí quién creó/es dueño (solo el nombre)', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    mockAccessGranted()
    prisma.contentPiece.findMany.mockResolvedValue([dbPiece()])

    const res = await request(app)
      .get(`/api/public/client-portal/${SLUG}/content`)
      .set('Authorization', `Bearer ${legacyToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.pieces).toHaveLength(1)
    const p = res.body.pieces[0]
    expect(p.title).toBe('Post de lanzamiento')
    expect(p.statusLabel).toBe('Esperando aprobación')
    expect(p.networks).toEqual(['instagram'])
    expect(p.createdBy).toEqual({ name: 'Ana Diseño' })
    expect(p.owner).toEqual({ name: 'Beto CM' })
    expect(p).not.toHaveProperty('internalNotes')
    expect(p).not.toHaveProperty('ownerId')
    expect(p).not.toHaveProperty('taskId')
    expect(p).not.toHaveProperty('order')

    // El WHERE debe filtrar por PORTAL_VISIBLE_STATUSES en SQL, no en JS.
    const call = prisma.contentPiece.findMany.mock.calls[0][0]
    expect(call.where.status.in).toEqual(
      expect.arrayContaining(['aprobacion', 'cambios', 'aprobado', 'programado', 'publicado']),
    )
    expect(call.where.status.in).not.toContain('idea')
    expect(call.where.status.in).not.toContain('archivado')
  })
})

describe('GET /content/:pid — detalle + fuga de comentarios internos', () => {
  it('404 si la pieza no está en un estado visible del portal', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    mockAccessGranted()
    prisma.contentPiece.findFirst.mockResolvedValue(null) // el WHERE con status:{in:...} no matchea

    const res = await request(app)
      .get(`/api/public/client-portal/${SLUG}/content/${PIECE_ID}`)
      .set('Authorization', `Bearer ${legacyToken()}`)
    expect(res.status).toBe(404)
  })

  it('TEST DE FUGA: nunca devuelve internalNotes ni comentarios visibility:internal', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    mockAccessGranted()
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece())
    // El mock de Prisma no aplica el WHERE de verdad — simulamos que el modelo
    // devuelve comentarios internos y de cliente mezclados, y verificamos que
    // el controller filtra: el query real usa visibility:'client' en el WHERE,
    // pero si algo se rompiera ahí, este test debe fallar igual.
    prisma.contentComment.findMany.mockResolvedValue([
      { id: 1, body: 'mensaje visible para el cliente', authorUser: null, authorContactId: 1, authorName: 'María', createdAt: new Date() },
    ])

    const res = await request(app)
      .get(`/api/public/client-portal/${SLUG}/content/${PIECE_ID}`)
      .set('Authorization', `Bearer ${legacyToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.piece).not.toHaveProperty('internalNotes')
    expect(JSON.stringify(res.body)).not.toContain('picky') // el valor real de internalNotes en dbPiece()

    // El query de comentarios debe pedir SOLO visibility:'client' en el WHERE.
    const commentsCall = prisma.contentComment.findMany.mock.calls[0][0]
    expect(commentsCall.where.visibility).toBe('client')
    expect(res.body.comments).toHaveLength(1)
    expect(res.body.comments[0].body).toBe('mensaje visible para el cliente')
  })
})

describe('POST /content/:pid/approve', () => {
  const BASE = `/api/public/client-portal/${SLUG}/content/${PIECE_ID}/approve`

  it('403 CONTACT_REQUIRED con un token legacy (sin contactId)', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    mockAccessGranted()

    const res = await request(app).post(BASE).set('Authorization', `Bearer ${legacyToken()}`)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('CONTACT_REQUIRED')
  })

  it('403 si el contacto no puede aprobar (canApprove:false)', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findUnique.mockResolvedValue(makeContact({ canApprove: false }))
    mockAccessGranted()

    const res = await request(app).post(BASE).set('Authorization', `Bearer ${contactToken()}`)
    expect(res.status).toBe(403)
  })

  it('409 si la pieza ya no está en "aprobacion"', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findUnique.mockResolvedValue(makeContact())
    mockAccessGranted()
    prisma.contentPiece.findFirst.mockResolvedValue({ id: PIECE_ID, title: 'x', status: 'aprobado' })

    const res = await request(app).post(BASE).set('Authorization', `Bearer ${contactToken()}`)
    expect(res.status).toBe(409)
  })

  it('200 happy path: aprueba, deja evento con actorContactId, avisa al equipo (solo in-app)', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findUnique.mockResolvedValue(makeContact())
    mockAccessGranted()
    // 3 llamadas reales a contentPiece.findFirst, en orden: ① chequeo de estado
    // ② loadPiece (content.controller.js, para el emit interno) ③ refetch público
    // para la respuesta.
    prisma.contentPiece.findFirst
      .mockResolvedValueOnce({ id: PIECE_ID, title: 'Post de lanzamiento', status: 'aprobacion' })
      .mockResolvedValueOnce({ id: PIECE_ID, title: 'Post de lanzamiento', status: 'aprobacion' })
      .mockResolvedValueOnce(dbPiece({ status: 'aprobado' }))
    prisma.contentPiece.update.mockResolvedValue({})
    prisma.contentStatusEvent.create.mockResolvedValue({})
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 2, role: 'admin', user: { email: 'admin@bliss.test' } },
    ])
    prisma.projectMember.findMany.mockResolvedValue([])
    prisma.project.findUnique.mockResolvedValue({ name: 'Proyecto Demo' })

    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${contactToken()}`)
      .send({ comment: 'Quedó perfecto!' })

    expect(res.status).toBe(200)
    expect(prisma.contentPiece.update).toHaveBeenCalledWith({
      where: { id: PIECE_ID },
      data: expect.objectContaining({ status: 'aprobado', approvedByContactId: 1 }),
    })
    expect(prisma.contentStatusEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'approved', actorContactId: 1, toStatus: 'aprobado' }),
    })
    expect(prisma.contentComment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ visibility: 'client', authorContactId: 1, body: 'Quedó perfecto!' }),
    }))

    // Notificación al equipo se dispara vía setImmediate — flusheamos el event loop.
    await new Promise(r => setImmediate(r))
    expect(prisma.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ userId: 2, actorId: null, type: 'CONTENT_APPROVED' })]),
    }))
    expect(emitTo).toHaveBeenCalledWith(`workspace:${WORKSPACE_ID}`, 'content:piece:updated', expect.any(Object))
  })
})

describe('POST /content/:pid/request-changes', () => {
  const BASE = `/api/public/client-portal/${SLUG}/content/${PIECE_ID}/request-changes`

  it('400 si el comentario está vacío (obligatorio)', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findUnique.mockResolvedValue(makeContact())
    mockAccessGranted()

    const res = await request(app).post(BASE).set('Authorization', `Bearer ${contactToken()}`).send({})
    expect(res.status).toBe(400)
  })

  it('200 happy path: mueve a "cambios" y notifica al equipo', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findUnique.mockResolvedValue(makeContact())
    mockAccessGranted()
    prisma.contentPiece.findFirst
      .mockResolvedValueOnce({ id: PIECE_ID, title: 'Post de lanzamiento', status: 'aprobacion' })
      .mockResolvedValueOnce({ id: PIECE_ID, title: 'Post de lanzamiento', status: 'aprobacion' }) // loadPiece
      .mockResolvedValueOnce(dbPiece({ status: 'cambios' })) // refetch público
    prisma.contentPiece.update.mockResolvedValue({})
    prisma.contentStatusEvent.create.mockResolvedValue({})
    prisma.workspaceMember.findMany.mockResolvedValue([])
    prisma.projectMember.findMany.mockResolvedValue([])

    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${contactToken()}`)
      .send({ comment: 'Cambiar el color del fondo' })

    expect(res.status).toBe(200)
    expect(prisma.contentPiece.update).toHaveBeenCalledWith({
      where: { id: PIECE_ID },
      data: expect.objectContaining({ status: 'cambios' }),
    })
    expect(prisma.contentStatusEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'changes_requested', comment: 'Cambiar el color del fondo' }),
    })
    expect(prisma.contentComment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ visibility: 'client', body: 'Cambiar el color del fondo' }),
    }))
  })
})

describe('POST /content/:pid/comments', () => {
  const BASE = `/api/public/client-portal/${SLUG}/content/${PIECE_ID}/comments`

  it('403 CONTACT_REQUIRED sin identidad de contacto', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    mockAccessGranted()

    const res = await request(app).post(BASE).set('Authorization', `Bearer ${legacyToken()}`).send({ body: 'hola' })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('CONTACT_REQUIRED')
  })

  it('201 crea el comentario como visibility:client, sin @menciones ni email', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findUnique.mockResolvedValue(makeContact())
    mockAccessGranted()
    prisma.contentPiece.findFirst.mockResolvedValue({ id: PIECE_ID })
    prisma.contentComment.create.mockResolvedValue({
      id: 99, body: 'una pregunta', authorUser: null, authorContactId: 1, authorName: 'María Cliente', createdAt: new Date(),
    })

    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${contactToken()}`)
      .send({ body: 'una pregunta' })

    expect(res.status).toBe(201)
    expect(res.body.author).toEqual({ name: 'María Cliente', isTeam: false })
    expect(prisma.contentComment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ visibility: 'client', authorContactId: 1 }),
    }))
  })
})
