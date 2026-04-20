jest.mock('../../src/lib/prisma', () => ({
  announcement: {
    findMany:   jest.fn(),
    findUnique: jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
    delete:     jest.fn(),
  },
  workspace: { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_ID   = 1
const WORKSPACE_SLUG = 'bliss'

function superAdminToken(userId = 99) {
  return `Bearer ${jwt.sign(
    { userId, workspaceId: null, role: 'owner', isSuperAdmin: true, name: 'Super', email: 'super@bliss.ar' },
    SECRET,
  )}`
}

function userToken(userId = 1, role = 'member') {
  return `Bearer ${jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'User', email: 'user@bliss.ar' },
    SECRET,
  )}`
}

function mockWorkspace() {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss Marketing',
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({
    workspaceId: WORKSPACE_ID, userId: 1, role: 'member', active: true,
  })
}

const ANN = {
  id: 1, title: 'Mantenimiento programado', body: 'El servicio estará offline el sábado.',
  type: 'maintenance', targetAll: true, targetWorkspaceIds: '[]',
  active: true, startsAt: null, endsAt: null,
  createdBy: { id: 99, name: 'Super' },
}

// ── Superadmin CRUD ───────────────────────────────────────────────────────────

describe('POST /api/superadmin/announcements', () => {
  beforeEach(() => jest.clearAllMocks())

  it('crea un anuncio y retorna 201', async () => {
    prisma.announcement.create.mockResolvedValue(ANN)

    const res = await request(app)
      .post('/api/superadmin/announcements')
      .set('Authorization', superAdminToken())
      .send({ title: 'Mantenimiento programado', body: 'El servicio estará offline el sábado.', type: 'maintenance' })

    expect(res.status).toBe(201)
    expect(res.body.id).toBe(1)
    expect(prisma.announcement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'Mantenimiento programado', type: 'maintenance', targetAll: true }),
      }),
    )
  })

  it('retorna 400 si falta el título', async () => {
    const res = await request(app)
      .post('/api/superadmin/announcements')
      .set('Authorization', superAdminToken())
      .send({ body: 'Sin título', type: 'info' })

    expect(res.status).toBe(400)
  })

  it('retorna 400 si falta el cuerpo', async () => {
    const res = await request(app)
      .post('/api/superadmin/announcements')
      .set('Authorization', superAdminToken())
      .send({ title: 'Título', type: 'info' })

    expect(res.status).toBe(400)
  })

  it('retorna 400 si el tipo es inválido', async () => {
    const res = await request(app)
      .post('/api/superadmin/announcements')
      .set('Authorization', superAdminToken())
      .send({ title: 'Título', body: 'Cuerpo', type: 'tipoInvalido' })

    expect(res.status).toBe(400)
  })

  it('retorna 403 si el usuario no es superadmin', async () => {
    const res = await request(app)
      .post('/api/superadmin/announcements')
      .set('Authorization', userToken())
      .send({ title: 'Título', body: 'Cuerpo', type: 'info' })

    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/superadmin/announcements/:id/toggle', () => {
  beforeEach(() => jest.clearAllMocks())

  it('desactiva un anuncio activo', async () => {
    prisma.announcement.findUnique.mockResolvedValue({ active: true })
    prisma.announcement.update.mockResolvedValue({ ...ANN, active: false })

    const res = await request(app)
      .patch('/api/superadmin/announcements/1/toggle')
      .set('Authorization', superAdminToken())

    expect(res.status).toBe(200)
    expect(res.body.active).toBe(false)
    expect(prisma.announcement.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false } }),
    )
  })

  it('retorna 404 si el anuncio no existe', async () => {
    prisma.announcement.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/superadmin/announcements/999/toggle')
      .set('Authorization', superAdminToken())

    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/superadmin/announcements/:id', () => {
  beforeEach(() => jest.clearAllMocks())

  it('elimina un anuncio y retorna { ok: true }', async () => {
    prisma.announcement.findUnique.mockResolvedValue({ id: 1 })
    prisma.announcement.delete.mockResolvedValue({})

    const res = await request(app)
      .delete('/api/superadmin/announcements/1')
      .set('Authorization', superAdminToken())

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('retorna 404 si el anuncio no existe', async () => {
    prisma.announcement.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .delete('/api/superadmin/announcements/999')
      .set('Authorization', superAdminToken())

    expect(res.status).toBe(404)
  })
})

// ── GET /api/announcements/active — lógica de targeting ───────────────────────

describe('GET /api/announcements/active', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockWorkspace()
  })

  it('retorna anuncios con targetAll=true', async () => {
    prisma.announcement.findMany.mockResolvedValue([
      { ...ANN, targetAll: true, targetWorkspaceIds: '[]', startsAt: null, endsAt: null },
    ])

    const res = await request(app)
      .get('/api/announcements/active')
      .set('Authorization', userToken())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })

  it('retorna anuncios dirigidos al workspace del usuario', async () => {
    prisma.announcement.findMany.mockResolvedValue([
      { ...ANN, targetAll: false, targetWorkspaceIds: JSON.stringify([WORKSPACE_ID]), startsAt: null, endsAt: null },
    ])

    const res = await request(app)
      .get('/api/announcements/active')
      .set('Authorization', userToken())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })

  it('no retorna anuncios dirigidos a otro workspace', async () => {
    prisma.announcement.findMany.mockResolvedValue([
      { ...ANN, targetAll: false, targetWorkspaceIds: JSON.stringify([999]), startsAt: null, endsAt: null },
    ])

    const res = await request(app)
      .get('/api/announcements/active')
      .set('Authorization', userToken())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })

  it('no retorna anuncios cuyo endsAt ya pasó', async () => {
    const past = new Date(Date.now() - 60_000) // 1 min atrás
    prisma.announcement.findMany.mockResolvedValue([
      { ...ANN, targetAll: true, targetWorkspaceIds: '[]', startsAt: null, endsAt: past },
    ])

    const res = await request(app)
      .get('/api/announcements/active')
      .set('Authorization', userToken())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })

  it('no retorna anuncios cuyo startsAt aún no llegó', async () => {
    const future = new Date(Date.now() + 3_600_000) // 1h en el futuro
    prisma.announcement.findMany.mockResolvedValue([
      { ...ANN, targetAll: true, targetWorkspaceIds: '[]', startsAt: future, endsAt: null },
    ])

    const res = await request(app)
      .get('/api/announcements/active')
      .set('Authorization', userToken())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })
})
