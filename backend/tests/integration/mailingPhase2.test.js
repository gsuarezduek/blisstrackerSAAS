// Mailing fase 2: formulario público de suscripción con doble opt-in (CORS
// abierto solo para ese path), confirmación, webhook de SES vía SNS (tópico fijado
// al primero que se confirma) e importación desde Ventas (requiere acceso a Ventas).
jest.mock('../../src/lib/prisma', () => ({
  workspace:         { findUnique: jest.fn() },
  workspaceMember:   { findUnique: jest.fn() },
  projectMember:     { findUnique: jest.fn() },
  project:           { findFirst: jest.fn(), findUnique: jest.fn() },
  featureFlag:       { findUnique: jest.fn() },
  mailingConfig:     { findUnique: jest.fn(), update: jest.fn() },
  mailingList:       { findUnique: jest.fn(), findFirst: jest.fn() },
  mailingListMember: { createMany: jest.fn() },
  mailingContact:    { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  mailingSend:       { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  mailingCampaign:   { update: jest.fn() },
}))
jest.mock('../../src/services/mailing/providers', () => {
  const provider = { sendBatch: jest.fn(), PER_TICK: 100 }
  return { getProvider: () => provider, PROVIDER_KEYS: ['resend', 'smtp', 'ses'], __provider: provider }
})
jest.mock('../../src/lib/snsVerify', () => ({
  verifySnsMessage: jest.fn().mockResolvedValue(true),
  isSnsUrl: jest.fn(u => /^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com\//.test(u)),
}))
jest.mock('axios', () => ({ get: jest.fn().mockResolvedValue({ status: 200 }) }))

const request = require('supertest')
const jwt = require('jsonwebtoken')
const axios = require('axios')
const prisma = require('../../src/lib/prisma')
const { encrypt } = require('../../src/lib/encryption')
const { __provider: provider } = require('../../src/services/mailing/providers')
const app = require('../../src/app')

const FORM = 'formtoken-abcdefghijklmnop'
const list = (over = {}) => ({ id: 3, name: 'Newsletter', projectId: 7, workspaceId: 1, doubleOptIn: true, formSuccessUrl: null, ...over })
const activeConfig = {
  id: 1, projectId: 7, provider: 'resend', status: 'active', fromEmail: 'hola@cliente.com', fromName: 'Cliente',
  credentials: encrypt(JSON.stringify({ apiKey: 're_test_123456789' })),
}

describe('formulario público de suscripción', () => {
  beforeEach(() => {
    prisma.mailingConfig.findUnique.mockResolvedValue(activeConfig)
    prisma.mailingListMember.createMany.mockResolvedValue({ count: 1 })
    provider.sendBatch.mockResolvedValue([{ ok: true, messageId: 'x' }])
  })

  it('acepta el POST de un form HTML desde la web del cliente y redirige a "revisá tu mail"', async () => {
    prisma.mailingList.findUnique.mockResolvedValue(list())
    prisma.mailingContact.findUnique.mockResolvedValue(null)
    prisma.mailingContact.create.mockImplementation(({ data }) => Promise.resolve({ id: 10, ...data }))
    prisma.mailingContact.update.mockImplementation(({ data }) => Promise.resolve({ id: 10, email: 'ana@x.com', ...data }))

    const res = await request(app).post(`/api/public/mailing/subscribe/${FORM}`)
      .set('Origin', 'https://cliente.com').type('form').send('email=Ana@X.com&nombre=Ana')

    expect(res.status).toBe(303)
    expect(res.headers.location).toMatch(/\/suscripcion\?estado=revisa-tu-mail$/)
    expect(res.headers['access-control-allow-origin']).toBe('https://cliente.com')
    expect(prisma.mailingContact.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: 'ana@x.com', firstName: 'Ana', status: 'pending', source: 'form' }) })
    expect(prisma.mailingContact.create.mock.calls[0][0].data.consentAt).toBeUndefined() // consentimiento recién al confirmar
    const msg = provider.sendBatch.mock.calls[0][1][0]
    expect(msg.to).toBe('ana@x.com')
    expect(msg.html).toMatch(/\/confirmar-suscripcion\//)
  })

  it('el preflight de CORS pasa desde cualquier origen solo en el endpoint de suscripción', async () => {
    const ok = await request(app).options(`/api/public/mailing/subscribe/${FORM}`)
      .set('Origin', 'https://cliente.com').set('Access-Control-Request-Method', 'POST')
    expect(ok.status).toBe(204)
    expect(ok.headers['access-control-allow-origin']).toBe('https://cliente.com')
    const other = await request(app).options('/api/public/mailing/u/algo').set('Origin', 'https://cliente.com').set('Access-Control-Request-Method', 'POST')
    expect(other.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('quien se dio de baja tiene que confirmar aunque la base no pida doble opt-in', async () => {
    prisma.mailingList.findUnique.mockResolvedValue(list({ doubleOptIn: false }))
    prisma.mailingContact.findUnique.mockResolvedValue({ id: 10, email: 'ana@x.com', status: 'unsubscribed', firstName: 'Ana', confirmSentAt: null })
    prisma.mailingContact.update.mockImplementation(({ data }) => Promise.resolve({ id: 10, email: 'ana@x.com', status: 'unsubscribed', ...data }))
    const res = await request(app).post(`/api/public/mailing/subscribe/${FORM}`).send({ email: 'ana@x.com' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, status: 'pending' })
    // Solo se le genera el token de confirmación: el estado NO cambia acá.
    const upd = prisma.mailingContact.update.mock.calls.at(-1)[0].data
    expect(upd.status).toBeUndefined()
    expect(upd.confirmToken).toEqual(expect.any(String))
    expect(provider.sendBatch).toHaveBeenCalled()
  })

  it('sin doble opt-in un contacto nuevo queda suscripto con su consentimiento', async () => {
    prisma.mailingList.findUnique.mockResolvedValue(list({ doubleOptIn: false }))
    prisma.mailingContact.findUnique.mockResolvedValue(null)
    prisma.mailingContact.create.mockImplementation(({ data }) => Promise.resolve({ id: 11, ...data }))
    const res = await request(app).post(`/api/public/mailing/subscribe/${FORM}`).send({ email: 'beto@x.com' })
    expect(res.body).toEqual({ ok: true, status: 'subscribed' })
    expect(prisma.mailingContact.create.mock.calls[0][0].data).toMatchObject({ status: 'subscribed', consentSource: 'form' })
    expect(provider.sendBatch).not.toHaveBeenCalled()
  })

  it('el honeypot finge éxito sin crear nada', async () => {
    prisma.mailingList.findUnique.mockResolvedValue(list())
    const res = await request(app).post(`/api/public/mailing/subscribe/${FORM}`).send({ email: 'bot@x.com', website: 'http://spam' })
    expect(res.body).toEqual({ ok: true, status: 'pending' })
    expect(prisma.mailingContact.create).not.toHaveBeenCalled()
  })

  it('no reenvía la confirmación más de una vez cada 10 minutos', async () => {
    prisma.mailingList.findUnique.mockResolvedValue(list())
    prisma.mailingContact.findUnique.mockResolvedValue({ id: 10, email: 'ana@x.com', status: 'pending', firstName: 'Ana', confirmSentAt: new Date(Date.now() - 60000) })
    const res = await request(app).post(`/api/public/mailing/subscribe/${FORM}`).send({ email: 'ana@x.com' })
    expect(res.body.status).toBe('pending')
    expect(provider.sendBatch).not.toHaveBeenCalled()
  })

  it('confirmar pasa el contacto a suscripto', async () => {
    prisma.mailingContact.findUnique.mockResolvedValue({ id: 10, email: 'ana@x.com', status: 'pending', confirmSentAt: new Date(), projectId: 7 })
    prisma.mailingContact.update.mockResolvedValue({})
    const res = await request(app).post('/api/public/mailing/confirm/confirm-token-abcdefgh')
    expect(res.status).toBe(200)
    expect(prisma.mailingContact.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({ status: 'subscribed', consentSource: 'form_double_optin', confirmToken: null }),
    })
  })

  it('un link de confirmación vencido no confirma', async () => {
    prisma.mailingContact.findUnique.mockResolvedValue({ id: 10, email: 'ana@x.com', status: 'pending', confirmSentAt: new Date(Date.now() - 8 * 86400000), projectId: 7 })
    const res = await request(app).post('/api/public/mailing/confirm/confirm-token-abcdefgh')
    expect(res.status).toBe(410)
    expect(prisma.mailingContact.update).not.toHaveBeenCalled()
  })
})

describe('webhook de SES (SNS)', () => {
  const URL = '/api/mailing/webhook/ses/tok'
  const send = body => request(app).post(URL).set('Content-Type', 'text/plain; charset=UTF-8').send(JSON.stringify(body))

  it('confirma la suscripción del tópico y lo fija', async () => {
    prisma.mailingConfig.findUnique.mockResolvedValue({ id: 1, projectId: 7, provider: 'ses', webhookId: null })
    const res = await send({ Type: 'SubscriptionConfirmation', TopicArn: 'arn:aws:sns:us-east-1:123:mail', SubscribeURL: 'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=x' })
    expect(res.status).toBe(200)
    expect(axios.get).toHaveBeenCalledWith('https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=x', expect.any(Object))
    expect(prisma.mailingConfig.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { webhookId: 'arn:aws:sns:us-east-1:123:mail' } })
  })

  it('rechaza un tópico distinto del confirmado', async () => {
    prisma.mailingConfig.findUnique.mockResolvedValue({ id: 1, projectId: 7, provider: 'ses', webhookId: 'arn:aws:sns:us-east-1:123:mail' })
    const res = await send({ Type: 'Notification', TopicArn: 'arn:aws:sns:us-east-1:999:otro', Message: '{}' })
    expect(res.status).toBe(403)
  })

  it('una queja suprime al contacto', async () => {
    prisma.mailingConfig.findUnique.mockResolvedValue({ id: 1, projectId: 7, provider: 'ses', webhookId: 'arn:t' })
    prisma.mailingSend.findFirst.mockResolvedValue({ id: 3, campaignId: 9, contactId: 5 })
    prisma.mailingSend.updateMany.mockResolvedValue({ count: 1 })
    prisma.mailingContact.updateMany.mockResolvedValue({ count: 1 })
    const res = await send({ Type: 'Notification', TopicArn: 'arn:t', Message: JSON.stringify({ eventType: 'Complaint', mail: { messageId: 'ses-1' } }) })
    expect(res.status).toBe(200)
    expect(prisma.mailingSend.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 7, providerMessageId: 'ses-1' } }))
    expect(prisma.mailingContact.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'complained' }) }))
  })
})

