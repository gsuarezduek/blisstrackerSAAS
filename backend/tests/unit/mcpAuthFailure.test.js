/**
 * Registro y aviso de los 401 de /api/mcp (services/mcpAuthFailure.service.js).
 *
 * Lo que se protege acá es sobre todo la asimetría de identidad: sólo el rechazo de un
 * token revocado tiene dueño, y es el único que puede terminar en un mail. Si alguna vez
 * se intenta avisar por un token desconocido, no hay a quién — y estos tests lo fijan.
 */
jest.mock('../../src/lib/prisma', () => ({
  mcpAuthFailure: { upsert: jest.fn() },
  mcpToken:       { update: jest.fn() },
  user:           { findUnique: jest.fn() },
}))
jest.mock('../../src/services/email/accountEmails', () => ({
  sendMcpTokenRevokedNotice: jest.fn(),
}))

const prisma = require('../../src/lib/prisma')
const { sendMcpTokenRevokedNotice } = require('../../src/services/email/accountEmails')
const { recordFailure, REVOKED_NOTICE_AFTER, LOG_FIRST, LOG_EVERY } = require('../../src/services/mcpAuthFailure.service')

const req = (over = {}) => ({ ip: '1.2.3.4', headers: { 'user-agent': 'undici' }, ...over })
// sha256 de un token cualquiera: lo único que importa es que sea largo y estable.
const HASH = 'a'.repeat(64)

function revokedRow(over = {}) {
  return {
    id: 7, userId: 3, workspaceId: 1, label: 'Grok', revokedAt: new Date('2026-11-01'),
    revokedNoticeAt: null, workspace: { slug: 'bliss' }, ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  prisma.mcpAuthFailure.upsert.mockResolvedValue({ attempts: 1 })
  prisma.user.findUnique.mockResolvedValue({ email: 'g@x.com', name: 'Gastón' })
})
afterEach(() => jest.restoreAllMocks())

describe('qué se guarda', () => {
  it('un token desconocido se agrupa por su hash y queda SIN dueño', async () => {
    await recordFailure(req(), { reason: 'unknown_token', tokenHash: HASH })

    const { where, create } = prisma.mcpAuthFailure.upsert.mock.calls[0][0]
    expect(where.fingerprint).toBe(`h:${HASH.slice(0, 12)}`)
    expect(create).toMatchObject({ reason: 'unknown_token', tokenId: null, userId: null, workspaceId: null })
    expect(sendMcpTokenRevokedNotice).not.toHaveBeenCalled()
  })

  it('nunca guarda el token ni su hash completo, sólo un prefijo corto', async () => {
    await recordFailure(req(), { reason: 'unknown_token', tokenHash: HASH })

    const { create } = prisma.mcpAuthFailure.upsert.mock.calls[0][0]
    expect(create.hashPrefix).toBe(HASH.slice(0, 12))
    expect(create.hashPrefix.length).toBeLessThan(HASH.length)
  })

  it('sin header no hay hash que agrupar, así que agrupa por IP', async () => {
    await recordFailure(req(), { reason: 'no_token' })

    const { where, create } = prisma.mcpAuthFailure.upsert.mock.calls[0][0]
    expect(where.fingerprint).toBe('n:1.2.3.4')
    expect(create.hashPrefix).toBeNull()
  })

  it('los reintentos del mismo origen incrementan una sola fila', async () => {
    await recordFailure(req(), { reason: 'unknown_token', tokenHash: HASH })

    const { update } = prisma.mcpAuthFailure.upsert.mock.calls[0][0]
    expect(update.attempts).toEqual({ increment: 1 })
  })

  it('un fallo de la base NO se cuenta como credencial rechazada', async () => {
    await recordFailure(req(), { reason: 'db_error', tokenHash: HASH, error: new Error('timeout') })

    expect(prisma.mcpAuthFailure.upsert).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })
})

