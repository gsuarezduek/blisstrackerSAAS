jest.mock('../../src/lib/prisma', () => ({
  mfaRecoveryCode: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
  $transaction:    jest.fn(ops => Promise.all(ops)),
}))

const { authenticator } = require('otplib')
const prisma = require('../../src/lib/prisma')
const mfa = require('../../src/lib/mfa')

describe('verifyTotp', () => {
  const secret = authenticator.generateSecret()

  it('acepta el código vigente del secret', () => {
    expect(mfa.verifyTotp(secret, authenticator.generate(secret))).toBe(true)
  })

  it('acepta el código con espacios (así lo pega la gente desde el teléfono)', () => {
    const code = authenticator.generate(secret)
    expect(mfa.verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`)).toBe(true)
  })

  it('rechaza el código de otro secret', () => {
    expect(mfa.verifyTotp(secret, authenticator.generate(authenticator.generateSecret()))).toBe(false)
  })

  it('devuelve false (no lanza) con basura: letras, vacío, null, 5 dígitos', () => {
    for (const bad of ['abcdef', '', null, undefined, '12345', '1234567', {}]) {
      expect(mfa.verifyTotp(secret, bad)).toBe(false)
    }
  })

  it('devuelve false (no lanza) con un secret mal formado', () => {
    expect(mfa.verifyTotp('no-es-base32!!', '123456')).toBe(false)
  })
})

describe('hasMfa', () => {
  it('true sólo con secret Y confirmación', () => {
    expect(mfa.hasMfa({ totpSecret: 'x', totpConfirmedAt: new Date() })).toBe(true)
  })

  // Es la regla que evita dejar a alguien afuera de su cuenta por haber cerrado
  // el modal del QR antes de escanearlo.
  it('false con un enrolamiento sin confirmar', () => {
    expect(mfa.hasMfa({ totpSecret: 'x', totpConfirmedAt: null })).toBe(false)
  })

  it('false sin secret y con usuario nulo', () => {
    expect(mfa.hasMfa({ totpSecret: null, totpConfirmedAt: new Date() })).toBe(false)
    expect(mfa.hasMfa(null)).toBe(false)
  })
})

describe('códigos de recuperación', () => {
  it('genera 10 caracteres del alfabeto sin ambigüedades, partidos al medio', () => {
    for (let i = 0; i < 50; i++) {
      const code = mfa.generateRecoveryCode()
      expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/)
      // Ni I, L, O, U, 0 ni 1: son los que se transcriben mal.
      expect(code).not.toMatch(/[ILOU01]/)
    }
  })

  it('normaliza minúsculas, guiones y espacios al mismo hash', () => {
    const canonical = mfa.hashRecoveryCode('A2BC-D3EF4G')
    expect(mfa.hashRecoveryCode('a2bcd3ef4g')).toBe(canonical)
    expect(mfa.hashRecoveryCode(' A2BC D3EF4G ')).toBe(canonical)
    expect(mfa.hashRecoveryCode('a2bc-d3ef4g')).toBe(canonical)
  })

  it('replaceRecoveryCodes borra los viejos y crea 10 hasheados', async () => {
    const codes = await mfa.replaceRecoveryCodes(7)

    expect(codes).toHaveLength(10)
    expect(prisma.mfaRecoveryCode.deleteMany).toHaveBeenCalledWith({ where: { userId: 7 } })

    const { data } = prisma.mfaRecoveryCode.createMany.mock.calls[0][0]
    expect(data).toHaveLength(10)
    // En la DB va el hash, nunca el código en claro.
    expect(data.map(d => d.codeHash)).toEqual(codes.map(c => mfa.hashRecoveryCode(c)))
    expect(data.every(d => !codes.includes(d.codeHash))).toBe(true)
  })
})

describe('consumeRecoveryCode', () => {
  const code = 'A2BC-D3EF4G'

  it('gasta el código que coincide', async () => {
    prisma.mfaRecoveryCode.findMany.mockResolvedValue([{ id: 3, codeHash: mfa.hashRecoveryCode(code) }])
    prisma.mfaRecoveryCode.updateMany.mockResolvedValue({ count: 1 })

    expect(await mfa.consumeRecoveryCode(1, code)).toBe(true)
    // `usedAt: null` en el where: dos requests con el mismo código, sólo una gana.
    expect(prisma.mfaRecoveryCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 3, usedAt: null } }),
    )
  })

  it('false si el código no está entre los sin usar', async () => {
    prisma.mfaRecoveryCode.findMany.mockResolvedValue([{ id: 3, codeHash: mfa.hashRecoveryCode('ZZZZ-ZZZZZZ') }])
    expect(await mfa.consumeRecoveryCode(1, code)).toBe(false)
    expect(prisma.mfaRecoveryCode.updateMany).not.toHaveBeenCalled()
  })

  it('false si otra request lo gastó en el medio (updateMany count 0)', async () => {
    prisma.mfaRecoveryCode.findMany.mockResolvedValue([{ id: 3, codeHash: mfa.hashRecoveryCode(code) }])
    prisma.mfaRecoveryCode.updateMany.mockResolvedValue({ count: 0 })
    expect(await mfa.consumeRecoveryCode(1, code)).toBe(false)
  })

  it('no va a la DB con un código de largo distinto', async () => {
    expect(await mfa.consumeRecoveryCode(1, '123')).toBe(false)
    expect(prisma.mfaRecoveryCode.findMany).not.toHaveBeenCalled()
  })
})

describe('verifySecondFactor', () => {
  const secret = authenticator.generateSecret()
  const user = { id: 1, totpSecret: require('../../src/lib/encryption').encrypt(secret), totpConfirmedAt: new Date() }

  it('reconoce el TOTP sin tocar los códigos de recuperación', async () => {
    expect(await mfa.verifySecondFactor(user, authenticator.generate(secret)))
      .toEqual({ ok: true, method: 'totp' })
    expect(prisma.mfaRecoveryCode.findMany).not.toHaveBeenCalled()
  })

  it('cae al código de recuperación y lo reporta como tal', async () => {
    prisma.mfaRecoveryCode.findMany.mockResolvedValue([{ id: 1, codeHash: mfa.hashRecoveryCode('A2BC-D3EF4G') }])
    prisma.mfaRecoveryCode.updateMany.mockResolvedValue({ count: 1 })

    expect(await mfa.verifySecondFactor(user, 'a2bc-d3ef4g'))
      .toEqual({ ok: true, method: 'recovery' })
  })

  it('ok:false cuando no es ninguno de los dos', async () => {
    prisma.mfaRecoveryCode.findMany.mockResolvedValue([])
    expect(await mfa.verifySecondFactor(user, '000000')).toEqual({ ok: false, method: null })
  })
})
