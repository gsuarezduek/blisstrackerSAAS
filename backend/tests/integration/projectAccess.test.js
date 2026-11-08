// Accesos / credenciales de un proyecto: editarlos y el historial de cambios.
// Lo que se verifica acá es lo que hace distinta a esta edición de un PATCH
// cualquiera: un campo secreto que no viene en el body NO se toca (si no, para
// corregir un usuario habría que revelar antes la contraseña), reescribir el
// mismo valor no inventa un cambio en el historial, y el historial no guarda
// valores — solo qué campo cambió, quién y cuándo.
jest.mock('../../src/lib/prisma', () => ({
  workspace:        { findUnique: jest.fn() },
  workspaceMember:  { findUnique: jest.fn() },
  projectMember:    { findUnique: jest.fn() },
  project:          { findUnique: jest.fn(), findFirst: jest.fn() },
  projectAccess:    { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  projectAccessLog: { create: jest.fn(), findMany: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const { encrypt, decrypt } = require('../../src/lib/encryption')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1

function authHeader(userId = 7, role = 'member') {
  return `Bearer ${jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )}`
}

function req(method, path) {
  return request(app)[method](path)
    .set('Authorization', authHeader())
    .set('X-Workspace', WORKSPACE_SLUG)
}

// El acceso guardado: password y 2FA viven cifrados.
function storedAccess(over = {}) {
  return {
    id: 5, projectId: 1, workspaceId: WORKSPACE_ID,
    account: 'Instagram', username: 'cliente', extra: null,
    password: encrypt('vieja123'), twofa: encrypt('ABCD-2FA'),
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  prisma.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss' })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 7, role: 'member', active: true })
  prisma.project.findUnique.mockResolvedValue({ isPrivate: false })
  prisma.project.findFirst.mockResolvedValue({ id: 1 })
  prisma.projectAccessLog.create.mockResolvedValue({ id: 1 })
  prisma.projectAccess.update.mockImplementation(({ data }) => Promise.resolve({ ...storedAccess(), ...data }))
})

describe('PATCH /api/projects/:id/accesos/:accessId', () => {
  it('cambia solo la contraseña y deja el resto como estaba', async () => {
    prisma.projectAccess.findFirst.mockResolvedValue(storedAccess())

    const res = await req('patch', '/api/projects/1/accesos/5').send({ password: 'nueva456' })

    expect(res.status).toBe(200)
    // Nunca devuelve el valor, solo si lo tiene.
    expect(res.body).toMatchObject({ id: 5, hasPassword: true, hasTwofa: true })
    expect(res.body.password).toBeUndefined()

    const { data } = prisma.projectAccess.update.mock.calls[0][0]
    expect(Object.keys(data)).toEqual(['password'])
    expect(decrypt(data.password)).toBe('nueva456')

    expect(prisma.projectAccessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'update', fields: ['password'], userId: 7, label: 'Instagram' }),
    })
    // El historial no guarda valores: ni el viejo ni el nuevo.
    const logged = JSON.stringify(prisma.projectAccessLog.create.mock.calls[0][0])
    expect(logged).not.toContain('nueva456')
    expect(logged).not.toContain('vieja123')
  })

  it('un campo secreto ausente en el body no se toca', async () => {
    prisma.projectAccess.findFirst.mockResolvedValue(storedAccess())

    const res = await req('patch', '/api/projects/1/accesos/5')
      .send({ account: 'Instagram', username: 'cliente-nuevo', extra: '' })

    expect(res.status).toBe(200)
    const { data } = prisma.projectAccess.update.mock.calls[0][0]
    expect(data).toEqual({ username: 'cliente-nuevo' })
    expect(data).not.toHaveProperty('password')
    expect(data).not.toHaveProperty('twofa')
  })

  it("'' borra el dato (es lo que manda el botón «quitar»)", async () => {
    prisma.projectAccess.findFirst.mockResolvedValue(storedAccess())

    const res = await req('patch', '/api/projects/1/accesos/5').send({ twofa: '' })

    expect(res.status).toBe(200)
    expect(prisma.projectAccess.update.mock.calls[0][0].data).toEqual({ twofa: null })
    expect(prisma.projectAccessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'update', fields: ['twofa'] }),
    })
  })

  it('reescribir el mismo valor no escribe nada ni inventa una entrada del historial', async () => {
    prisma.projectAccess.findFirst.mockResolvedValue(storedAccess())

    const res = await req('patch', '/api/projects/1/accesos/5')
      .send({ account: 'Instagram', username: 'cliente', password: 'vieja123' })

    expect(res.status).toBe(200)
    expect(prisma.projectAccess.update).not.toHaveBeenCalled()
    expect(prisma.projectAccessLog.create).not.toHaveBeenCalled()
  })

  it('rechaza dejar el acceso completamente vacío', async () => {
    prisma.projectAccess.findFirst.mockResolvedValue(
      storedAccess({ twofa: null, extra: null, account: null }),
    )

    const res = await req('patch', '/api/projects/1/accesos/5')
      .send({ username: '', password: '' })

    expect(res.status).toBe(400)
    expect(prisma.projectAccess.update).not.toHaveBeenCalled()
  })

  it('404 si el acceso no es de ese proyecto', async () => {
    prisma.projectAccess.findFirst.mockResolvedValue(null)

    const res = await req('patch', '/api/projects/1/accesos/99').send({ password: 'x' })

    expect(res.status).toBe(404)
  })
})

