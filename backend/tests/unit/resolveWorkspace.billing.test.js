jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const { resolveWorkspace } = require('../../src/middleware/workspace')

function makeRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json   = jest.fn().mockReturnValue(res)
  return res
}

function makeReq({ method = 'POST', baseUrl = '/api/tasks', isSuperAdmin = false } = {}) {
  return {
    method,
    baseUrl,
    headers: { 'x-workspace': 'acme' },
    user:    { userId: 1, isSuperAdmin },
  }
}

const MEMBER = { workspaceId: 1, userId: 1, role: 'member', active: true }

describe('resolveWorkspace — bloqueo de escritura en past_due', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.workspaceMember.findUnique.mockResolvedValue(MEMBER)
  })

  function mockWorkspace(status) {
    prisma.workspace.findUnique.mockResolvedValue({ id: 1, slug: 'acme', status })
  }

  it('bloquea una escritura (POST) con 402 + code BILLING_PAST_DUE', async () => {
    mockWorkspace('past_due')
    const req = makeReq({ method: 'POST', baseUrl: '/api/tasks' })
    const res = makeRes()
    const next = jest.fn()

    await resolveWorkspace(req, res, next)

    expect(res.status).toHaveBeenCalledWith(402)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'BILLING_PAST_DUE' }))
    expect(next).not.toHaveBeenCalled()
  })

  it('permite lecturas (GET) en past_due', async () => {
    mockWorkspace('past_due')
    const req = makeReq({ method: 'GET', baseUrl: '/api/tasks' })
    const res = makeRes()
    const next = jest.fn()

    await resolveWorkspace(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalledWith(402)
  })

  it('permite escrituras a /api/billing en past_due (para poder pagar)', async () => {
    mockWorkspace('past_due')
    const req = makeReq({ method: 'POST', baseUrl: '/api/billing' })
    const res = makeRes()
    const next = jest.fn()

    await resolveWorkspace(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('permite escrituras a /api/profile en past_due (gestión de cuenta)', async () => {
    mockWorkspace('past_due')
    const req = makeReq({ method: 'PATCH', baseUrl: '/api/profile' })
    const res = makeRes()
    const next = jest.fn()

    await resolveWorkspace(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('no bloquea a super admins en past_due', async () => {
    mockWorkspace('past_due')
    prisma.workspaceMember.findUnique.mockResolvedValue(MEMBER)
    const req = makeReq({ method: 'POST', baseUrl: '/api/tasks', isSuperAdmin: true })
    const res = makeRes()
    const next = jest.fn()

    await resolveWorkspace(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('no afecta escrituras cuando el workspace está active', async () => {
    mockWorkspace('active')
    const req = makeReq({ method: 'POST', baseUrl: '/api/tasks' })
    const res = makeRes()
    const next = jest.fn()

    await resolveWorkspace(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalledWith(402)
  })

  it('sigue bloqueando todo (incluso GET) con 402 si está suspended', async () => {
    mockWorkspace('suspended')
    const req = makeReq({ method: 'GET', baseUrl: '/api/tasks' })
    const res = makeRes()
    const next = jest.fn()

    await resolveWorkspace(req, res, next)

    expect(res.status).toHaveBeenCalledWith(402)
    expect(next).not.toHaveBeenCalled()
  })
})
