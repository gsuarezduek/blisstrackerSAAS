jest.mock('../../src/lib/prisma', () => {
  const prisma = {
    workspace:         { findUnique: jest.fn() },
    featureFlag:       { findUnique: jest.fn() },
    workspaceMember:   { findUnique: jest.fn() },
    eOSStrike:         { findFirst: jest.fn() },
    oneOnOne:          { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    oneOnOneAgreement: { findFirst: jest.fn(), update: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
  }
  prisma.$transaction = jest.fn(arg => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)))
  return prisma
})

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET = process.env.JWT_SECRET
const SLUG = 'bliss'
const WS = 1
const TARGET = 7

const token = (role = 'admin') => `Bearer ${jwt.sign(
  { userId: 1, workspaceId: WS, role, isSuperAdmin: false, name: 'Ana Admin', email: 'ana@bliss.ar' }, SECRET)}`

function mockBase(role = 'admin') {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WS, slug: SLUG, status: 'active', name: 'Bliss', timezone: 'America/Argentina/Buenos_Aires',
  })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'rrhh', enabledGlobally: true, enabledWorkspaceIds: '[]' })
  prisma.workspaceMember.findUnique.mockImplementation(({ where }) => {
    const uid = where?.workspaceId_userId?.userId
    if (uid === TARGET) return Promise.resolve({ workspaceId: WS, userId: TARGET, active: true })
    return Promise.resolve({ workspaceId: WS, userId: 1, role, active: true })
  })
  prisma.oneOnOne.create.mockImplementation(({ data }) => Promise.resolve({ id: 100, ...data }))
  prisma.oneOnOne.findFirst.mockResolvedValue({ id: 100 })
  prisma.oneOnOne.findUnique.mockResolvedValue({ id: 100, agreements: [] })
  prisma.oneOnOne.findMany.mockResolvedValue([])
  prisma.oneOnOneAgreement.deleteMany.mockResolvedValue({ count: 0 })
  prisma.oneOnOneAgreement.createMany.mockResolvedValue({ count: 0 })
}

const post = body => request(app)
  .post('/api/admin/rrhh/one-on-ones')
  .set('Authorization', token()).set('X-Workspace', SLUG).send(body)

