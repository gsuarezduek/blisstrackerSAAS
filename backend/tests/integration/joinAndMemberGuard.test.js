jest.mock('../../src/lib/prisma', () => ({
  user:                { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  workspace:           { findUnique: jest.fn() },
  workspaceMember:     { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  workspaceInvitation: { findUnique: jest.fn(), update: jest.fn() },
  userLogin:           { create: jest.fn() },
  $transaction:        jest.fn(async (fn) => fn({
    user:            require('../../src/lib/prisma').user,
    workspaceMember: require('../../src/lib/prisma').workspaceMember,
  })),
}))
jest.mock('bcryptjs', () => ({ compare: jest.fn(), hash: jest.fn() }))
jest.mock('../../src/lib/mfa', () => {
  const actual = jest.requireActual('../../src/lib/mfa')
  return { ...actual, verifySecondFactor: jest.fn(), countUnusedRecoveryCodes: jest.fn() }
})
jest.mock('../../src/services/email.service', () => ({
  sendInvitationEmail:           jest.fn(),
  sendMfaRecoveryCodeUsedNotice: jest.fn().mockResolvedValue(undefined),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const bcrypt  = require('bcryptjs')
const prisma  = require('../../src/lib/prisma')
const { verifySecondFactor } = require('../../src/lib/mfa')
const app     = require('../../src/app')

const SECRET = process.env.JWT_SECRET
const inv = {
  id: 9,
  token: 'invite-token',
  email: 'ana@test.com',
  memberRole: 'member',
  teamRole: 'DESIGNER',
  usedAt: null,
  expiresAt: new Date(Date.now() + 86400000),
  workspaceId: 1,
  workspace: { id: 1, slug: 'bliss', name: 'Bliss' },
}
const existingUser = {
  id: 5, name: 'Ana', email: 'ana@test.com', password: 'hashed', isSuperAdmin: false,
}

function authHeader(userId, role) {
  return `Bearer ${jwt.sign(
    { userId, workspaceId: 1, role, isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )}`
}

beforeEach(() => {
  jest.clearAllMocks()
  prisma.workspace.findUnique.mockResolvedValue({
    id: 1, slug: 'bliss', status: 'active', name: 'Bliss', billingExempt: true,
  })
  prisma.workspaceInvitation.findUnique.mockResolvedValue(inv)
  prisma.workspaceInvitation.update.mockResolvedValue({})
  prisma.userLogin.create.mockResolvedValue({})
  bcrypt.compare.mockResolvedValue(true)
  verifySecondFactor.mockResolvedValue({ ok: true, method: 'totp' })
})

describe('POST /api/workspaces/join — cuenta existente', () => {
  it('sin contraseña no abre sesión ni toca la membresía', async () => {
    prisma.user.findFirst.mockResolvedValue(existingUser)

    const res = await request(app).post('/api/workspaces/join').send({ token: inv.token })

    expect(res.status).toBe(400)
    expect(res.body.token).toBeUndefined()
    expect(prisma.workspaceMember.create).not.toHaveBeenCalled()
    expect(prisma.workspaceMember.update).not.toHaveBeenCalled()
    expect(prisma.workspaceInvitation.update).not.toHaveBeenCalled()
  })

  it('con la contraseña mal no marca la invitación como usada', async () => {
    prisma.user.findFirst.mockResolvedValue(existingUser)
    bcrypt.compare.mockResolvedValue(false)

    const res = await request(app).post('/api/workspaces/join').send({ token: inv.token, password: 'no' })

    expect(res.status).toBe(401)
    expect(prisma.workspaceInvitation.update).not.toHaveBeenCalled()
  })

  it('con 2FA pide el código antes de unir y no avisa en el alta de la membresía', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ...existingUser, totpSecret: 'enc', totpConfirmedAt: new Date(),
    })

    const res = await request(app).post('/api/workspaces/join').send({ token: inv.token, password: 'ok' })

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('MFA_REQUIRED')
    expect(prisma.workspaceMember.create).not.toHaveBeenCalled()
    expect(prisma.workspaceInvitation.update).not.toHaveBeenCalled()
  })

  it('un miembro activo conserva su rol: la invitación no lo baja', async () => {
    prisma.user.findFirst.mockResolvedValue(existingUser)
    prisma.workspaceMember.findUnique.mockResolvedValue({
      role: 'owner', teamRole: 'DIRECTOR', active: true,
    })

    const res = await request(app).post('/api/workspaces/join').send({ token: inv.token, password: 'ok' })

    expect(res.status).toBe(200)
    expect(jwt.verify(res.body.token, SECRET).role).toBe('owner')
    expect(prisma.workspaceMember.update).not.toHaveBeenCalled()
    expect(prisma.workspaceMember.create).not.toHaveBeenCalled()
  })

  it('un owner desactivado se reactiva como owner', async () => {
    prisma.user.findFirst.mockResolvedValue(existingUser)
    prisma.workspaceMember.findUnique.mockResolvedValue({
      role: 'owner', teamRole: 'DIRECTOR', active: false,
    })
    prisma.workspaceMember.update.mockResolvedValue({ role: 'owner', teamRole: 'DIRECTOR', active: true })

    const res = await request(app).post('/api/workspaces/join').send({ token: inv.token, password: 'ok' })

    expect(res.status).toBe(200)
    expect(prisma.workspaceMember.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { active: true },
    }))
    expect(jwt.verify(res.body.token, SECRET).role).toBe('owner')
  })
})

