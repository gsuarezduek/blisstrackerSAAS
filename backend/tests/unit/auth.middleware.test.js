const jwt = require('jsonwebtoken')
const { auth } = require('../../src/middleware/auth')

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