describe('importar desde Ventas', () => {
  it('sin acceso a Ventas responde 403', async () => {
    const token = jwt.sign({ userId: 1, workspaceId: 1, role: 'admin', isSuperAdmin: false, name: 'A', email: 'a@t.com' }, process.env.JWT_SECRET)
    prisma.workspace.findUnique.mockResolvedValue({ id: 1, slug: 'bliss', status: 'active', name: 'B', disabledFeatureKeys: '[]', members: [{ workspaceId: 1, userId: 1, role: 'admin', active: true }] })
    prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: 1, userId: 1, role: 'admin', active: true })
    prisma.featureFlag.findUnique.mockImplementation(({ where }) => Promise.resolve(
      where.key === 'ventas' ? { key: 'ventas', enabledGlobally: false, enabledWorkspaceIds: '[]' } : { key: where.key, enabledGlobally: true, enabledWorkspaceIds: '[]' },
    ))
    prisma.project.findFirst.mockResolvedValue({ id: 7 })
    prisma.project.findUnique.mockResolvedValue({ isPrivate: false, marketingEnabled: true, contenidoEnabled: true })
    const res = await request(app).post('/api/marketing/projects/7/mailing/crm/import')
      .set('Authorization', `Bearer ${token}`).set('X-Workspace', 'bliss').send({ listId: 3, filter: {}, dryRun: true })
    expect(res.status).toBe(403)
  })
})
