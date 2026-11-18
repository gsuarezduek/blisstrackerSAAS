// Mailing (Marketing → Mailing): los gates de la sección, que las credenciales del
// cliente nunca vuelvan en una respuesta, los endpoints públicos (clic, baja
// one-click) y el webhook firmado de Resend que suprime contactos.
jest.mock('../../src/lib/prisma', () => ({
  workspace:          { findUnique: jest.fn() },
  workspaceMember:    { findUnique: jest.fn() },
  projectMember:      { findUnique: jest.fn() },
  project:            { findFirst: jest.fn(), findUnique: jest.fn() },
  featureFlag:        { findUnique: jest.fn() },
  mailingConfig:      { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  mailingContact:     { findUnique: jest.fn(), findMany: jest.fn(), createMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  mailingList:        { findMany: jest.fn() },
  mailingListMember:  { createMany: jest.fn() },
  mailingSend:        { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  mailingLink:        { findUnique: jest.fn(), update: jest.fn() },
  mailingClick:       { createMany: jest.fn() },
  mailingCampaign:    { update: jest.fn() },
  $transaction:       jest.fn(ops => Promise.all(ops)),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const { Webhook } = require('svix')
const prisma  = require('../../src/lib/prisma')
const { decrypt, encrypt } = require('../../src/lib/encryption')
const app     = require('../../src/app')

const SECRET = process.env.JWT_SECRET
const WS = { id: 1, slug: 'bliss' }
const PROJECT_ID = 7
const BASE = `/api/marketing/projects/${PROJECT_ID}/mailing`

function req(method, url) {
  const token = jwt.sign({ userId: 1, workspaceId: WS.id, role: 'member', isSuperAdmin: false, name: 'Ana', email: 'a@t.com' }, SECRET)
  return request(app)[method](url).set('Authorization', `Bearer ${token}`).set('X-Workspace', WS.slug)
}

function mockBase({ role = 'admin', mailingFlag = true, marketingEnabled = true, teamMember = true } = {}) {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WS.id, slug: WS.slug, status: 'active', name: 'Bliss', disabledFeatureKeys: '[]',
    members: [{ workspaceId: WS.id, userId: 1, role, active: true }],
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WS.id, userId: 1, role, active: true })
  prisma.featureFlag.findUnique.mockImplementation(({ where }) => Promise.resolve(
    where.key === 'mailing' && !mailingFlag
      ? { key: 'mailing', enabledGlobally: false, enabledWorkspaceIds: '[]' }
      : { key: where.key, enabledGlobally: true, enabledWorkspaceIds: '[]' },
  ))
  prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
  prisma.project.findUnique.mockResolvedValue({ isPrivate: false, marketingEnabled, contenidoEnabled: true })
  prisma.projectMember.findUnique.mockResolvedValue(teamMember ? { projectId: PROJECT_ID, userId: 1 } : null)
}

describe('gates de Mailing', () => {
  it('sin el flag `mailing` el workspace no tiene la sección (403 FEATURE_NOT_ENABLED)', async () => {
    mockBase({ mailingFlag: false })
    const res = await req('get', `${BASE}/config`)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FEATURE_NOT_ENABLED')
  })

  it('un proyecto con Marketing apagado no existe para Mailing (404)', async () => {
    mockBase({ marketingEnabled: false })
    const res = await req('get', `${BASE}/config`)
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('PROJECT_MODULE_DISABLED')
  })

  it('escribir pide admin/owner o equipo del proyecto', async () => {
    mockBase({ role: 'member', teamMember: false })
    const res = await req('put', `${BASE}/config`).send({ fromName: 'X' })
    expect(res.status).toBe(403)
    expect(prisma.mailingConfig.update).not.toHaveBeenCalled()
    expect(prisma.mailingConfig.create).not.toHaveBeenCalled()
  })
})

describe('configuración — las credenciales del cliente nunca salen', () => {
  it('guarda la API key cifrada y la respuesta solo muestra una pista', async () => {
    mockBase()
    prisma.mailingConfig.findUnique.mockResolvedValue(null)
    prisma.mailingConfig.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, webhookToken: 'tok', status: 'unverified', ...data }))
    const res = await req('put', `${BASE}/config`).send({
      provider: 'resend', credentials: { apiKey: 're_abcdefgh12345678' }, fromEmail: 'Novedades@Cliente.com', dailyLimit: 200,
    })
    expect(res.status).toBe(200)
    const saved = prisma.mailingConfig.create.mock.calls[0][0].data
    expect(saved.credentials).not.toContain('re_abcdefgh')
    expect(JSON.parse(decrypt(saved.credentials))).toEqual({ apiKey: 're_abcdefgh12345678' })
    expect(saved.fromEmail).toBe('novedades@cliente.com')
    expect(JSON.stringify(res.body)).not.toContain('re_abcdefgh12345678')
    expect(res.body.credentials).toBeUndefined()
    expect(res.body.webhookSecret).toBeUndefined()
    expect(res.body).toMatchObject({ configured: true, credentialsHint: 're_…5678', status: 'unverified' })
  })

  it('rechaza un SMTP que apunta a la red interna', async () => {
    mockBase()
    prisma.mailingConfig.findUnique.mockResolvedValue(null)
    const res = await req('put', `${BASE}/config`).send({ provider: 'smtp', credentials: { host: '127.0.0.1', port: 587, user: 'x', pass: 'y' } })
    expect(res.status).toBe(400)
    expect(prisma.mailingConfig.create).not.toHaveBeenCalled()
  })
})

describe('importación de contactos', () => {
  it('pide la declaración de consentimiento', async () => {
    mockBase()
    const res = await req('post', `${BASE}/contacts/import`).send({ rows: [{ email: 'a@b.com' }], dryRun: false })
    expect(res.status).toBe(400)
  })

  it('no vuelve a suscribir a quien ya se dio de baja y lo informa', async () => {
    mockBase()
    prisma.mailingList.findMany.mockResolvedValue([])
    prisma.mailingContact.findMany.mockResolvedValue([
      { id: 5, email: 'baja@x.com', firstName: null, lastName: null, fields: {}, status: 'unsubscribed' },
    ])
    prisma.mailingContact.createMany.mockResolvedValue({ count: 1 })
    prisma.mailingContact.update.mockResolvedValue({})
    const res = await req('post', `${BASE}/contacts/import`).send({
      rows: [{ email: 'BAJA@x.com', firstName: 'Ana' }, { email: 'nuevo@x.com' }, { email: 'no-es-mail' }, { email: 'nuevo@x.com' }],
      consent: true,
    })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ new: 1, existing: 1, suppressed: 1, invalidCount: 1, duplicatesInFile: 1, created: 1 })
    const created = prisma.mailingContact.createMany.mock.calls[0][0].data
    expect(created.map(c => c.email)).toEqual(['nuevo@x.com'])
    expect(created[0]).toMatchObject({ source: 'csv', consentSource: 'csv' })
    // Al existente solo se le completa el nombre: nunca se toca su estado.
    const upd = prisma.mailingContact.update.mock.calls[0][0]
    expect(upd.data).toEqual({ firstName: 'Ana' })
  })
})

