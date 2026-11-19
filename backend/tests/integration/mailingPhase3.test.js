// Mailing fase 3: un agente (vía MCP) arma y prueba campañas pero NO las lanza,
// reanuda ni cancela; y el reenvío a quienes no abrieron solo sale de una campaña
// terminada.
jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  projectMember:   { findUnique: jest.fn() },
  project:         { findFirst: jest.fn(), findUnique: jest.fn() },
  featureFlag:     { findUnique: jest.fn() },
  mailingCampaign: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  mailingSend:     { count: jest.fn() },
}))

const request = require('supertest')
const jwt = require('jsonwebtoken')
const prisma = require('../../src/lib/prisma')
const app = require('../../src/app')

const BASE = '/api/marketing/projects/7/mailing/campaigns/9'

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
})

describe('lanzar es de una persona', () => {
  it.each(['launch', 'resume', 'cancel'])('%s vía MCP → 403 HUMAN_ONLY sin tocar la campaña', async action => {
    const res = await req('post', `${BASE}/${action}`, { agent: true }).send({})
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('HUMAN_ONLY')
    expect(prisma.mailingCampaign.findFirst).not.toHaveBeenCalled()
    expect(prisma.mailingCampaign.updateMany).not.toHaveBeenCalled()
  })

  it('pausar sí lo puede hacer un agente (frenar nunca manda nada)', async () => {
    prisma.mailingCampaign.findFirst.mockResolvedValue({ id: 9, projectId: 7, status: 'sending' })
    prisma.mailingCampaign.updateMany.mockResolvedValue({ count: 1 })
    const res = await req('post', `${BASE}/pause`, { agent: true })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('paused')
  })
})

describe('reenvío a quienes no abrieron', () => {
  it('solo de una campaña terminada', async () => {
    prisma.mailingCampaign.findFirst.mockResolvedValue({ id: 9, projectId: 7, status: 'sending' })
    const res = await req('post', `${BASE}/resend-non-openers`)
    expect(res.status).toBe(409)
    expect(prisma.mailingCampaign.create).not.toHaveBeenCalled()
  })

  it('arma un borrador que apunta a la original, con su contenido', async () => {
    prisma.mailingCampaign.findFirst.mockResolvedValue({ id: 9, projectId: 7, status: 'sent', name: 'Octubre', subject: 'Hola', preheader: null, blocks: [{ type: 'divider' }] })
    prisma.mailingSend.count.mockResolvedValue(420)
    prisma.mailingCampaign.create.mockImplementation(({ data }) => Promise.resolve({ id: 10, ...data }))
    const res = await req('post', `${BASE}/resend-non-openers`)
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ id: 10, resendOfId: 9, audience: 420 })
    expect(prisma.mailingCampaign.create.mock.calls[0][0].data).toMatchObject({ resendOfId: 9, subject: 'Hola', blocks: [{ type: 'divider' }] })
    // La audiencia: los que la recibieron, no abrieron ni hicieron clic, y siguen suscriptos.
    expect(prisma.mailingSend.count).toHaveBeenCalledWith({ where: {
      campaignId: 9, status: { in: ['sent', 'delivered'] }, firstOpenedAt: null, firstClickedAt: null, contact: { status: 'subscribed' },
    } })
  })
})
