jest.mock('../../src/lib/prisma', () => ({
  workspace: {
    findUnique: jest.fn(),
  },
  workspaceMember: {
    findUnique: jest.fn(),
  },
  project: {
    findFirst:  jest.fn(),
    findUnique: jest.fn(),
  },
  projectMember: {
    findUnique: jest.fn(),
  },
  projectClientPortal: {
    findUnique: jest.fn(),
    upsert:     jest.fn(),
    update:     jest.fn(),
    deleteMany: jest.fn(),
  },
  clientPortalLoginCode: {
    count:      jest.fn(),
    create:     jest.fn(),
    findFirst:  jest.fn(),
    update:     jest.fn(),
  },
  monthlyReport: {
    findMany: jest.fn(),
  },
  projectBrief: {
    findMany: jest.fn(),
  },
}))

jest.mock('../../src/services/monthlyReport.service', () => ({
  aggregateReportData: jest.fn(),
}))

jest.mock('../../src/services/email.service', () => ({
  sendClientLoginCodeEmail: jest.fn().mockResolvedValue(undefined),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const { aggregateReportData } = require('../../src/services/monthlyReport.service')
const { sendClientLoginCodeEmail } = require('../../src/services/email.service')
const app = require('../../src/app')

const SECRET = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const PROJECT_ID     = 10
const PORTAL_ID      = 5

function authHeader(userId = 1, role = 'admin') {
  const token = jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )
  return `Bearer ${token}`
}

function mockWorkspace(role = 'admin') {
  prisma.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss' })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role, active: true })
}

function makePortal(overrides = {}) {
  return {
    id: PORTAL_ID,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    slug: 'kahuak',
    clientEmail: 'cliente@example.com',
    clientName: 'Cliente Demo',
    active: true,
    liveSections: '["instagram","analytics"]',
    liveDataCache: null,
    liveDataCachedAt: null,
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('Portal de cliente — endpoints admin', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockWorkspace()
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
  })

  it('GET /api/projects/:id/client-portal devuelve null si no hay portal', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}/client-portal`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.portal).toBeNull()
  })

  it('PUT crea el portal y devuelve publicUrl', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(null) // chequeo de slug disponible
    prisma.projectClientPortal.upsert.mockResolvedValue(makePortal())

    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/client-portal`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ slug: 'kahuak', clientEmail: 'cliente@example.com', clientName: 'Cliente Demo', active: true, liveSections: ['instagram', 'analytics', 'not-a-real-key'] })

    expect(res.status).toBe(200)
    expect(res.body.portal.slug).toBe('kahuak')
    expect(res.body.portal.publicUrl).toContain('/report/kahuak')
    // sanitizeSections descarta claves inválidas
    expect(prisma.projectClientPortal.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ liveSections: JSON.stringify(['instagram', 'analytics']) }),
    }))
  })

  it('PUT devuelve 409 si el slug ya está tomado por otro proyecto', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ projectId: PROJECT_ID + 1 }))

    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/client-portal`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ slug: 'kahuak', clientEmail: 'cliente@example.com', active: true, liveSections: [] })

    expect(res.status).toBe(409)
  })

  it('PUT rechaza un slug con formato inválido', async () => {
    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/client-portal`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ slug: 'AB', clientEmail: 'cliente@example.com', active: true, liveSections: [] })

    expect(res.status).toBe(400)
  })

  it('PUT devuelve 403 si el usuario no es admin ni miembro del proyecto', async () => {
    mockWorkspace('member')
    prisma.projectMember.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/client-portal`)
      .set('Authorization', authHeader(1, 'member'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ slug: 'kahuak', clientEmail: 'cliente@example.com', active: true, liveSections: [] })

    expect(res.status).toBe(403)
  })

  it('DELETE elimina el portal', async () => {
    prisma.projectClientPortal.deleteMany.mockResolvedValue({ count: 1 })
    const res = await request(app)
      .delete(`/api/projects/${PROJECT_ID}/client-portal`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})

describe('Portal de cliente — público (sin auth)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('GET /api/public/client-portal/:slug 404 si no existe', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/public/client-portal/no-existe')
    expect(res.status).toBe(404)
  })

  it('GET /api/public/client-portal/:slug devuelve reports y briefs', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.project.findUnique.mockResolvedValue({ id: PROJECT_ID, name: 'Proyecto Demo' })
    prisma.workspace.findUnique.mockResolvedValue({
      slug: WORKSPACE_SLUG, name: 'Bliss', companyName: null, companyDescription: null,
      industry: null, companyWebsite: null, logoData: null, brandColors: '[]', brandFonts: '[]',
    })
    prisma.monthlyReport.findMany.mockResolvedValue([{ token: 'abc-123', month: '2026-06' }])
    prisma.projectBrief.findMany.mockResolvedValue([{ type: 'marca', answers: { nombre_marca: 'Demo' }, updatedAt: new Date() }])

    const res = await request(app).get('/api/public/client-portal/kahuak')

    expect(res.status).toBe(200)
    expect(res.body.reports).toEqual([{ token: 'abc-123', month: '2026-06' }])
    expect(res.body.briefs[0].type).toBe('marca')
    expect(res.body.hasLiveSections).toBe(true)
  })

  it('request-code no crea código si el email no coincide (pero responde ok genérico)', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/request-code')
      .send({ email: 'otro@distinto.com' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(prisma.clientPortalLoginCode.create).not.toHaveBeenCalled()
    expect(sendClientLoginCodeEmail).not.toHaveBeenCalled()
  })

  it('request-code crea y envía el código si el email coincide', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalLoginCode.count.mockResolvedValue(0)
    prisma.project.findUnique.mockResolvedValue({ name: 'Proyecto Demo' })

    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/request-code')
      .send({ email: 'cliente@example.com' })

    expect(res.status).toBe(200)
    expect(prisma.clientPortalLoginCode.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ portalId: PORTAL_ID, email: 'cliente@example.com' }),
    }))
    expect(sendClientLoginCodeEmail).toHaveBeenCalled()
  })

  it('request-code respeta el rate limit (429 tras 5 en la última hora)', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalLoginCode.count.mockResolvedValue(5)

    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/request-code')
      .send({ email: 'cliente@example.com' })

    expect(res.status).toBe(429)
  })

  it('verify-code devuelve 401 con código inválido', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalLoginCode.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/verify-code')
      .send({ email: 'cliente@example.com', code: '000000' })

    expect(res.status).toBe(401)
  })

  it('verify-code devuelve un token válido con el código correcto', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalLoginCode.findFirst.mockResolvedValue({ id: 1, code: '123456' })
    prisma.clientPortalLoginCode.update.mockResolvedValue({})

    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/verify-code')
      .send({ email: 'cliente@example.com', code: '123456' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    const decoded = jwt.verify(res.body.token, SECRET)
    expect(decoded.purpose).toBe('client-portal-live')
    expect(decoded.portalId).toBe(PORTAL_ID)
  })
})

describe('Portal de cliente — datos en vivo (requiere token)', () => {
  function liveToken() {
    return jwt.sign({ portalId: PORTAL_ID, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, purpose: 'client-portal-live' }, SECRET, { expiresIn: '30d' })
  }

  beforeEach(() => jest.clearAllMocks())

  it('GET /live devuelve 401 sin token', async () => {
    const res = await request(app).get('/api/public/client-portal/kahuak/live')
    expect(res.status).toBe(401)
  })

  it('el token de portal NO sirve para rutas de staff (defense in depth)', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${liveToken()}`)
      .set('X-Workspace', WORKSPACE_SLUG)
    expect(res.status).toBe(401)
  })

  it('GET /live calcula y cachea la primera vez (sin llamar a Claude — cachedAnalysis dummy)', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ liveDataCachedAt: null }))
    aggregateReportData.mockResolvedValue({
      project: { id: PROJECT_ID, name: 'Demo' }, month: '2026-07', dataMonth: '2026-07',
      sections: { instagram: { followersCount: 100 } }, objectives: [], period: { label: 'Julio 2026' },
      _analysisIsNew: false, _dataCacheIsNew: false,
    })
    prisma.projectClientPortal.update.mockResolvedValue(makePortal({ liveDataCachedAt: new Date() }))

    const res = await request(app)
      .get('/api/public/client-portal/kahuak/live')
      .set('Authorization', `Bearer ${liveToken()}`)

    expect(res.status).toBe(200)
    expect(aggregateReportData).toHaveBeenCalledWith(
      PROJECT_ID, WORKSPACE_ID, expect.any(String),
      expect.objectContaining({ resumen: '—' }), {}, null, ['instagram', 'analytics'],
      expect.objectContaining({ periodStart: expect.any(Date), periodEnd: expect.any(Date) }),
    )
    expect(res.body.data.sections.instagram.followersCount).toBe(100)
  })

  it('POST /live/refresh devuelve 429 si todavía no pasó el cooldown', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ liveDataCachedAt: new Date() }))

    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/refresh')
      .set('Authorization', `Bearer ${liveToken()}`)

    expect(res.status).toBe(429)
    expect(aggregateReportData).not.toHaveBeenCalled()
  })

  it('POST /live/refresh recalcula si ya pasó el cooldown', async () => {
    const old = new Date(Date.now() - 20 * 60 * 1000) // 20 min atrás > cooldown de 15
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ liveDataCachedAt: old }))
    aggregateReportData.mockResolvedValue({ sections: {}, objectives: [], period: {}, project: {} })
    prisma.projectClientPortal.update.mockResolvedValue(makePortal({ liveDataCachedAt: new Date() }))

    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/refresh')
      .set('Authorization', `Bearer ${liveToken()}`)

    expect(res.status).toBe(200)
    expect(aggregateReportData).toHaveBeenCalled()
  })
})
