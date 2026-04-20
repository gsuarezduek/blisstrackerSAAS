const jwt = require('jsonwebtoken')
const { auth, adminOnly } = require('../../src/middleware/auth')

const SECRET = process.env.JWT_SECRET

function makeRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json   = jest.fn().mockReturnValue(res)
  return res
}

// ── auth ──────────────────────────────────────────────────────────────────────

describe('auth middleware', () => {
  it('llama next() y setea req.user con un token válido', () => {
    const payload = { userId: 1, workspaceId: 1, role: 'member', isSuperAdmin: false, name: 'Ana', email: 'ana@test.com' }
    const token = jwt.sign(payload, SECRET)

    const req  = { headers: { authorization: `Bearer ${token}` } }
    const res  = makeRes()
    const next = jest.fn()

    auth(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(req.user.userId).toBe(1)
    expect(req.user.workspaceId).toBe(1)
    expect(req.user.role).toBe('member')
  })

  it('retorna 401 si no hay header Authorization', () => {
    const req  = { headers: {} }
    const res  = makeRes()
    const next = jest.fn()

    auth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('retorna 401 si el header no empieza con Bearer', () => {
    const req  = { headers: { authorization: 'Token abc123' } }
    const res  = makeRes()
    const next = jest.fn()

    auth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('retorna 401 con token malformado', () => {
    const req  = { headers: { authorization: 'Bearer token.invalido.xyz' } }
    const res  = makeRes()
    const next = jest.fn()

    auth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('retorna 401 con token expirado', () => {
    const token = jwt.sign({ userId: 1, workspaceId: 1 }, SECRET, { expiresIn: '0s' })

    const req  = { headers: { authorization: `Bearer ${token}` } }
    const res  = makeRes()
    const next = jest.fn()

    auth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })
})

// ── adminOnly ─────────────────────────────────────────────────────────────────

describe('adminOnly middleware', () => {
  it('llama next() si workspaceMember.role es "admin"', () => {
    const req  = { user: { isSuperAdmin: false }, workspaceMember: { role: 'admin' } }
    const res  = makeRes()
    const next = jest.fn()

    adminOnly(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('llama next() si workspaceMember.role es "owner"', () => {
    const req  = { user: { isSuperAdmin: false }, workspaceMember: { role: 'owner' } }
    const res  = makeRes()
    const next = jest.fn()

    adminOnly(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('retorna 403 si workspaceMember.role es "member"', () => {
    const req  = { user: { isSuperAdmin: false }, workspaceMember: { role: 'member' } }
    const res  = makeRes()
    const next = jest.fn()

    adminOnly(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('retorna 403 si no hay workspaceMember', () => {
    const req  = { user: { isSuperAdmin: false } }
    const res  = makeRes()
    const next = jest.fn()

    adminOnly(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('bypassa la verificación si user.isSuperAdmin es true', () => {
    const req  = { user: { isSuperAdmin: true } }
    const res  = makeRes()
    const next = jest.fn()

    adminOnly(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })
})
