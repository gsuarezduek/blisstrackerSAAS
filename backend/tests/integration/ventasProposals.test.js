jest.mock('../../src/lib/prisma', () => {
  const prisma = {
    workspace: { findUnique: jest.fn() },
    featureFlag: { findUnique: jest.fn() },
    lead: { findFirst: jest.fn() },
    service: { findMany: jest.fn() },
    proposal: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    leadActivity: { create: jest.fn() },
  }
  prisma.$transaction = jest.fn((arg) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)))
  return prisma
})

jest.mock('../../src/lib/tokenBudget', () => ({ assertTokenBudget: jest.fn().mockResolvedValue(undefined) }))
jest.mock('../../src/services/salesProposal.service', () => ({
  generateProposalHtml: jest.fn().mockResolvedValue({ html: '<p>Propuesta generada</p>', usage: { input_tokens: 10, output_tokens: 20 } }),
}))

const request = require('supertest')
const jwt = require('jsonwebtoken')
const prisma = require('../../src/lib/prisma')
const { generateProposalHtml } = require('../../src/services/salesProposal.service')
const app = require('../../src/app')

const SECRET = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID = 1

function makeToken(userId = 1, role = 'admin') {
  return `Bearer ${jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test User', email: 'test@bliss.ar' },
    SECRET,
  )}`
}

function mockWorkspace(role = 'admin') {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss Marketing', companyName: 'Bliss',
    timezone: 'America/Argentina/Buenos_Aires', moduleAccess: {}, disabledFeatureKeys: '[]',
    logoData: null, brandColors: '[]', salesSignatures: [],
    members: [{ workspaceId: WORKSPACE_ID, userId: 1, role, teamRole: null, active: true }],
  })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'ventas', enabledGlobally: true, enabledWorkspaceIds: '[]' })
}

function req(method, url) {
  return request(app)[method](url).set('X-Workspace', WORKSPACE_SLUG).set('Authorization', makeToken())
}

describe('POST /api/ventas/leads/:id/proposals', () => {
  it('genera una propuesta con IA y la guarda como v1, con publicToken', async () => {
    mockWorkspace()
    prisma.lead.findFirst.mockResolvedValue({ id: 1, currency: 'ARS', title: 'Rediseño', company: { name: 'Acme', industry: null } })
    prisma.service.findMany.mockResolvedValue([{ id: 1, name: 'SEO', description: 'Posicionamiento' }])
    prisma.proposal.findFirst.mockResolvedValue(null) // sin versión previa
    prisma.proposal.create.mockResolvedValue({ id: 1, version: 1, status: 'draft', title: 'Propuesta v1' })

    const res = await req('post', '/api/ventas/leads/1/proposals').send({
      plans: [{ label: 'Básico', price: 1000, currency: 'ARS', serviceIds: [1] }],
      objectives: 'Más leads',
    })

    expect(res.status).toBe(201)
    expect(generateProposalHtml).toHaveBeenCalled()
    expect(prisma.proposal.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        workspaceId: WORKSPACE_ID, leadId: 1, version: 1, status: 'draft',
        publicToken: expect.any(String),
      }),
    }))
  })

  it('rechaza sin ningún plan', async () => {
    mockWorkspace()
    prisma.lead.findFirst.mockResolvedValue({ id: 1, currency: 'ARS', title: 'Rediseño', company: { name: 'Acme' } })
    const res = await req('post', '/api/ventas/leads/1/proposals').send({ plans: [] })
    expect(res.status).toBe(400)
    expect(generateProposalHtml).not.toHaveBeenCalled()
  })

  it('404 si el lead no existe en el workspace', async () => {
    mockWorkspace()
    prisma.lead.findFirst.mockResolvedValue(null)
    const res = await req('post', '/api/ventas/leads/999/proposals').send({ plans: [{ label: 'Básico' }] })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/ventas/leads/:id/proposals/:pid', () => {
  it('confirma una propuesta (status: confirmed)', async () => {
    mockWorkspace()
    prisma.proposal.findFirst.mockResolvedValue({ id: 1 })
    prisma.proposal.update.mockResolvedValue({ id: 1, status: 'confirmed' })

    const res = await req('patch', '/api/ventas/leads/1/proposals/1').send({ status: 'confirmed' })

    expect(res.status).toBe(200)
    expect(prisma.proposal.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 },
      data: expect.objectContaining({ status: 'confirmed' }),
    }))
  })

  it('rechaza un status inválido', async () => {
    mockWorkspace()
    prisma.proposal.findFirst.mockResolvedValue({ id: 1 })
    const res = await req('patch', '/api/ventas/leads/1/proposals/1').send({ status: 'archivada' })
    expect(res.status).toBe(400)
  })
})

// ── Link público (sin auth) ─────────────────────────────────────────────────
describe('GET /api/public/proposal/:token', () => {
  it('404 si el token no existe', async () => {
    prisma.proposal.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/public/proposal/no-existe')
    expect(res.status).toBe(404)
  })

  it('404 (borrador) si la propuesta todavía no está confirmada', async () => {
    prisma.proposal.findUnique.mockResolvedValue({
      title: 'Propuesta', content: '<p>x</p>', version: 1, signatureId: null, createdAt: new Date(), status: 'draft',
      workspaceId: WORKSPACE_ID, lead: { company: { name: 'Acme' } },
    })
    const res = await request(app).get('/api/public/proposal/abc123')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('PROPOSAL_DRAFT')
  })

  it('sirve una propuesta confirmada, sin exponer campos internos', async () => {
    prisma.proposal.findUnique.mockResolvedValue({
      title: 'Propuesta para Acme', content: '<p>Contenido</p>', version: 2, signatureId: null, createdAt: new Date(), status: 'confirmed',
      workspaceId: WORKSPACE_ID, lead: { company: { name: 'Acme' } },
    })
    prisma.workspace.findUnique.mockResolvedValue({
      slug: WORKSPACE_SLUG, name: 'Bliss Marketing', companyName: 'Bliss', logoData: null,
      brandColors: '[{"hex":"#F7931A"}]', salesSignatures: [{ id: 'sig1', name: 'Gastón', email: 'g@bliss.ar' }],
    })

    const res = await request(app).get('/api/public/proposal/abc123')

    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Propuesta para Acme')
    expect(res.body.companyName).toBe('Acme')
    expect(res.body.workspace.brandColors).toEqual([{ hex: '#F7931A' }])
    // La única firma configurada se usa de fallback cuando signatureId es null.
    expect(res.body.signature).toEqual({ id: 'sig1', name: 'Gastón', email: 'g@bliss.ar' })
    // Nunca expone campos internos.
    expect(res.body.leadId).toBeUndefined()
    expect(res.body.workspaceId).toBeUndefined()
    expect(res.body.objectives).toBeUndefined()
  })
})
