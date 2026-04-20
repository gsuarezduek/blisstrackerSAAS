jest.mock('../../src/lib/prisma', () => ({
  workspace: { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn(), findMany: jest.fn() },
  vacationRequest: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  vacationAdjustment: { findMany: jest.fn() },
  user: { findUnique: jest.fn() },
  notification: { create: jest.fn(), createMany: jest.fn() },
}))

jest.mock('../../src/services/email.service', () => ({
  sendVacationRequestEmail: jest.fn().mockResolvedValue(undefined),
  sendVacationReviewEmail:  jest.fn().mockResolvedValue(undefined),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const { sendVacationRequestEmail, sendVacationReviewEmail } = require('../../src/services/email.service')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1

function makeToken(userId = 1, role = 'member') {
  return `Bearer ${jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test User', email: 'test@bliss.ar' },
    SECRET,
  )}`
}

function mockWorkspace(role = 'member') {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss Marketing',
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({
    workspaceId: WORKSPACE_ID, userId: 1, role, active: true,
  })
}

// ── POST /api/vacation/my/request ─────────────────────────────────────────────

describe('POST /api/vacation/my/request', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockWorkspace('member')
  })

  it('crea una solicitud correctamente y retorna 201', async () => {
    const created = { id: 10, workspaceId: WORKSPACE_ID, userId: 1, startDate: '2026-05-01', endDate: '2026-05-05', type: 'vacaciones', status: 'pending' }
    prisma.vacationRequest.create.mockResolvedValue(created)
    prisma.user.findUnique.mockResolvedValue({ name: 'Test User', email: 'test@bliss.ar' })
    prisma.workspaceMember.findMany.mockResolvedValue([
      { user: { id: 2, email: 'admin@bliss.ar' } },
    ])
    prisma.notification.createMany.mockResolvedValue({ count: 1 })

    const res = await request(app)
      .post('/api/vacation/my/request')
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ startDate: '2026-05-01', endDate: '2026-05-05', type: 'vacaciones' })

    expect(res.status).toBe(201)
    expect(res.body.id).toBe(10)
  })

  it('envía email a los admins del workspace', async () => {
    prisma.vacationRequest.create.mockResolvedValue({ id: 11, workspaceId: WORKSPACE_ID, userId: 1, startDate: '2026-05-01', endDate: '2026-05-01', type: 'enfermedad', status: 'pending' })
    prisma.user.findUnique.mockResolvedValue({ name: 'Test User', email: 'test@bliss.ar' })
    prisma.workspaceMember.findMany.mockResolvedValue([
      { user: { id: 2, email: 'admin@bliss.ar' } },
      { user: { id: 3, email: 'owner@bliss.ar' } },
    ])
    prisma.notification.createMany.mockResolvedValue({ count: 2 })

    await request(app)
      .post('/api/vacation/my/request')
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ startDate: '2026-05-01', endDate: '2026-05-01', type: 'enfermedad' })

    expect(sendVacationRequestEmail).toHaveBeenCalledWith(
      ['admin@bliss.ar', 'owner@bliss.ar'],
      'Test User',
      'Bliss Marketing',
      expect.objectContaining({ startDate: '2026-05-01', type: 'enfermedad' }),
      WORKSPACE_ID,
    )
  })

  it('retorna 400 si faltan fechas', async () => {
    const res = await request(app)
      .post('/api/vacation/my/request')
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ type: 'vacaciones' })

    expect(res.status).toBe(400)
  })

  it('retorna 400 si el tipo de licencia es inválido', async () => {
    const res = await request(app)
      .post('/api/vacation/my/request')
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ startDate: '2026-05-01', endDate: '2026-05-05', type: 'tipoInvalido' })

    expect(res.status).toBe(400)
  })

  it('retorna 400 si endDate es anterior a startDate', async () => {
    const res = await request(app)
      .post('/api/vacation/my/request')
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ startDate: '2026-05-10', endDate: '2026-05-01', type: 'vacaciones' })

    expect(res.status).toBe(400)
  })
})

// ── PATCH /api/vacation/admin/requests/:id ────────────────────────────────────

describe('PATCH /api/vacation/admin/requests/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockWorkspace('admin')
    // Reemplazar el mock de workspaceMember.findUnique para admin
    prisma.workspaceMember.findUnique.mockResolvedValue({
      workspaceId: WORKSPACE_ID, userId: 1, role: 'admin', active: true,
    })
  })

  it('aprueba una solicitud pendiente y retorna 200', async () => {
    const pending = {
      id: 5, workspaceId: WORKSPACE_ID, status: 'pending',
      startDate: '2026-05-01', endDate: '2026-05-05',
      user: { id: 2, name: 'Empleado', email: 'empleado@bliss.ar' },
    }
    const approved = { ...pending, status: 'approved', reviewedBy: { id: 1, name: 'Admin' } }

    prisma.vacationRequest.findFirst.mockResolvedValue(pending)
    prisma.vacationRequest.update.mockResolvedValue(approved)
    prisma.notification.create.mockResolvedValue({})

    const res = await request(app)
      .patch('/api/vacation/admin/requests/5')
      .set('Authorization', makeToken(1, 'admin'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ status: 'approved' })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('approved')
  })

  it('rechaza una solicitud pendiente y retorna 200', async () => {
    const pending = {
      id: 6, workspaceId: WORKSPACE_ID, status: 'pending',
      startDate: '2026-06-01', endDate: '2026-06-03',
      user: { id: 2, name: 'Empleado', email: 'empleado@bliss.ar' },
    }
    const rejected = { ...pending, status: 'rejected', reviewNote: 'Período de alta demanda', reviewedBy: { id: 1, name: 'Admin' } }

    prisma.vacationRequest.findFirst.mockResolvedValue(pending)
    prisma.vacationRequest.update.mockResolvedValue(rejected)
    prisma.notification.create.mockResolvedValue({})

    const res = await request(app)
      .patch('/api/vacation/admin/requests/6')
      .set('Authorization', makeToken(1, 'admin'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ status: 'rejected', reviewNote: 'Período de alta demanda' })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('rejected')
    expect(sendVacationReviewEmail).toHaveBeenCalled()
  })

  it('retorna 400 si el status es inválido', async () => {
    const res = await request(app)
      .patch('/api/vacation/admin/requests/1')
      .set('Authorization', makeToken(1, 'admin'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ status: 'pending' })

    expect(res.status).toBe(400)
  })

  it('retorna 409 si la solicitud ya fue revisada', async () => {
    prisma.vacationRequest.findFirst.mockResolvedValue({
      id: 7, status: 'approved',
      user: { id: 2, name: 'Empleado', email: 'empleado@bliss.ar' },
    })

    const res = await request(app)
      .patch('/api/vacation/admin/requests/7')
      .set('Authorization', makeToken(1, 'admin'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ status: 'rejected' })

    expect(res.status).toBe(409)
  })

  it('retorna 403 si el usuario no es admin', async () => {
    // Sobreescribir mock para simular miembro normal
    prisma.workspaceMember.findUnique.mockResolvedValue({
      workspaceId: WORKSPACE_ID, userId: 1, role: 'member', active: true,
    })

    const res = await request(app)
      .patch('/api/vacation/admin/requests/1')
      .set('Authorization', makeToken(1, 'member'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ status: 'approved' })

    expect(res.status).toBe(403)
  })
})