describe('a quién se le avisa', () => {
  it('no avisa al primer rechazo: recién cuando el conector insiste', async () => {
    prisma.mcpAuthFailure.upsert.mockResolvedValue({ attempts: REVOKED_NOTICE_AFTER - 1 })
    await recordFailure(req(), { reason: 'revoked', tokenHash: HASH, row: revokedRow() })

    expect(sendMcpTokenRevokedNotice).not.toHaveBeenCalled()
  })

  it('avisa al dueño cuando un token revocado sigue siendo usado', async () => {
    prisma.mcpAuthFailure.upsert.mockResolvedValue({ attempts: REVOKED_NOTICE_AFTER })
    await recordFailure(req(), { reason: 'revoked', tokenHash: HASH, row: revokedRow() })

    expect(sendMcpTokenRevokedNotice).toHaveBeenCalledWith(
      'g@x.com', 'Gastón',
      expect.objectContaining({ label: 'Grok', workspaceId: 1, slug: 'bliss' }),
    )
  })

  it('sella el aviso ANTES de mandarlo (dos reintentos a la vez no mandan dos mails)', async () => {
    prisma.mcpAuthFailure.upsert.mockResolvedValue({ attempts: REVOKED_NOTICE_AFTER })
    await recordFailure(req(), { reason: 'revoked', tokenHash: HASH, row: revokedRow() })

    expect(prisma.mcpToken.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data:  { revokedNoticeAt: expect.any(Date) },
    })
    const sello = prisma.mcpToken.update.mock.invocationCallOrder[0]
    const envio = sendMcpTokenRevokedNotice.mock.invocationCallOrder[0]
    expect(sello).toBeLessThan(envio)
  })

  it('no repite el aviso mientras siga vigente el cooldown', async () => {
    prisma.mcpAuthFailure.upsert.mockResolvedValue({ attempts: 500 })
    await recordFailure(req(), {
      reason: 'revoked', tokenHash: HASH,
      row: revokedRow({ revokedNoticeAt: new Date(Date.now() - 60 * 60 * 1000) }),
    })

    expect(sendMcpTokenRevokedNotice).not.toHaveBeenCalled()
  })

  it('vuelve a avisar cuando el cooldown ya venció', async () => {
    prisma.mcpAuthFailure.upsert.mockResolvedValue({ attempts: 500 })
    await recordFailure(req(), {
      reason: 'revoked', tokenHash: HASH,
      row: revokedRow({ revokedNoticeAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }),
    })

    expect(sendMcpTokenRevokedNotice).toHaveBeenCalled()
  })

  it('un token desconocido no puede disparar mail ni aunque insista mil veces', async () => {
    prisma.mcpAuthFailure.upsert.mockResolvedValue({ attempts: 1000 })
    await recordFailure(req(), { reason: 'unknown_token', tokenHash: HASH })

    expect(sendMcpTokenRevokedNotice).not.toHaveBeenCalled()
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })
})

describe('cuánto grita el log', () => {
  // El estado completo vive en la fila; el log es la señal. Un conector mal configurado
  // reintenta indefinidamente y sin tope pinta el panel de Railway de punta a punta.
  it('loguea los primeros intentos, que son los que dicen cuándo arrancó', async () => {
    for (let n = 1; n <= LOG_FIRST; n++) {
      prisma.mcpAuthFailure.upsert.mockResolvedValue({ attempts: n })
      await recordFailure(req(), { reason: 'unknown_token', tokenHash: HASH })
    }
    expect(console.log).toHaveBeenCalledTimes(LOG_FIRST)
  })

  it('se calla en el medio', async () => {
    prisma.mcpAuthFailure.upsert.mockResolvedValue({ attempts: LOG_FIRST + 1 })
    await recordFailure(req(), { reason: 'unknown_token', tokenHash: HASH })

    expect(console.log).not.toHaveBeenCalled()
  })

  it('vuelve a confirmar cada tanto que el problema sigue vivo', async () => {
    prisma.mcpAuthFailure.upsert.mockResolvedValue({ attempts: LOG_EVERY })
    await recordFailure(req(), { reason: 'unknown_token', tokenHash: HASH })

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`intento #${LOG_EVERY}`))
  })

  it('no usa stderr: en Railway eso se clasifica como error y tapa los de verdad', async () => {
    prisma.mcpAuthFailure.upsert.mockResolvedValue({ attempts: 1 })
    await recordFailure(req(), { reason: 'unknown_token', tokenHash: HASH })

    expect(console.warn).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('pero una base caída SÍ es un error del servidor', async () => {
    await recordFailure(req(), { reason: 'db_error', tokenHash: HASH, error: new Error('timeout') })

    expect(console.error).toHaveBeenCalled()
  })

  // El throttle vale para el log, no para el aviso: el mail tiene su propio criterio
  // (tercer intento + un día de cooldown) y no debe depender de si esa vez se logueó.
  it('el throttle del log no se come el mail', async () => {
    prisma.mcpAuthFailure.upsert.mockResolvedValue({ attempts: LOG_FIRST + 1 })
    await recordFailure(req(), { reason: 'revoked', tokenHash: HASH, row: revokedRow() })

    expect(console.log).not.toHaveBeenCalled()
    expect(sendMcpTokenRevokedNotice).toHaveBeenCalled()
  })
})