describe('historial de accesos', () => {
  it('el alta queda registrada con los campos que se cargaron', async () => {
    prisma.projectAccess.create.mockResolvedValue(storedAccess({ twofa: null }))

    const res = await req('post', '/api/projects/1/accesos')
      .send({ account: 'Instagram', username: 'cliente', password: 'vieja123', twofa: '', extra: '' })

    expect(res.status).toBe(201)
    expect(prisma.projectAccessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'create', fields: ['account', 'username', 'password'] }),
    })
  })

  it('la baja se registra ANTES de borrar, para que el label sobreviva al SetNull', async () => {
    prisma.projectAccess.findFirst.mockResolvedValue(storedAccess())
    prisma.projectAccess.delete.mockResolvedValue(storedAccess())

    const res = await req('delete', '/api/projects/1/accesos/5')

    expect(res.status).toBe(200)
    expect(prisma.projectAccessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'delete', accessId: 5, label: 'Instagram' }),
    })
    const logOrder = prisma.projectAccessLog.create.mock.invocationCallOrder[0]
    const delOrder = prisma.projectAccess.delete.mock.invocationCallOrder[0]
    expect(logOrder).toBeLessThan(delOrder)
  })

  it('ver una contraseña sigue registrando el reveal', async () => {
    prisma.projectAccess.findFirst.mockResolvedValue(storedAccess())

    const res = await req('get', '/api/projects/1/accesos/5/reveal?field=twofa')

    expect(res.status).toBe(200)
    expect(res.body.value).toBe('ABCD-2FA')
    expect(prisma.projectAccessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'reveal', field: 'twofa' }),
    })
  })

  it('GET .../accesos/logs separa cambios de reveals y usa el nombre vigente del acceso', async () => {
    prisma.projectAccessLog.findMany.mockResolvedValue([
      {
        id: 2, action: 'update', field: null, fields: ['password'], label: 'Insta viejo',
        accessId: 5, createdAt: new Date('2026-02-02'),
        user: { id: 7, name: 'Gastón', avatar: '2bee.png' },
        access: { account: 'Instagram' },
      },
      {
        id: 1, action: 'delete', field: null, fields: null, label: 'Facebook',
        accessId: null, createdAt: new Date('2026-02-01'),
        user: { id: 7, name: 'Gastón', avatar: '2bee.png' },
        access: null,
      },
    ])

    const res = await req('get', '/api/projects/1/accesos/logs?type=changes')

    expect(res.status).toBe(200)
    expect(prisma.projectAccessLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId: 1, action: { in: ['create', 'update', 'delete'] } },
      orderBy: { createdAt: 'desc' },
    }))
    // Con el acceso vivo manda su nombre actual; borrado, el que quedó congelado.
    expect(res.body[0]).toMatchObject({ action: 'update', fields: ['password'], account: 'Instagram' })
    expect(res.body[1]).toMatchObject({ action: 'delete', fields: [], account: 'Facebook' })
  })

  it('el tope de filas no lo elige el cliente', async () => {
    prisma.projectAccessLog.findMany.mockResolvedValue([])

    await req('get', '/api/projects/1/accesos/logs?limit=5000')

    expect(prisma.projectAccessLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }))
  })
})