describe('endpoints públicos', () => {
  const TOKEN = 'abcdefghijklmnopqrstuvwx'

  it('el clic redirige a la URL guardada de la campaña, no a una del request', async () => {
    prisma.mailingSend.findUnique.mockResolvedValue({ id: 3, campaignId: 9, contactId: 5, projectId: PROJECT_ID, status: 'sent' })
    prisma.mailingLink.findUnique.mockResolvedValue({ id: 11, url: 'https://cliente.com/oferta' })
    prisma.mailingClick.createMany.mockResolvedValue({ count: 1 })
    prisma.mailingSend.updateMany.mockResolvedValue({ count: 1 })
    const res = await request(app).get(`/api/public/mailing/c/${TOKEN}/0?url=https://evil.com`)
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('https://cliente.com/oferta')
    expect(prisma.mailingLink.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { campaignId_idx: { campaignId: 9, idx: 0 } } }))
  })

  it('un índice que no existe da 404', async () => {
    prisma.mailingSend.findUnique.mockResolvedValue({ id: 3, campaignId: 9, contactId: 5, projectId: PROJECT_ID })
    prisma.mailingLink.findUnique.mockResolvedValue(null)
    const res = await request(app).get(`/api/public/mailing/c/${TOKEN}/99`)
    expect(res.status).toBe(404)
  })

  it('el pixel siempre responde un GIF, aunque el token no exista', async () => {
    prisma.mailingSend.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/public/mailing/o/inexistente-token-xx.gif')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/gif')
  })

  it('el one-click de Gmail (form-urlencoded) da de baja', async () => {
    prisma.mailingSend.findUnique.mockResolvedValue({ id: 3, campaignId: 9, contactId: 5, projectId: PROJECT_ID })
    prisma.mailingContact.updateMany.mockResolvedValue({ count: 1 })
    prisma.mailingSend.updateMany.mockResolvedValue({ count: 1 })
    const res = await request(app).post(`/api/public/mailing/u/${TOKEN}`)
      .type('form').send('List-Unsubscribe=One-Click')
    expect(res.status).toBe(200)
    expect(prisma.mailingContact.updateMany).toHaveBeenCalledWith({
      where: { id: 5, status: { notIn: ['unsubscribed', 'bounced', 'complained'] } },
      data: expect.objectContaining({ status: 'unsubscribed' }),
    })
    expect(prisma.mailingCampaign.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { unsubscribeCount: { increment: 1 } } })
  })
})

