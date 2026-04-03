jest.mock('../../src/lib/prisma', () => ({
  user: {
    findUnique: jest.fn(),
  },
}))
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash:    jest.fn(),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const bcrypt  = require('bcryptjs')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET = process.env.JWT_SECRET

const mockUser = {
  id:       1,
  name:     'Ana García',
  email:    'ana@test.com',
  password: '$2a$10$hashedpassword',
  role:     'USER',
  active:   true,
  avatar:   'bee.png',
}

// ── POST /api/auth/login ───────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('devuelve 200 + token con credenciales válidas', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser)
    bcrypt.compare.mockResolvedValue(true)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@test.com', password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.user.email).toBe('ana@test.com')
    expect(res.body.user.password).toBeUndefined() // nunca se devuelve la contraseña
  })

  it('devuelve 401 si la contraseña es incorrecta', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser)
    bcrypt.compare.mockResolvedValue(false)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@test.com', password: 'wrongpassword' })

    expect(res.status).toBe(401)
  })

  it('devuelve 401 si el email no existe', async () => {
    prisma.user.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noexiste@test.com', password: 'password123' })

    expect(res.status).toBe(401)
  })

  it('devuelve 401 si el usuario está inactivo', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...mockUser, active: false })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@test.com', password: 'password123' })

    expect(res.status).toBe(401)
  })

  it('devuelve 400 si faltan campos', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@test.com' })  // sin password

    expect(res.status).toBe(400)
  })
})

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('devuelve 200 con datos del usuario con token válido', async () => {
    const token = jwt.sign({ id: 1, role: 'USER' }, SECRET)
    prisma.user.findUnique.mockResolvedValue(mockUser)

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.email).toBe('ana@test.com')
  })

  it('devuelve 401 sin token', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('devuelve 401 con token inválido', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer token.falso.xyz')

    expect(res.status).toBe(401)
  })
})
