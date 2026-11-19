// Mailing por MCP: un agente suma contactos (suscriptos, con el consentimiento
// registrado como del agente), da de baja, segmenta, sube imágenes y borra
// borradores; importar en masa, cambiar el email, re-suscribir, borrar contactos o
// una campaña lanzada queda para una persona (403 HUMAN_ONLY).
jest.mock('../../src/lib/prisma', () => ({
  workspace:         { findUnique: jest.fn() },
  workspaceMember:   { findUnique: jest.fn() },
  projectMember:     { findUnique: jest.fn() },
  project:           { findFirst: jest.fn(), findUnique: jest.fn() },
  featureFlag:       { findUnique: jest.fn() },
  mailingContact:    { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), createMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
  mailingList:       { findMany: jest.fn(), findFirst: jest.fn() },
  mailingListMember: { createMany: jest.fn(), deleteMany: jest.fn() },
  mailingCampaign:   { findFirst: jest.fn(), delete: jest.fn() },
  $transaction:      jest.fn(async ops => ops),
}))
jest.mock('../../src/lib/platformSettings', () => ({ getSetting: jest.fn().mockResolvedValue(0) }))
jest.mock('../../src/services/mailing/providers', () => {
  const provider = { sendBatch: jest.fn(), PER_TICK: 100 }
  return { getProvider: () => provider, PROVIDER_KEYS: ['resend', 'smtp', 'ses'], __provider: provider }
})
jest.mock('../../src/services/objectStorage.service', () => ({
  isConfigured: jest.fn(() => true),
  putObject: jest.fn().mockResolvedValue({ url: 'https://cdn.test/mailing/1/x.png' }),
}))

const request = require('supertest')
const jwt = require('jsonwebtoken')
const prisma = require('../../src/lib/prisma')
const { __provider: provider } = require('../../src/services/mailing/providers')
const storage = require('../../src/services/objectStorage.service')
const app = require('../../src/app')

const BASE = '/api/marketing/projects/7/mailing'

function req(method, url, { agent = false } = {}) {
  const token = jwt.sign({
    userId: 1, workspaceId: 1, role: 'admin', isSuperAdmin: false, name: 'A', email: 'a@t.com',
    ...(agent ? { mcpTokenId: 55 } : {}),
  }, process.env.JWT_SECRET)
  return request(app)[method](url).set('Authorization', `Bearer ${token}`).set('X-Workspace', 'bliss')
}

beforeEach(() => {
  prisma.workspace.findUnique.mockResolvedValue({ id: 1, slug: 'bliss', status: 'active', name: 'B', disabledFeatureKeys: '[]', members: [{ workspaceId: 1, userId: 1, role: 'admin', active: true }] })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: 1, userId: 1, role: 'admin', active: true })
  prisma.featureFlag.findUnique.mockImplementation(({ where }) => Promise.resolve({ key: where.key, enabledGlobally: true, enabledWorkspaceIds: '[]' }))
  prisma.project.findFirst.mockResolvedValue({ id: 7 })
  prisma.project.findUnique.mockResolvedValue({ isPrivate: false, marketingEnabled: true, contenidoEnabled: true })
  prisma.mailingList.findMany.mockResolvedValue([{ id: 3 }])
  prisma.mailingList.findFirst.mockResolvedValue({ id: 3, name: 'Novedades' })
  prisma.mailingContact.findMany.mockResolvedValue([])
  prisma.mailingContact.create.mockImplementation(({ data }) => Promise.resolve({ id: 100, ...data }))
  prisma.mailingContact.update.mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data }))
})

describe('mailing_contacts_add: alta directa', () => {
  it('los nuevos entran suscriptos con el consentimiento declarado por el agente, sin mandar mails', async () => {
    prisma.mailingContact.findMany
      .mockResolvedValueOnce([{ id: 1, email: 'ya@y.com', status: 'subscribed', fields: {} }, { id: 2, email: 'baja@y.com', status: 'unsubscribed', fields: {} }])
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 100 }])
    const res = await req('post', `${BASE}/contacts/batch`, { agent: true }).send({
      listIds: [3],
      contacts: [{ email: 'Nuevo@Y.com', firstName: 'Ana' }, { email: 'ya@y.com' }, { email: 'baja@y.com' }, { email: 'no-es-un-mail' }],
    })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ new: 1, existing: 2, suppressed: 1, invalidCount: 1 })
    const created = prisma.mailingContact.createMany.mock.calls[0][0].data
    expect(created).toEqual([expect.objectContaining({ email: 'nuevo@y.com', firstName: 'Ana', source: 'agent', consentSource: 'agent' })])
    expect(created[0].status).toBeUndefined() // default del schema: subscribed
    // El dado de baja no se re-suscribe.
    expect(prisma.mailingContact.update).not.toHaveBeenCalled()
    expect(provider.sendBatch).not.toHaveBeenCalled()
  })

  it('más de 50 por llamada → 400', async () => {
    const contacts = Array.from({ length: 51 }, (_, i) => ({ email: `p${i}@y.com` }))
    const res = await req('post', `${BASE}/contacts/batch`, { agent: true }).send({ contacts })
    expect(res.status).toBe(400)
    expect(prisma.mailingContact.createMany).not.toHaveBeenCalled()
  })

  it('un contacto suelto cargado por el agente queda registrado como suyo', async () => {
    prisma.mailingContact.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 100, email: 'x@y.com', memberships: [] })
    const res = await req('post', `${BASE}/contacts`, { agent: true }).send({ email: 'x@y.com' })
    expect(res.status).toBe(201)
    expect(prisma.mailingContact.create.mock.calls[0][0].data).toMatchObject({ source: 'agent', consentSource: 'agent' })
  })

  it('importar en masa (CSV) vía MCP → 403; una persona sí', async () => {
    const res = await req('post', `${BASE}/contacts/import`, { agent: true }).send({ rows: [{ email: 'x@y.com' }], consent: true })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('HUMAN_ONLY')
    const human = await req('post', `${BASE}/contacts/import`).send({ rows: [{ email: 'x@y.com' }], consent: true })
    expect(human.status).toBe(200)
  })
})