describe('webhook de Resend', () => {
  const SIGNING = 'whsec_' + Buffer.from('a'.repeat(32)).toString('base64')

  function signed(payload) {
    const id = 'msg_1'
    const ts = new Date()
    const sig = new Webhook(SIGNING).sign(id, ts, payload)
    return { 'svix-id': id, 'svix-timestamp': String(Math.floor(ts.getTime() / 1000)), 'svix-signature': sig }
  }

  beforeEach(() => {
    prisma.mailingConfig.findUnique.mockResolvedValue({ projectId: PROJECT_ID, provider: 'resend', webhookSecret: encrypt(SIGNING) })
  })

  it('rechaza una firma inválida', async () => {
    const res = await request(app).post('/api/mailing/webhook/resend/tok')
      .set('Content-Type', 'application/json')
      .set({ 'svix-id': 'x', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,AAAA' })
      .send(JSON.stringify({ type: 'email.bounced', data: { email_id: 'em_1' } }))
    expect(res.status).toBe(401)
    expect(prisma.mailingSend.findFirst).not.toHaveBeenCalled()
  })

  it('un rebote duro suprime al contacto y suma a la campaña', async () => {
    prisma.mailingSend.findFirst.mockResolvedValue({ id: 3, campaignId: 9, contactId: 5 })
    prisma.mailingSend.updateMany.mockResolvedValue({ count: 1 })
    prisma.mailingContact.updateMany.mockResolvedValue({ count: 1 })
    const payload = JSON.stringify({ type: 'email.bounced', data: { email_id: 'em_1', bounce: { type: 'Permanent' } } })
    const res = await request(app).post('/api/mailing/webhook/resend/tok')
      .set('Content-Type', 'application/json').set(signed(payload)).send(payload)
    expect(res.status).toBe(200)
    expect(prisma.mailingSend.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: PROJECT_ID, providerMessageId: 'em_1' } }))
    expect(prisma.mailingContact.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'bounced' }) }))
    expect(prisma.mailingCampaign.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { bounceCount: { increment: 1 } } })
  })

  it('un rebote temporal (casilla llena) no suprime', async () => {
    prisma.mailingSend.findFirst.mockResolvedValue({ id: 3, campaignId: 9, contactId: 5 })
    const payload = JSON.stringify({ type: 'email.bounced', data: { email_id: 'em_1', bounce: { type: 'Transient' } } })
    const res = await request(app).post('/api/mailing/webhook/resend/tok')
      .set('Content-Type', 'application/json').set(signed(payload)).send(payload)
    expect(res.status).toBe(200)
    expect(prisma.mailingContact.updateMany).not.toHaveBeenCalled()
  })
})
