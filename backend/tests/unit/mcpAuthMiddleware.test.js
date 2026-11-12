/**
 * mcp/auth.js — qué motivo de rechazo reporta cada rama.
 *
 * El motivo no es cosmético: decide si el rechazo tiene dueño (y por lo tanto si puede
 * terminar en un mail) y separa "la credencial no sirve" de "la base no respondió", que
 * antes llegaban las dos como un 401 indistinguible.
 */
jest.mock('../../src/lib/prisma', () => ({
  mcpToken: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}), create: jest.fn() },
  workspace: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
}))
jest.mock('../../src/services/mcpAuthFailure.service', () => ({
  recordFailureAsync: jest.fn(),
}))

const prisma = require('../../src/lib/prisma')
const { recordFailureAsync } = require('../../src/services/mcpAuthFailure.service')
const { mcpAuth } = require('../../src/mcp/auth')

const makeRes = () => {
  const res = { statusCode: null, body: null }
  res.status = c => { res.statusCode = c; return res }
  res.json = b => { res.body = b; return res }
  return res
}
const reqWith = token => ({
  ip: '1.2.3.4',
  headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'user-agent': 'undici' },
})

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.MCP_TOKEN
  delete process.env.MCP_WORKSPACE_SLUG
  delete process.env.MCP_USER_EMAIL
})

it('sin header reporta no_token', async () => {
  const res = makeRes(); const next = jest.fn()
  await mcpAuth({ headers: {}, ip: '1.2.3.4' }, res, next)

  expect(res.statusCode).toBe(401)
  expect(res.body).toEqual({ error: 'No token provided' })
  expect(next).not.toHaveBeenCalled()
  expect(recordFailureAsync).toHaveBeenCalledWith(expect.anything(), { reason: 'no_token' })
})

it('un token que no existe reporta unknown_token y viaja sin fila', async () => {
  prisma.mcpToken.findUnique.mockResolvedValue(null)
  const res = makeRes(); const next = jest.fn()
  await mcpAuth(reqWith('no-existe'), res, next)

  expect(res.statusCode).toBe(401)
  expect(next).not.toHaveBeenCalled()
  const arg = recordFailureAsync.mock.calls[0][1]
  expect(arg.reason).toBe('unknown_token')
  expect(arg.row).toBeUndefined()
  expect(arg.tokenHash).toMatch(/^[0-9a-f]{64}$/)
})

it('un token revocado reporta revoked CON su fila (es el único que tiene dueño)', async () => {
  const row = { id: 7, userId: 3, workspaceId: 1, label: 'Grok', revokedAt: new Date(), workspace: { slug: 'bliss' } }
  prisma.mcpToken.findUnique.mockResolvedValue(row)
  const res = makeRes(); const next = jest.fn()
  await mcpAuth(reqWith('revocado'), res, next)

  expect(res.statusCode).toBe(401)
  expect(next).not.toHaveBeenCalled()
  const arg = recordFailureAsync.mock.calls[0][1]
  expect(arg.reason).toBe('revoked')
  expect(arg.row).toBe(row)
})

it('una base caída reporta db_error y no "token inválido"', async () => {
  prisma.mcpToken.findUnique.mockRejectedValue(new Error('connection timeout'))
  const res = makeRes(); const next = jest.fn()
  await mcpAuth(reqWith('cualquiera'), res, next)

  expect(res.statusCode).toBe(401)
  const arg = recordFailureAsync.mock.calls[0][1]
  expect(arg.reason).toBe('db_error')
  expect(arg.error.message).toBe('connection timeout')
})

it('un token válido pasa y no registra ningún rechazo', async () => {
  prisma.mcpToken.findUnique.mockResolvedValue({
    id: 7, userId: 3, workspaceId: 1, revokedAt: null, workspace: { slug: 'bliss' },
  })
  const res = makeRes(); const next = jest.fn()
  const req = reqWith('bueno')
  await mcpAuth(req, res, next)

  expect(next).toHaveBeenCalled()
  expect(res.statusCode).toBeNull()
  expect(recordFailureAsync).not.toHaveBeenCalled()
  expect(req.mcpIdentity).toMatchObject({ userId: 3, workspaceId: 1, tokenId: 7 })
})
