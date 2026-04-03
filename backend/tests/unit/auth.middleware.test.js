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
    const payload = { id: 1, role: 'USER', name: 'Ana', email: 'ana@test.com' }
    const token = jwt.sign(payload, SECRET)

    const req  = { headers: { authorization: `Bearer ${token}` } }
    const res  = makeRes()
    const next = jest.fn()

    auth(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(req.user.id).toBe(1)
    expect(req.user.role).toBe('USER')
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
    const token = jwt.sign({ id: 1 }, SECRET, { expiresIn: '0s' })

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
  it('llama next() si el usuario es ADMIN', () => {
    const req  = { user: { role: 'ADMIN' } }
    const res  = makeRes()
    const next = jest.fn()

    adminOnly(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('retorna 403 si el usuario no es ADMIN', () => {
    const req  = { user: { role: 'DESIGNER' } }
    const res  = makeRes()
    const next = jest.fn()

    adminOnly(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('retorna 403 si req.user no está seteado', () => {
    const req  = {}
    const res  = makeRes()
    const next = jest.fn()

    adminOnly(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})
