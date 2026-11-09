jest.mock('../../src/lib/prisma', () => ({
  authHandoff: { deleteMany: jest.fn(), create: jest.fn() },
  $queryRaw: jest.fn(),
}))

const request = require('supertest')
const jwt = require('jsonwebtoken')
const prisma = require('../../src/lib/prisma')
const app = require('../../src/app')

const SECRET = process.env.JWT_SECRET
const stored = []

function sessionToken() {
  return jwt.sign(
    { userId: 1, workspaceId: 1, role: 'owner', isSuperAdmin: false, name: 'Ana', email: 'a@t.com' },
    SECRET,
  )
}

beforeEach(() => {
  stored.length = 0
  jest.clearAllMocks()
  prisma.authHandoff.deleteMany.mockResolvedValue({ count: 0 })
  prisma.authHandoff.create.mockImplementation(async ({ data }) => { stored.push(data); return data })
  prisma.$queryRaw.mockImplementation(async (_strings, codeHash) => {
    const idx = stored.findIndex(row => row.codeHash === codeHash && row.expiresAt > new Date())
    if (idx === -1) return []
    const [row] = stored.splice(idx, 1)
    return [{ token: row.token }]
  })
})

describe('POST /api/auth/handoff', () => {
  it('canjea un JWT de sesión por un código y ese código por el mismo JWT, una sola vez', async () => {
    const token = sessionToken()

    const created = await request(app).post('/api/auth/handoff').send({ token })
    expect(created.status).toBe(200)
    expect(created.body.code).toEqual(expect.any(String))
    expect(created.body.token).toBeUndefined()

    const exchanged = await request(app).post('/api/auth/handoff/exchange').send({ code: created.body.code })
    expect(exchanged.status).toBe(200)
    expect(exchanged.body.token).toBe(token)

    const again = await request(app).post('/api/auth/handoff/exchange').send({ code: created.body.code })
    expect(again.status).toBe(401)
    expect(again.body.code).toBe('HANDOFF_EXPIRED')
  })

  it('rechaza un JWT que no es de sesión', async () => {
    const token = jwt.sign({ userId: 1, purpose: 'mfa' }, SECRET)
    const res = await request(app).post('/api/auth/handoff').send({ token })
    expect(res.status).toBe(401)
    expect(prisma.authHandoff.create).not.toHaveBeenCalled()
  })
})
