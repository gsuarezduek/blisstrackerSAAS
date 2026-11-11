jest.mock('../../src/lib/prisma', () => {
  const prisma = {
    workspace:       { findUnique: jest.fn() },
    featureFlag:     { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn(), update: jest.fn() },
    user:            { update: jest.fn(), findUnique: jest.fn() },
    notification:    { create: jest.fn() },
  }
  prisma.$transaction = jest.fn(arg => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)))
  return prisma
})

jest.mock('../../src/services/email.service', () => ({
  sendLegajoRequestEmail: jest.fn().mockResolvedValue(undefined),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const { sendLegajoRequestEmail } = require('../../src/services/email.service')
const app     = require('../../src/app')

const SECRET = process.env.JWT_SECRET
const SLUG = 'bliss'
const WS = 1
const TARGET = 7

const token = (userId = 1, role = 'admin') => `Bearer ${jwt.sign(
  { userId, workspaceId: WS, role, isSuperAdmin: false, name: 'Ana Admin', email: 'ana@bliss.ar' }, SECRET)}`

function mockBase(role = 'admin') {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WS, slug: SLUG, status: 'active', name: 'Bliss', legajoFields: [], legajoEnabled: true,
  })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'rrhh', enabledGlobally: true, enabledWorkspaceIds: '[]' })
  // resolveWorkspace mira al que hace el request; loadTarget, al destinatario.
  prisma.workspaceMember.findUnique.mockImplementation(({ where }) => {
    const uid = where?.workspaceId_userId?.userId
    if (uid === TARGET) {
      return Promise.resolve({
        workspaceId: WS, userId: TARGET, role: 'member', active: true, legajoData: {},
        user: { id: TARGET, name: 'Beto Gómez', email: 'beto@bliss.ar' },
      })
    }
    return Promise.resolve({ workspaceId: WS, userId: 1, role, active: true })
  })
  prisma.user.update.mockResolvedValue({ id: TARGET })
  prisma.user.findUnique.mockResolvedValue({ id: TARGET })
  prisma.workspaceMember.update.mockResolvedValue({})
  prisma.notification.create.mockResolvedValue({})
}

const patch = body => request(app)
  .patch(`/api/admin/rrhh/legajo/${TARGET}`)
  .set('Authorization', token()).set('X-Workspace', SLUG).send(body)

const ask = body => request(app)
  .post(`/api/admin/rrhh/legajo/${TARGET}/request`)
  .set('Authorization', token()).set('X-Workspace', SLUG).send(body)

describe('PATCH /api/admin/rrhh/legajo/:userId', () => {
  beforeEach(() => { jest.clearAllMocks(); mockBase() })

  it('completa campos administrativos en la columna de User', async () => {
    const res = await patch({ values: { cuit: '20-11111111-1', healthInsurance: 'OSDE' } })
    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: TARGET },
      data: { cuit: '20-11111111-1', healthInsurance: 'OSDE' },
    }))
  })

  // La razón de ser de la lista `selfOnly`: que un dato de salud figure en el
  // legajo es útil, que lo tipee un tercero es otra cosa.
  it('rechaza los campos de salud que solo carga la persona', async () => {
    const res = await patch({ values: { medicalConditions: 'Alérgico a la penicilina' } })
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'FIELD_SELF_ONLY', field: 'medicalConditions' })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('un campo de salud contamina todo el pedido, no se guarda a medias', async () => {
    const res = await patch({ values: { cuit: '20-11111111-1', bloodType: 'A+' } })
    expect(res.status).toBe(400)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('le avisa a la persona que alguien le tocó el legajo', async () => {
    await patch({ values: { cuit: '20-11111111-1' } })
    await new Promise(r => setImmediate(r))
    expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: TARGET, actorId: 1, type: 'LEGAJO_UPDATED' }),
    }))
  })

  it('ignora claves que no existen en el legajo', async () => {
    const res = await patch({ values: { inventado: 'x' } })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Ning[úu]n campo editable/)
  })

  it('404 si la persona no es de este workspace', async () => {
    prisma.workspaceMember.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(where?.workspaceId_userId?.userId === TARGET ? null : { workspaceId: WS, userId: 1, role: 'admin', active: true }))
    expect((await patch({ values: { cuit: '1' } })).status).toBe(404)
  })

  it('pide acceso al módulo RRHH', async () => {
    mockBase('member')
    const res = await request(app)
      .patch(`/api/admin/rrhh/legajo/${TARGET}`)
      .set('Authorization', token(1, 'member')).set('X-Workspace', SLUG)
      .send({ values: { cuit: '1' } })
    expect(res.status).toBe(403)
  })
})

describe('POST /api/admin/rrhh/legajo/:userId/request', () => {
  beforeEach(() => { jest.clearAllMocks(); mockBase() })

  it('notifica y manda el mail con los campos pedidos', async () => {
    const res = await ask({ fieldKeys: ['cuit', 'bloodType'], note: 'Para la obra social' })
    expect(res.status).toBe(200)
    expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: TARGET, type: 'LEGAJO_REQUESTED' }),
    }))
    await new Promise(r => setImmediate(r))
    const [, , , , fields, askedBy, note] = sendLegajoRequestEmail.mock.calls[0]
    expect(fields.map(f => f.key)).toEqual(['cuit', 'bloodType'])
    expect(askedBy).toBe('Ana Admin')
    expect(note).toBe('Para la obra social')
  })

  // Pedir SÍ incluye los de salud: es justamente el único camino que les queda.
  it('deja pedir un campo que no se puede escribir desde RRHH', async () => {
    expect((await ask({ fieldKeys: ['medicalConditions'] })).status).toBe(200)
  })

  it('400 sin campos válidos', async () => {
    expect((await ask({ fieldKeys: [] })).status).toBe(400)
    expect((await ask({ fieldKeys: ['inventado'] })).status).toBe(400)
  })
})