describe('POST /api/admin/rrhh/one-on-ones', () => {
  beforeEach(() => { jest.clearAllMocks(); mockBase() })

  it('registra el 1on1 con sus acuerdos y quien lo carga queda como líder', async () => {
    const res = await post({ userId: TARGET, date: '2026-11-05', notes: 'Repaso del mes', agreements: ['Avisar con 48 h', 'Pasar el informe el lunes'] })
    expect(res.status).toBe(201)
    const { data } = prisma.oneOnOne.create.mock.calls[0][0]
    expect(data).toMatchObject({ workspaceId: WS, userId: TARGET, leaderId: 1, date: '2026-11-05', createdById: 1 })
    expect(data.agreements.create.map(a => a.text)).toEqual(['Avisar con 48 h', 'Pasar el informe el lunes'])
    expect(data.agreements.create.map(a => a.order)).toEqual([0, 1])
  })

  it('sin fecha usa hoy en la zona del workspace', async () => {
    await post({ userId: TARGET })
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    expect(prisma.oneOnOne.create.mock.calls[0][0].data.date).toBe(today)
  })

  it('descarta acuerdos vacíos y tolera objetos o strings', async () => {
    await post({ userId: TARGET, agreements: ['  ', { text: 'Uno' }, '', { text: '  Dos  ', done: true }] })
    const created = prisma.oneOnOne.create.mock.calls[0][0].data.agreements.create
    expect(created.map(a => a.text)).toEqual(['Uno', 'Dos'])
    expect(created[1].done).toBe(true)
  })

  it('rechaza una fecha que no sea YYYY-MM-DD', async () => {
    expect((await post({ userId: TARGET, date: '05/11/2026' })).status).toBe(400)
  })

  // "Revisar el acuerdo del último strike" no tiene sentido con la falta de otro.
  it('no deja vincular una falta que no es de esa persona', async () => {
    prisma.eOSStrike.findFirst.mockResolvedValue(null)
    const res = await post({ userId: TARGET, strikeId: 55 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no es de esta persona/)
  })

  it('vincula la falta cuando sí es de esa persona', async () => {
    prisma.eOSStrike.findFirst.mockResolvedValue({ id: 55 })
    await post({ userId: TARGET, strikeId: 55 })
    expect(prisma.oneOnOne.create.mock.calls[0][0].data.strikeId).toBe(55)
  })

  it('404 si la persona no es de este workspace', async () => {
    prisma.workspaceMember.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(where?.workspaceId_userId?.userId === TARGET ? null : { workspaceId: WS, userId: 1, role: 'admin', active: true }))
    expect((await post({ userId: TARGET })).status).toBe(404)
  })

  it('pide acceso al módulo RRHH', async () => {
    mockBase('member')
    const res = await request(app)
      .post('/api/admin/rrhh/one-on-ones')
      .set('Authorization', token('member')).set('X-Workspace', SLUG).send({ userId: TARGET })
    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/admin/rrhh/one-on-ones/:id', () => {
  beforeEach(() => { jest.clearAllMocks(); mockBase() })

  // Mismo criterio que `PUT /projects/:id/links`: el editor manda lo que quedó en
  // pantalla, no un diff, así que la lista se reemplaza entera.
  it('reemplaza la lista completa de acuerdos', async () => {
    const res = await request(app)
      .patch('/api/admin/rrhh/one-on-ones/100')
      .set('Authorization', token()).set('X-Workspace', SLUG)
      .send({ agreements: ['Solo este'] })
    expect(res.status).toBe(200)
    expect(prisma.oneOnOneAgreement.deleteMany).toHaveBeenCalledWith({ where: { oneOnOneId: 100 } })
    expect(prisma.oneOnOneAgreement.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ oneOnOneId: 100, text: 'Solo este', order: 0 }),
    ])
  })

  it('una lista vacía borra los acuerdos sin recrear nada', async () => {
    await request(app)
      .patch('/api/admin/rrhh/one-on-ones/100')
      .set('Authorization', token()).set('X-Workspace', SLUG).send({ agreements: [] })
    expect(prisma.oneOnOneAgreement.deleteMany).toHaveBeenCalled()
    expect(prisma.oneOnOneAgreement.createMany).not.toHaveBeenCalled()
  })

  it('404 si el 1on1 es de otro workspace', async () => {
    prisma.oneOnOne.findFirst.mockResolvedValue(null)
    const res = await request(app)
      .patch('/api/admin/rrhh/one-on-ones/100')
      .set('Authorization', token()).set('X-Workspace', SLUG).send({ notes: 'x' })
    expect(res.status).toBe(404)
  })
})

describe('PATCH .../one-on-ones/:id/agreements/:agreementId', () => {
  beforeEach(() => { jest.clearAllMocks(); mockBase() })

  it('tilda un acuerdo y sella cuándo', async () => {
    prisma.oneOnOneAgreement.findFirst.mockResolvedValue({ id: 5 })
    prisma.oneOnOneAgreement.update.mockResolvedValue({ id: 5, done: true })
    const res = await request(app)
      .patch('/api/admin/rrhh/one-on-ones/100/agreements/5')
      .set('Authorization', token()).set('X-Workspace', SLUG).send({ done: true })
    expect(res.status).toBe(200)
    const { data } = prisma.oneOnOneAgreement.update.mock.calls[0][0]
    expect(data.done).toBe(true)
    expect(data.doneAt).toBeInstanceOf(Date)
  })

  it('destildar limpia la fecha', async () => {
    prisma.oneOnOneAgreement.findFirst.mockResolvedValue({ id: 5 })
    prisma.oneOnOneAgreement.update.mockResolvedValue({ id: 5, done: false })
    await request(app)
      .patch('/api/admin/rrhh/one-on-ones/100/agreements/5')
      .set('Authorization', token()).set('X-Workspace', SLUG).send({ done: false })
    expect(prisma.oneOnOneAgreement.update.mock.calls[0][0].data).toMatchObject({ done: false, doneAt: null })
  })

  // El acuerdo se busca scopeado al 1on1 Y al workspace: sin eso, un id adivinado
  // dejaría tildar el acuerdo de otra empresa.
  it('404 si el acuerdo no es de ese 1on1', async () => {
    prisma.oneOnOneAgreement.findFirst.mockResolvedValue(null)
    const res = await request(app)
      .patch('/api/admin/rrhh/one-on-ones/100/agreements/999')
      .set('Authorization', token()).set('X-Workspace', SLUG).send({ done: true })
    expect(res.status).toBe(404)
    expect(prisma.oneOnOneAgreement.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 999, oneOnOneId: 100, oneOnOne: { workspaceId: WS },
    })
  })
})
