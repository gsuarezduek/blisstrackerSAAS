jest.mock('../../src/lib/prisma', () => ({
  user:            { findUnique: jest.fn(), update: jest.fn() },
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  mfaRecoveryCode: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
  $transaction:    jest.fn(ops => Promise.all(ops)),
}))
jest.mock('bcryptjs', () => ({ compare: jest.fn(), hash: jest.fn() }))
jest.mock('../../src/services/email.service', () => ({
  sendMfaEnabledNotice:  jest.fn().mockResolvedValue(undefined),
  sendMfaDisabledNotice: jest.fn().mockResolvedValue(undefined),
  sendEmailChangeVerification: jest.fn().mockResolvedValue(undefined),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const { authenticator } = require('otplib')
const bcrypt  = require('bcryptjs')
const prisma  = require('../../src/lib/prisma')
const { encrypt } = require('../../src/lib/encryption')
const { sendMfaEnabledNotice, sendMfaDisabledNotice } = require('../../src/services/email.service')
const { hashRecoveryCode } = require('../../src/lib/mfa')
const app = require('../../src/app')

const SECRET = authenticator.generateSecret()
const SLUG   = 'bliss'
const member = { workspaceId: 1, userId: 1, role: 'member', teamRole: 'DESIGNER', active: true, legajoData: {} }

const base      = { id: 1, name: 'Ana García', email: 'ana@test.com', password: '$2a$10$hash', avatar: 'bee.png' }
const noMfa     = { ...base, totpSecret: null, totpConfirmedAt: null }
const pending   = { ...base, totpSecret: encrypt(SECRET), totpConfirmedAt: null }
const withMfa   = { ...base, totpSecret: encrypt(SECRET), totpConfirmedAt: new Date('2026-01-01') }

const token = `Bearer ${jwt.sign({ userId: 1, workspaceId: 1, role: 'member', name: 'Ana', email: 'ana@test.com' }, process.env.JWT_SECRET)}`

function req(method, path) {
  return request(app)[method](path).set('Authorization', token).set('X-Workspace', SLUG)
}

beforeEach(() => {
  jest.clearAllMocks()
  bcrypt.compare.mockResolvedValue(true)
  prisma.workspace.findUnique.mockResolvedValue({ id: 1, slug: SLUG, status: 'active', disabledFeatureKeys: '[]', members: [member] })
  prisma.user.update.mockImplementation(({ data }) => Promise.resolve({ ...base, ...data }))
  prisma.mfaRecoveryCode.count.mockResolvedValue(10)
})

describe('POST /api/profile/mfa/setup', () => {
  it('devuelve QR + secret y guarda el secret CIFRADO sin activar nada', async () => {
    prisma.user.findUnique.mockResolvedValue(noMfa)

    const res = await req('post', '/api/profile/mfa/setup').send({ password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.body.qr).toMatch(/^data:image\/png;base64,/)
    expect(res.body.otpauthUri).toContain('otpauth://totp/')
    expect(res.body.otpauthUri).toContain('BlissTracker')

    const { data } = prisma.user.update.mock.calls[0][0]
    // Cifrado "iv:tag:ciphertext", y el 2FA queda sin confirmar.
    expect(data.totpSecret).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/)
    expect(data.totpSecret).not.toBe(res.body.secret)
    expect(data.totpConfirmedAt).toBeNull()
  })

  it('exige la contraseña (sesión robada no alcanza para dejar afuera al dueño)', async () => {
    prisma.user.findUnique.mockResolvedValue(noMfa)
    bcrypt.compare.mockResolvedValue(false)

    const res = await req('post', '/api/profile/mfa/setup').send({ password: 'incorrecta' })

    expect(res.status).toBe(400)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('409 si ya está activo', async () => {
    prisma.user.findUnique.mockResolvedValue(withMfa)
    const res = await req('post', '/api/profile/mfa/setup').send({ password: 'password123' })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('MFA_ALREADY_ENABLED')
  })
})

describe('POST /api/profile/mfa/confirm', () => {
  it('con el primer código correcto activa y entrega los 10 códigos de recuperación', async () => {
    prisma.user.findUnique.mockResolvedValue(pending)

    const res = await req('post', '/api/profile/mfa/confirm').send({ code: authenticator.generate(SECRET) })

    expect(res.status).toBe(200)
    expect(res.body.mfaEnabled).toBe(true)
    expect(res.body.recoveryCodes).toHaveLength(10)
    expect(prisma.user.update.mock.calls[0][0].data.totpConfirmedAt).toBeInstanceOf(Date)
    expect(sendMfaEnabledNotice).toHaveBeenCalled()
  })

  it('con un código incorrecto no activa nada', async () => {
    prisma.user.findUnique.mockResolvedValue(pending)

    const res = await req('post', '/api/profile/mfa/confirm').send({ code: '000000' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MFA_CODE_INVALID')
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.mfaRecoveryCode.createMany).not.toHaveBeenCalled()
  })

  it('400 si nunca se generó el QR', async () => {
    prisma.user.findUnique.mockResolvedValue(noMfa)
    const res = await req('post', '/api/profile/mfa/confirm').send({ code: '000000' })
    expect(res.body.code).toBe('MFA_SETUP_MISSING')
  })
})

describe('POST /api/profile/mfa/disable', () => {
  it('pide contraseña Y código — la contraseña sola no desactiva', async () => {
    prisma.user.findUnique.mockResolvedValue(withMfa)
    prisma.mfaRecoveryCode.findMany.mockResolvedValue([])

    const res = await req('post', '/api/profile/mfa/disable').send({ password: 'password123' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MFA_CODE_INVALID')
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('con los dos factores limpia el secret y los códigos', async () => {
    prisma.user.findUnique.mockResolvedValue(withMfa)

    const res = await req('post', '/api/profile/mfa/disable')
      .send({ password: 'password123', code: authenticator.generate(SECRET) })

    expect(res.status).toBe(200)
    expect(res.body.mfaEnabled).toBe(false)
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { totpSecret: null, totpConfirmedAt: null } })
    expect(prisma.mfaRecoveryCode.deleteMany).toHaveBeenCalledWith({ where: { userId: 1 } })
    expect(sendMfaDisabledNotice).toHaveBeenCalled()
  })

  it('acepta un código de recuperación (para quien perdió el dispositivo)', async () => {
    prisma.user.findUnique.mockResolvedValue(withMfa)
    prisma.mfaRecoveryCode.findMany.mockResolvedValue([{ id: 2, codeHash: hashRecoveryCode('A2BC-D3EF4G') }])
    prisma.mfaRecoveryCode.updateMany.mockResolvedValue({ count: 1 })

    const res = await req('post', '/api/profile/mfa/disable').send({ password: 'password123', code: 'A2BC-D3EF4G' })

    expect(res.status).toBe(200)
    expect(res.body.mfaEnabled).toBe(false)
  })
})

describe('GET /api/profile', () => {
  it('expone mfaEnabled pero NUNCA el secret', async () => {
    prisma.user.findUnique.mockResolvedValue(withMfa)
    prisma.mfaRecoveryCode.count.mockResolvedValue(8)

    const res = await req('get', '/api/profile')

    expect(res.body).toMatchObject({ mfaEnabled: true, mfaPendingSetup: false, mfaRecoveryCodesLeft: 8 })
    expect(res.body.totpSecret).toBeUndefined()
    expect(res.body.totpConfirmedAt).toBeUndefined()
  })

  it('marca el enrolamiento a medias como pendiente, no como activo', async () => {
    prisma.user.findUnique.mockResolvedValue(pending)
    const res = await req('get', '/api/profile')
    expect(res.body).toMatchObject({ mfaEnabled: false, mfaPendingSetup: true, mfaRecoveryCodesLeft: 0 })
  })
})