describe('PUT /api/workspaces/current/members/:userId', () => {
  function asAdmin(target) {
    prisma.workspaceMember.findUnique.mockImplementation(async ({ where }) => {
      const id = where.workspaceId_userId.userId
      if (id === 1) return { workspaceId: 1, userId: 1, role: 'admin', teamRole: 'ADMIN', active: true, extraTeamRoles: [] }
      if (id === 2) return target
      return null
    })
  }

  it('un admin no puede cambiar el email ni la contraseña de la cuenta', async () => {
    asAdmin({ role: 'member', teamRole: 'DESIGNER', active: true, extraTeamRoles: [] })

    const res = await request(app)
      .put('/api/workspaces/current/members/2')
      .set('Authorization', authHeader(1, 'admin'))
      .set('X-Workspace', 'bliss')
      .send({ email: 'otro@test.com', password: 'nueva1234' })

    expect(res.status).toBe(400)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('un admin no puede modificar a un owner', async () => {
    asAdmin({ role: 'owner', teamRole: 'DIRECTOR', active: true, extraTeamRoles: [] })

    const res = await request(app)
      .put('/api/workspaces/current/members/2')
      .set('Authorization', authHeader(1, 'admin'))
      .set('X-Workspace', 'bliss')
      .send({ memberRole: 'member' })

    expect(res.status).toBe(403)
    expect(prisma.workspaceMember.update).not.toHaveBeenCalled()
  })

  it('un admin no puede desactivar a un owner', async () => {
    asAdmin({ role: 'owner', teamRole: 'DIRECTOR', active: true, extraTeamRoles: [] })

    const res = await request(app)
      .patch('/api/workspaces/current/members/2/toggle-active')
      .set('Authorization', authHeader(1, 'admin'))
      .set('X-Workspace', 'bliss')
      .send({})

    expect(res.status).toBe(403)
  })

  it('un admin sigue pudiendo cambiar el rol de equipo de un member', async () => {
    asAdmin({ role: 'member', teamRole: 'DESIGNER', active: true, extraTeamRoles: [] })
    prisma.user.findUnique.mockResolvedValue({ id: 2, name: 'Bea', email: 'bea@test.com', avatar: null })

    const res = await request(app)
      .put('/api/workspaces/current/members/2')
      .set('Authorization', authHeader(1, 'admin'))
      .set('X-Workspace', 'bliss')
      .send({ teamRole: 'CM' })

    expect(res.status).toBe(200)
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.workspaceMember.update).toHaveBeenCalled()
  })
})