describe('bajas, datos y bases', () => {
  it('da de baja por email, con el motivo', async () => {
    prisma.mailingContact.findFirst.mockResolvedValue({ id: 5, email: 'x@y.com', status: 'subscribed' })
    const res = await req('post', `${BASE}/contacts/unsubscribe`, { agent: true }).send({ email: 'X@y.com', reason: 'Lo pidió por mail' })
    expect(res.status).toBe(200)
    expect(res.body.changed).toBe(true)
    expect(prisma.mailingContact.findFirst).toHaveBeenCalledWith({ where: { projectId: 7, email: 'x@y.com' } })
    expect(prisma.mailingContact.update.mock.calls[0][0].data).toMatchObject({ status: 'unsubscribed', unsubscribeReason: 'Lo pidió por mail' })
  })

  it('un rebotado queda como está', async () => {
    prisma.mailingContact.findFirst.mockResolvedValue({ id: 5, email: 'x@y.com', status: 'bounced' })
    const res = await req('post', `${BASE}/contacts/unsubscribe`, { agent: true }).send({ email: 'x@y.com' })
    expect(res.body.changed).toBe(false)
    expect(prisma.mailingContact.update).not.toHaveBeenCalled()
  })

  it('un agente no cambia el email ni re-suscribe', async () => {
    prisma.mailingContact.findFirst.mockResolvedValue({ id: 5, email: 'x@y.com', status: 'bounced' })
    for (const body of [{ email: 'otro@y.com' }, { status: 'subscribed' }]) {
      const res = await req('patch', `${BASE}/contacts/5`, { agent: true }).send(body)
      expect(res.status).toBe(403)
    }
    expect(prisma.mailingContact.update).not.toHaveBeenCalled()
  })

  it('un agente sí corrige el nombre', async () => {
    prisma.mailingContact.findFirst.mockResolvedValue({ id: 5, email: 'x@y.com', status: 'subscribed' })
    prisma.mailingContact.update.mockResolvedValue({ id: 5, email: 'x@y.com', firstName: 'Ana', memberships: [] })
    const res = await req('patch', `${BASE}/contacts/5`, { agent: true }).send({ firstName: 'Ana' })
    expect(res.status).toBe(200)
  })

  it('segmentar sí; borrar contactos no', async () => {
    prisma.mailingContact.findMany.mockResolvedValue([{ id: 5 }])
    const add = await req('post', `${BASE}/contacts/bulk`, { agent: true }).send({ action: 'add-to-list', listId: 3, contactIds: [5] })
    expect(add.status).toBe(200)
    const del = await req('post', `${BASE}/contacts/bulk`, { agent: true }).send({ action: 'delete', contactIds: [5] })
    expect(del.status).toBe(403)
    const one = await req('delete', `${BASE}/contacts/5`, { agent: true })
    expect(one.status).toBe(403)
    expect(prisma.mailingContact.deleteMany).not.toHaveBeenCalled()
  })
})

describe('campañas e imágenes', () => {
  it('un agente borra un borrador pero no una campaña lanzada', async () => {
    prisma.mailingCampaign.findFirst.mockResolvedValueOnce({ id: 9, projectId: 7, status: 'sent' })
    const sent = await req('delete', `${BASE}/campaigns/9`, { agent: true })
    expect(sent.status).toBe(403)
    expect(prisma.mailingCampaign.delete).not.toHaveBeenCalled()

    prisma.mailingCampaign.findFirst.mockResolvedValueOnce({ id: 9, projectId: 7, status: 'draft' })
    const draft = await req('delete', `${BASE}/campaigns/9`, { agent: true })
    expect(draft.status).toBe(200)
  })

  it('sube una imagen por base64 y devuelve su URL pública; un texto no pasa', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]).toString('base64')
    const ok = await req('post', `${BASE}/images/direct`, { agent: true }).send({ name: 'banner.png', contentBase64: png })
    expect(ok.status).toBe(201)
    expect(ok.body.url).toBe('https://cdn.test/mailing/1/x.png')

    const bad = await req('post', `${BASE}/images/direct`, { agent: true }).send({ name: 'x.svg', contentBase64: Buffer.from('<svg/>').toString('base64') })
    expect(bad.status).toBe(400)
    expect(storage.putObject).toHaveBeenCalledTimes(1)
  })
})
