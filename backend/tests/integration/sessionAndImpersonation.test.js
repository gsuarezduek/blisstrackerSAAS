jest.mock('../../src/lib/prisma', () => ({
  user:            { findUnique: jest.fn(), update: jest.fn() },
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
}))
jest.mock('bcryptjs', () => ({ compare: jest.fn(), hash: jest.fn() }))

const request = require('supertest')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const prisma = require('../../src/lib/prisma')
const app = require('../../src/app')

const SECRET = process.env.JWT_SECRET

function bearer(claims) {
  const now = Math.floor(Date.now() / 1000)
  const token = jwt.sign({
    userId: 1, workspaceId: 1, role: 'owner', teamRole: 'ADMIN',
    isSuperAdmin: false, name: 'Ana', email: 'a@t.com',
    iat: now - 120, exp: now + 3600,
    ...claims,
  }, SECRET)
  return `Bearer ${token}`
}

function allowSession() {
  prisma.user.findUnique.mockResolvedValue({
    id: 1, name: 'Ana', email: 'a@t.com', password: 'hash',
    isSuperAdmin: false, sessionValidAfter: null,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  allowSession()
  prisma.workspace.findUnique.mockResolvedValue({
    id: 1, slug: 'bliss', status: 'active', name: 'Bliss', timezone: 'America/Argentina/Buenos_Aires',
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({
    workspaceId: 1, userId: 1, role: 'owner', teamRole: 'ADMIN', active: true,
  })
  bcrypt.compare.mockResolvedValue(true)
  bcrypt.hash.mockResolvedValue('new-hash')
  prisma.user.update.mockResolvedValue({})
})

describe('sesión después de cambiar la contraseña', () => {
  it('un JWT emitido antes del corte ya no entra', async () => {
    prisma.user.findUnique.mockResolvedValue({ sessionValidAfter: new Date() })

    const res = await request(app)
      .get('/api/profile/')
      .set('Authorization', bearer())
      .set('X-Workspace', 'bliss')

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('SESSION_EXPIRED')
  })

  it('cambiar la contraseña marca el corte y devuelve un token para esta pestaña', async () => {
    const res = await request(app)
      .post('/api/profile/change-password')
      .set('Authorization', bearer())
      .set('X-Workspace', 'bliss')
      .send({ currentPassword: 'actual123', newPassword: 'nueva1234' })

    expect(res.status).toBe(200)
    expect(res.body.token).toEqual(expect.any(String))
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ password: 'new-hash', sessionValidAfter: expect.any(Date) }),
    }))
    const fresh = jwt.verify(res.body.token, SECRET)
    expect(fresh.userId).toBe(1)
    expect(fresh.purpose).toBeUndefined()
  })
})

describe('sesión de soporte', () => {
  const support = () => bearer({ purpose: 'impersonation', impersonatedBy: 9, workspaceId: 1 })

  it('no entra a otro workspace', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 2, slug: 'otro', status: 'active', name: 'Otro',
    })

    const res = await request(app)
      .get('/api/profile/')
      .set('Authorization', support())
      .set('X-Workspace', 'otro')

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/workspace/)
  })

  it('no vincula Google ni cambia de workspace', async () => {
    const google = await request(app)
      .post('/api/profile/google-link-token')
      .set('Authorization', support())
      .set('X-Workspace', 'bliss')
      .send({ password: 'actual123' })
    expect(google.status).toBe(403)

    const switched = await request(app)
      .post('/api/auth/switch-workspace')
      .set('Authorization', support())
      .send({ targetSlug: 'otro' })
    expect(switched.status).toBe(403)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })
})

describe('vincular Google', () => {
  it('pide la contraseña y no emite el enlace si no coincide', async () => {
    const missing = await request(app)
      .post('/api/profile/google-link-token')
      .set('Authorization', bearer())
      .set('X-Workspace', 'bliss')
      .send({})
    expect(missing.status).toBe(400)

    bcrypt.compare.mockResolvedValue(false)
    const wrong = await request(app)
      .post('/api/profile/google-link-token')
      .set('Authorization', bearer())
      .set('X-Workspace', 'bliss')
      .send({ password: 'no-es' })
    expect(wrong.status).toBe(400)
    expect(wrong.body.linkToken).toBeUndefined()
  })
})
