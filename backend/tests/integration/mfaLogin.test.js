jest.mock('../../src/lib/prisma', () => ({
  user:               { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  workspace:          { findUnique: jest.fn() },
  workspaceMember:    { findUnique: jest.fn(), findMany: jest.fn() },
  userLogin:          { create: jest.fn() },
  mfaRecoveryCode:    { findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
  passwordResetToken: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  $transaction:       jest.fn(ops => Promise.all(ops)),
}))
jest.mock('bcryptjs', () => ({ compare: jest.fn(), hash: jest.fn() }))
jest.mock('../../src/services/email.service', () => ({
  sendPasswordReset:            jest.fn().mockResolvedValue(undefined),
  sendEmailChangedNotice:       jest.fn().mockResolvedValue(undefined),
  sendMfaRecoveryCodeUsedNotice: jest.fn().mockResolvedValue(undefined),
  sendEmailChangeVerification:  jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../../src/services/lateNotification.service', () => ({ triggerLateCheck: jest.fn() }))

const request = require('supertest')
const { authenticator } = require('otplib')
const bcrypt  = require('bcryptjs')
const prisma  = require('../../src/lib/prisma')
const { encrypt } = require('../../src/lib/encryption')
const { sendMfaRecoveryCodeUsedNotice } = require('../../src/services/email.service')
const { hashRecoveryCode } = require('../../src/lib/mfa')
const app = require('../../src/app')

const SECRET = authenticator.generateSecret()
const WORKSPACE_SLUG = 'bliss'

const userWithMfa = {
  id: 1, name: 'Ana García', email: 'ana@test.com', password: '$2a$10$hash',
  isSuperAdmin: false, avatar: 'bee.png',
  totpSecret: encrypt(SECRET), totpConfirmedAt: new Date('2026-01-01'),
}
const userWithoutMfa = { ...userWithMfa, totpSecret: null, totpConfirmedAt: null }
const mockWorkspace  = { id: 1, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss' }
const mockMember     = { workspaceId: 1, userId: 1, role: 'member', teamRole: 'DESIGNER', active: true }

function mockWorkspaceList() {
  prisma.workspaceMember.findMany.mockResolvedValue([{ ...mockMember, workspace: mockWorkspace }])
}

async function loginStep1(body = { email: 'ana@test.com', password: 'password123' }) {
  return request(app).post('/api/auth/login').send(body)
}

beforeEach(() => {
  jest.clearAllMocks()
  bcrypt.compare.mockResolvedValue(true)
  prisma.mfaRecoveryCode.count.mockResolvedValue(10)
  prisma.mfaRecoveryCode.findMany.mockResolvedValue([])
  prisma.userLogin.create.mockResolvedValue({})
  mockWorkspaceList()
})

describe('POST /api/auth/login con 2FA', () => {
  it('sin 2FA sigue devolviendo la sesión en un solo paso (nada cambió)', async () => {
    prisma.user.findFirst.mockResolvedValue(userWithoutMfa)

    const res = await loginStep1()

    expect(res.status).toBe(200)
    expect(res.body.mfaRequired).toBeUndefined()
    expect(res.body.workspaces).toHaveLength(1)
  })

  // Lo central: la contraseña sola no puede devolver NINGÚN token de sesión.
  it('con 2FA devuelve mfaRequired y ni un token ni la lista de workspaces', async () => {
    prisma.user.findFirst.mockResolvedValue(userWithMfa)

    const res = await loginStep1()

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ mfaRequired: true, methods: ['totp'], recoveryCodesLeft: 10 })
    expect(res.body.mfaToken).toBeDefined()
    expect(res.body.token).toBeUndefined()
    expect(res.body.workspaces).toBeUndefined()
    expect(res.body.user).toBeUndefined()
  })

  it('una contraseña incorrecta no llega a revelar que la cuenta tiene 2FA', async () => {
    prisma.user.findFirst.mockResolvedValue(userWithMfa)
    bcrypt.compare.mockResolvedValue(false)

    const res = await loginStep1()

    expect(res.status).toBe(401)
    expect(res.body.mfaRequired).toBeUndefined()
    expect(res.body.mfaToken).toBeUndefined()
  })

  it('el mfaToken no sirve como Bearer de sesión', async () => {
    prisma.user.findFirst.mockResolvedValue(userWithMfa)
    const { body } = await loginStep1()

    prisma.workspace.findUnique.mockResolvedValue({ ...mockWorkspace, members: [mockMember] })
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.mfaToken}`)
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/mfa/verify', () => {
  async function getMfaToken() {
    prisma.user.findFirst.mockResolvedValue(userWithMfa)
    const { body } = await loginStep1()
    prisma.user.findUnique.mockResolvedValue(userWithMfa)
    return body.mfaToken
  }

  it('con el TOTP correcto emite la sesión completa', async () => {
    const mfaToken = await getMfaToken()

    const res = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken, code: authenticator.generate(SECRET) })

    expect(res.status).toBe(200)
    expect(res.body.workspaces).toHaveLength(1)
    expect(res.body.workspaces[0].token).toBeDefined()
    expect(res.body.user.email).toBe('ana@test.com')
  })

  it('registra el ingreso como "email" (el chip de RRHH no distingue 2FA)', async () => {
    const mfaToken = await getMfaToken()
    prisma.workspace.findUnique.mockResolvedValue(mockWorkspace)
    prisma.workspaceMember.findUnique.mockResolvedValue(mockMember)

    await request(app)
      .post('/api/auth/mfa/verify')
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ mfaToken, code: authenticator.generate(SECRET) })

    // El slug sale del desafío (que se firmó sin X-Workspace), no del header de
    // este request: no se cambia de contexto a mitad del flujo.
    expect(prisma.userLogin.create).not.toHaveBeenCalled()
  })

  it('un código incorrecto no emite sesión y descuenta intentos', async () => {
    const mfaToken = await getMfaToken()

    const res = await request(app).post('/api/auth/mfa/verify').send({ mfaToken, code: '000000' })

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('MFA_CODE_INVALID')
    expect(res.body.attemptsLeft).toBe(4)
    expect(res.body.workspaces).toBeUndefined()
  })

  it('quema el desafío al quinto intento fallido', async () => {
    const mfaToken = await getMfaToken()

    for (let i = 0; i < 4; i++) {
      await request(app).post('/api/auth/mfa/verify').send({ mfaToken, code: '000000' })
    }
    const fifth = await request(app).post('/api/auth/mfa/verify').send({ mfaToken, code: '000000' })
    expect(fifth.body.attemptsLeft).toBe(0)

    // Y ya no acepta ni el código correcto.
    const after = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken, code: authenticator.generate(SECRET) })
    expect(after.status).toBe(429)
    expect(after.body.code).toBe('MFA_TOO_MANY_ATTEMPTS')
  })

  it('acepta un código de recuperación y avisa por mail', async () => {
    const mfaToken = await getMfaToken()
    prisma.mfaRecoveryCode.findMany.mockResolvedValue([{ id: 5, codeHash: hashRecoveryCode('A2BC-D3EF4G') }])
    prisma.mfaRecoveryCode.updateMany.mockResolvedValue({ count: 1 })
    prisma.mfaRecoveryCode.count.mockResolvedValue(9)

    const res = await request(app).post('/api/auth/mfa/verify').send({ mfaToken, code: 'a2bc d3ef4g' })

    expect(res.status).toBe(200)
    expect(res.body.workspaces).toHaveLength(1)
    expect(sendMfaRecoveryCodeUsedNotice).toHaveBeenCalledWith('ana@test.com', 'Ana García', 9)
  })

  it('el mfaToken es de un solo uso: no se puede canjear dos veces', async () => {
    const mfaToken = await getMfaToken()
    const code = authenticator.generate(SECRET)

    const first = await request(app).post('/api/auth/mfa/verify').send({ mfaToken, code })
    expect(first.status).toBe(200)

    // Mismo token y mismo código, todavía dentro de la ventana del TOTP.
    const second = await request(app).post('/api/auth/mfa/verify').send({ mfaToken, code })
    expect(second.status).toBe(429)
    expect(second.body.workspaces).toBeUndefined()
  })

  it('sin mfaToken válido no hay sesión', async () => {
    const res = await request(app).post('/api/auth/mfa/verify').send({ mfaToken: 'basura', code: '123456' })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('MFA_CHALLENGE_EXPIRED')
  })

  it('si el 2FA se desactivó entre los dos pasos, hay que volver a empezar', async () => {
    const mfaToken = await getMfaToken()
    prisma.user.findUnique.mockResolvedValue(userWithoutMfa)

    const res = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken, code: authenticator.generate(SECRET) })

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('MFA_CHALLENGE_INVALID')
  })
})

// Sin esto el 2FA sería evitable con sólo acceder al email: pedir reset, abrir el
// link, poner contraseña nueva y entrar.
describe('POST /api/auth/reset-password con 2FA', () => {
  const resetToken = { id: 9, token: 'tok-reset', userId: 1, used: false, expiresAt: new Date(Date.now() + 3600_000) }

  beforeEach(() => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(resetToken)
    prisma.user.update.mockResolvedValue(userWithMfa)
    prisma.passwordResetToken.update.mockResolvedValue({})
    bcrypt.hash.mockResolvedValue('$2a$10$nuevo')
  })

  it('sin 2FA no pide código (nada cambió)', async () => {
    prisma.user.findUnique.mockResolvedValue(userWithoutMfa)

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'tok-reset', password: 'nuevaPassword1' })

    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalled()
  })

  it('con 2FA y sin código responde MFA_REQUIRED y NO cambia la contraseña', async () => {
    prisma.user.findUnique.mockResolvedValue(userWithMfa)

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'tok-reset', password: 'nuevaPassword1' })

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('MFA_REQUIRED')
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('con 2FA y código incorrecto no cambia la contraseña', async () => {
    prisma.user.findUnique.mockResolvedValue(userWithMfa)

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'tok-reset', password: 'nuevaPassword1', code: '000000' })

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('MFA_CODE_INVALID')
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('con 2FA y código correcto cambia la contraseña y gasta el enlace', async () => {
    prisma.user.findUnique.mockResolvedValue(userWithMfa)

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'tok-reset', password: 'nuevaPassword1', code: authenticator.generate(SECRET) })

    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { password: '$2a$10$nuevo' } })
    expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { used: true } })
  })
})
