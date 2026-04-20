jest.mock('../../src/lib/prisma', () => ({
  workspace: {
    findUnique: jest.fn(),
  },
  workspaceMember: {
    findUnique: jest.fn(),
  },
}))

const prisma = require('../../src/lib/prisma')
const { resolveWorkspace, workspaceAdminOnly } = require('../../src/middleware/workspace')

function makeRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json   = jest.fn().mockReturnValue(res)
  return res
}

const WORKSPACE = { id: 1, slug: 'bliss', status: 'active', name: 'Bliss Marketing' }
const MEMBER    = { workspaceId: 1, userId: 1, role: 'member', active: true }

// ── resolveWorkspace ──────────────────────────────────────────────────────────

describe('resolveWorkspace', () => {
  beforeEach(() => jest.clearAllMocks())

  it('inyecta req.workspace y req.workspaceMember con datos válidos', async () => {
    prisma.workspace.findUnique.mockResolvedValue(WORKSPACE)
    prisma.workspaceMember.findUnique.mockResolvedValue(MEMBER)

    const req  = { headers: { 'x-workspace': 'bliss' }, user: { userId: 1, isSuperAdmin: false } }
    const res  = makeRes()
    const next = jest.fn()

    await resolveWorkspace(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(req.workspace).toEqual(WORKSPACE)
    expect(req.workspaceMember).toEqual(MEMBER)
  })

  it('retorna 400 si no hay header X-Workspace', async () => {
    const req  = { headers: {}, user: { userId: 1, isSuperAdmin: false } }
    const res  = makeRes()
    const next = jest.fn()

    await resolveWorkspace(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(next).not.toHaveBeenCalled()
  })

  it('retorna 404 si el workspace no existe', async () => {
    prisma.workspace.findUnique.mockResolvedValue(null)

    const req  = { headers: { 'x-workspace': 'inexistente' }, user: { userId: 1, isSuperAdmin: false } }
    const res  = makeRes()
    const next = jest.fn()

    await resolveWorkspace(req, res, next)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(next).not.toHaveBeenCalled()
  })

  it('retorna 402 si el workspace está suspendido', async () => {
    prisma.workspace.findUnique.mockResolvedValue({ ...WORKSPACE, status: 'suspended' })

    const req  = { headers: { 'x-workspace': 'bliss' }, user: { userId: 1, isSuperAdmin: false } }
    const res  = makeRes()
    const next = jest.fn()

    await resolveWorkspace(req, res, next)

    expect(res.status).toHaveBeenCalledWith(402)
    expect(next).not.toHaveBeenCalled()
  })

  it('retorna 402 si el workspace está cancelado', async () => {
    prisma.workspace.findUnique.mockResolvedValue({ ...WORKSPACE, status: 'cancelled' })

    const req  = { headers: { 'x-workspace': 'bliss' }, user: { userId: 1, isSuperAdmin: false } }
    const res  = makeRes()
    const next = jest.fn()

    await resolveWorkspace(req, res, next)

    expect(res.status).toHaveBeenCalledWith(402)
    expect(next).not.toHaveBeenCalled()
  })

  it('retorna 403 si el usuario no es miembro del workspace', async () => {
    prisma.workspace.findUnique.mockResolvedValue(WORKSPACE)
    prisma.workspaceMember.findUnique.mockResolvedValue(null)

    const req  = { headers: { 'x-workspace': 'bliss' }, user: { userId: 99, isSuperAdmin: false } }
    const res  = makeRes()
    const next = jest.fn()

    await resolveWorkspace(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('retorna 403 si el miembro está inactivo', async () => {
    prisma.workspace.findUnique.mockResolvedValue(WORKSPACE)
    prisma.workspaceMember.findUnique.mockResolvedValue({ ...MEMBER, active: false })

    const req  = { headers: { 'x-workspace': 'bliss' }, user: { userId: 1, isSuperAdmin: false } }
    const res  = makeRes()
    const next = jest.fn()

    await resolveWorkspace(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('super admin puede acceder aunque no sea miembro', async () => {
    prisma.workspace.findUnique.mockResolvedValue(WORKSPACE)
    prisma.workspaceMember.findUnique.mockResolvedValue(null)

    const req  = { headers: { 'x-workspace': 'bliss' }, user: { userId: 5, isSuperAdmin: true } }
    const res  = makeRes()
    const next = jest.fn()

    await resolveWorkspace(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(req.workspace).toEqual(WORKSPACE)
    expect(req.workspaceMember).toBeNull()
  })
})

// ── workspaceAdminOnly ────────────────────────────────────────────────────────

describe('workspaceAdminOnly', () => {
  it('llama next() si workspaceMember.role es "admin"', () => {
    const req  = { user: { isSuperAdmin: false }, workspaceMember: { role: 'admin' } }
    const res  = makeRes()
    const next = jest.fn()

    workspaceAdminOnly(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('llama next() si workspaceMember.role es "owner"', () => {
    const req  = { user: { isSuperAdmin: false }, workspaceMember: { role: 'owner' } }
    const res  = makeRes()
    const next = jest.fn()

    workspaceAdminOnly(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('retorna 403 si workspaceMember.role es "member"', () => {
    const req  = { user: { isSuperAdmin: false }, workspaceMember: { role: 'member' } }
    const res  = makeRes()
    const next = jest.fn()

    workspaceAdminOnly(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('retorna 403 si no hay workspaceMember', () => {
    const req  = { user: { isSuperAdmin: false } }
    const res  = makeRes()
    const next = jest.fn()

    workspaceAdminOnly(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('bypassa la verificación si user.isSuperAdmin es true', () => {
    const req  = { user: { isSuperAdmin: true } }
    const res  = makeRes()
    const next = jest.fn()

    workspaceAdminOnly(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })
})
