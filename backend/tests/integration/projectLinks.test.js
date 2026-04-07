jest.mock('../../src/lib/prisma', () => ({
  projectMember: { findUnique: jest.fn() },
  projectLink:   { deleteMany: jest.fn(), createMany: jest.fn() },
  project:       { findUnique: jest.fn() },
  $transaction:  jest.fn(),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET = process.env.JWT_SECRET

function authHeader(userId = 1, isAdmin = false) {
  const token = jwt.sign({ id: userId, role: 'USER', isAdmin, name: 'Test', email: 't@t.com' }, SECRET)
  return `Bearer ${token}`
}

const mockProject = {
  id: 1, name: 'Proyecto Test', active: true,
  links: [{ id: 1, label: 'Drive', url: 'https://drive.google.com' }],
  services: [], members: [],
}

describe('PUT /api/projects/:id/links', () => {
  it('permite a un miembro del proyecto guardar links', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: 1, userId: 1 })
    prisma.$transaction.mockResolvedValue([])
    prisma.project.findUnique.mockResolvedValue(mockProject)

    const res = await request(app)
      .put('/api/projects/1/links')
      .set('Authorization', authHeader(1))
      .send({ links: [{ label: 'Drive', url: 'https://drive.google.com' }] })

    expect(res.status).toBe(200)
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('devuelve 403 si el usuario no es miembro del proyecto', async () => {
    prisma.projectMember.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .put('/api/projects/1/links')
      .set('Authorization', authHeader(1))
      .send({ links: [{ label: 'Drive', url: 'https://drive.google.com' }] })

    expect(res.status).toBe(403)
  })

  it('permite a un admin guardar links sin ser miembro', async () => {
    prisma.$transaction.mockResolvedValue([])
    prisma.project.findUnique.mockResolvedValue(mockProject)

    const res = await request(app)
      .put('/api/projects/1/links')
      .set('Authorization', authHeader(1, true)) // isAdmin = true
      .send({ links: [{ label: 'Drive', url: 'https://drive.google.com' }] })

    expect(res.status).toBe(200)
    expect(prisma.projectMember.findUnique).not.toHaveBeenCalled()
  })

  it('devuelve 400 si un link no tiene label', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: 1, userId: 1 })

    const res = await request(app)
      .put('/api/projects/1/links')
      .set('Authorization', authHeader(1))
      .send({ links: [{ label: '', url: 'https://drive.google.com' }] })

    expect(res.status).toBe(400)
  })

  it('devuelve 400 si links no es un array', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: 1, userId: 1 })

    const res = await request(app)
      .put('/api/projects/1/links')
      .set('Authorization', authHeader(1))
      .send({ links: 'no-es-array' })

    expect(res.status).toBe(400)
  })

  it('devuelve 401 sin autenticación', async () => {
    const res = await request(app)
      .put('/api/projects/1/links')
      .send({ links: [] })

    expect(res.status).toBe(401)
  })
})
