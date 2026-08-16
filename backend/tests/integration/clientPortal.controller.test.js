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
  clientPortalContact: {
    findUnique: jest.fn(),
    findFirst:  jest.fn(),
    findMany:   jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
    upsert:     jest.fn(),
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
  featureFlag: {
    findUnique: jest.fn(),
  },
  contentPiece: {
    count: jest.fn(),
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

// clientEmail/clientName quedan como columnas legacy nullable en la fila real,
// pero ya no son la fuente de verdad — los tests que importan multi-contacto
// usan `contacts` (ver makeContact).
function makePortal(overrides = {}) {
  return {
    id: PORTAL_ID,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    slug: 'kahuak',
    clientEmail: null,
    clientName: null,
    active: true,
    contentEnabled: false,
    liveSections: '["instagram","analytics"]',
    liveDataCache: null,
    liveDataCachedAt: null,
    updatedAt: new Date(),
    contacts: [],
    ...overrides,
  }
}

function makeContact(overrides = {}) {
  return {
    id: 1, workspaceId: WORKSPACE_ID, portalId: PORTAL_ID,
    email: 'cliente@example.com', name: 'Cliente Demo',
    canApprove: true, active: true, lastLoginAt: null,
    createdAt: new Date(), updatedAt: new Date(),
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

  it('GET devuelve el portal con sus contactos y sin exponer clientEmail', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ contacts: [makeContact()] }))

    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}/client-portal`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.portal.contactCount).toBe(1)
    expect(res.body.portal.contacts).toEqual([
      expect.objectContaining({ id: 1, email: 'cliente@example.com', canApprove: true, active: true }),
    ])
    expect(res.body.portal.clientEmail).toBeUndefined()
  })

  it('PUT crea el portal sin exigir clientEmail', async () => {
    prisma.projectClientPortal.findUnique
      .mockResolvedValueOnce(null)                 // chequeo de slug disponible
      .mockResolvedValueOnce(makePortal())          // reload final para la respuesta
    prisma.projectClientPortal.upsert.mockResolvedValue(makePortal())

    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/client-portal`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ slug: 'kahuak', active: true, contentEnabled: true, liveSections: ['instagram', 'analytics', 'not-a-real-key'] })

    expect(res.status).toBe(200)
    expect(res.body.portal.slug).toBe('kahuak')
    expect(res.body.portal.publicUrl).toContain('/report/kahuak')
    expect(res.body.portal.contentEnabled).toBe(false) // viene de lo que devuelve el mock del reload
    // sanitizeSections descarta claves inválidas
    expect(prisma.projectClientPortal.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ liveSections: JSON.stringify(['instagram', 'analytics']), contentEnabled: true }),
    }))
    expect(prisma.clientPortalContact.upsert).not.toHaveBeenCalled()
  })

  it('PUT con clientEmail (compat de un bundle viejo) upsertea ese contacto en vez de perderlo', async () => {
    prisma.projectClientPortal.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makePortal({ contacts: [makeContact()] }))
    prisma.projectClientPortal.upsert.mockResolvedValue(makePortal())
    prisma.clientPortalContact.upsert.mockResolvedValue(makeContact())

    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/client-portal`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ slug: 'kahuak', active: true, liveSections: [], clientEmail: 'Cliente@Example.com', clientName: 'Cliente Demo' })

    expect(res.status).toBe(200)
    expect(prisma.clientPortalContact.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where:  { portalId_email: { portalId: PORTAL_ID, email: 'cliente@example.com' } },
      create: expect.objectContaining({ email: 'cliente@example.com', name: 'Cliente Demo' }),
    }))
  })

  it('PUT devuelve 409 si el slug ya está tomado por otro proyecto', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ projectId: PROJECT_ID + 1 }))

    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/client-portal`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ slug: 'kahuak', active: true, liveSections: [] })

    expect(res.status).toBe(409)
  })

  it('PUT rechaza un slug con formato inválido', async () => {
    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/client-portal`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ slug: 'AB', active: true, liveSections: [] })

    expect(res.status).toBe(400)
  })

  it('PUT devuelve 403 si el usuario no es admin ni miembro del proyecto', async () => {
    mockWorkspace('member')
    prisma.projectMember.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/client-portal`)
      .set('Authorization', authHeader(1, 'member'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ slug: 'kahuak', active: true, liveSections: [] })

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

describe('Portal de cliente — contactos (ABM)', () => {
  const BASE = `/api/projects/${PROJECT_ID}/client-portal/contacts`

  beforeEach(() => {
    jest.clearAllMocks()
    mockWorkspace()
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
  })

  it('GET lista los contactos del portal', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findMany.mockResolvedValue([makeContact(), makeContact({ id: 2, email: 'otro@x.com' })])

    const res = await request(app).get(BASE).set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.contacts).toHaveLength(2)
  })

  it('GET 404 si el proyecto no tiene portal configurado', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(null)
    const res = await request(app).get(BASE).set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)
    expect(res.status).toBe(404)
  })

  it('POST agrega un contacto', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.create.mockResolvedValue(makeContact())

    const res = await request(app)
      .post(BASE)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ email: 'Cliente@Example.com', name: 'Cliente Demo' })

    expect(res.status).toBe(201)
    expect(prisma.clientPortalContact.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ portalId: PORTAL_ID, email: 'cliente@example.com', canApprove: true }),
    }))
  })

  it('POST 400 con email inválido', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    const res = await request(app)
      .post(BASE)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ email: 'no-es-un-email' })
    expect(res.status).toBe(400)
    expect(prisma.clientPortalContact.create).not.toHaveBeenCalled()
  })

  it('POST 409 si el email ya está en la lista', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))

    const res = await request(app)
      .post(BASE)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ email: 'cliente@example.com' })

    expect(res.status).toBe(409)
  })

  it('POST 403 si no puede escribir', async () => {
    mockWorkspace('member')
    prisma.projectMember.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .post(BASE)
      .set('Authorization', authHeader(1, 'member'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ email: 'cliente@example.com' })
    expect(res.status).toBe(403)
  })

  it('PATCH desactiva un contacto', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findFirst.mockResolvedValue(makeContact())
    prisma.clientPortalContact.update.mockResolvedValue(makeContact({ active: false }))

    const res = await request(app)
      .patch(`${BASE}/1`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ active: false })

    expect(res.status).toBe(200)
    expect(res.body.active).toBe(false)
    expect(prisma.clientPortalContact.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { active: false } })
  })

  it('PATCH 404 si el contacto no es de este portal', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .patch(`${BASE}/999`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ active: false })

    expect(res.status).toBe(404)
  })

  it('DELETE elimina un contacto', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.deleteMany.mockResolvedValue({ count: 1 })

    const res = await request(app).delete(`${BASE}/1`).set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(true)
    expect(prisma.clientPortalContact.deleteMany).toHaveBeenCalledWith({ where: { id: 1, portalId: PORTAL_ID } })
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
    expect(res.body.hasContent).toBe(false)
    expect(res.body.pendingApprovalCount).toBe(0)
  })

  it('hasContent/pendingApprovalCount se calculan cuando el portal + el flag están habilitados', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ contentEnabled: true }))
    prisma.project.findUnique.mockResolvedValue({ id: PROJECT_ID, name: 'Proyecto Demo' })
    prisma.workspace.findUnique.mockResolvedValue({
      slug: WORKSPACE_SLUG, name: 'Bliss', companyName: null, companyDescription: null,
      industry: null, companyWebsite: null, logoData: null, brandColors: '[]', brandFonts: '[]',
      disabledFeatureKeys: '[]',
    })
    prisma.monthlyReport.findMany.mockResolvedValue([])
    prisma.projectBrief.findMany.mockResolvedValue([])
    prisma.featureFlag.findUnique.mockResolvedValue({ key: 'contenido', enabledGlobally: true, enabledWorkspaceIds: '[]' })
    prisma.contentPiece.count
      .mockResolvedValueOnce(3) // visibleCount (PORTAL_VISIBLE_STATUSES)
      .mockResolvedValueOnce(2) // pendingCount (status: 'aprobacion')

    const res = await request(app).get('/api/public/client-portal/kahuak')

    expect(res.status).toBe(200)
    expect(res.body.hasContent).toBe(true)
    expect(res.body.pendingApprovalCount).toBe(2)
  })

  it('hasContent es false si el workspace optó por apagar el flag, aunque el portal lo tenga habilitado', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ contentEnabled: true }))
    prisma.project.findUnique.mockResolvedValue({ id: PROJECT_ID, name: 'Proyecto Demo' })
    prisma.workspace.findUnique.mockResolvedValue({
      slug: WORKSPACE_SLUG, name: 'Bliss', companyName: null, companyDescription: null,
      industry: null, companyWebsite: null, logoData: null, brandColors: '[]', brandFonts: '[]',
      disabledFeatureKeys: '["contenido"]',
    })
    prisma.monthlyReport.findMany.mockResolvedValue([])
    prisma.projectBrief.findMany.mockResolvedValue([])
    prisma.featureFlag.findUnique.mockResolvedValue({ key: 'contenido', enabledGlobally: true, enabledWorkspaceIds: '[]' })

    const res = await request(app).get('/api/public/client-portal/kahuak')

    expect(res.status).toBe(200)
    expect(res.body.hasContent).toBe(false)
    expect(prisma.contentPiece.count).not.toHaveBeenCalled()
  })

  it('request-code no crea código si el email no matchea ningún contacto (pero responde ok genérico)', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/request-code')
      .send({ email: 'otro@distinto.com' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(prisma.clientPortalLoginCode.create).not.toHaveBeenCalled()
    expect(sendClientLoginCodeEmail).not.toHaveBeenCalled()
  })

  it('request-code no crea código si el contacto está desactivado', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findUnique.mockResolvedValue(makeContact({ active: false }))

    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/request-code')
      .send({ email: 'cliente@example.com' })

    expect(res.status).toBe(200)
    expect(prisma.clientPortalLoginCode.create).not.toHaveBeenCalled()
  })

  it('request-code crea y envía el código si el email matchea un contacto activo', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findUnique.mockResolvedValue(makeContact())
    prisma.clientPortalLoginCode.count.mockResolvedValue(0)
    prisma.project.findUnique.mockResolvedValue({ name: 'Proyecto Demo' })

    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/request-code')
      .send({ email: 'cliente@example.com' })

    expect(res.status).toBe(200)
    expect(prisma.clientPortalLoginCode.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ portalId: PORTAL_ID, contactId: 1, email: 'cliente@example.com' }),
    }))
    expect(sendClientLoginCodeEmail).toHaveBeenCalled()
  })

  it('request-code respeta el rate limit por (portal, email) — 429 tras 5 en la última hora', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findUnique.mockResolvedValue(makeContact())
    prisma.clientPortalLoginCode.count.mockResolvedValue(5)

    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/request-code')
      .send({ email: 'cliente@example.com' })

    expect(res.status).toBe(429)
    // el conteo del rate limit es por email, no solo por portal — así un contacto
    // ruidoso no le agota el límite a los demás
    expect(prisma.clientPortalLoginCode.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ portalId: PORTAL_ID, email: 'cliente@example.com' }),
    }))
  })

  it('verify-code devuelve 401 con código inválido', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalLoginCode.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/verify-code')
      .send({ email: 'cliente@example.com', code: '000000' })

    expect(res.status).toBe(401)
  })

  it('verify-code devuelve un token con contactId y actualiza lastLoginAt', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalLoginCode.findFirst.mockResolvedValue({ id: 1, code: '123456', contactId: 7 })
    prisma.clientPortalLoginCode.update.mockResolvedValue({})
    prisma.clientPortalContact.update.mockResolvedValue(makeContact({ id: 7 }))

    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/verify-code')
      .send({ email: 'cliente@example.com', code: '123456' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    const decoded = jwt.verify(res.body.token, SECRET)
    expect(decoded.purpose).toBe('client-portal-live')
    expect(decoded.portalId).toBe(PORTAL_ID)
    expect(decoded.contactId).toBe(7)
    expect(prisma.clientPortalContact.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { lastLoginAt: expect.any(Date) } })
  })
})

describe('Portal de cliente — datos en vivo (requiere token)', () => {
  // Sin contactId: simula un token emitido ANTES de la migración a multi-contacto.
  function legacyLiveToken() {
    return jwt.sign({ portalId: PORTAL_ID, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, purpose: 'client-portal-live' }, SECRET, { expiresIn: '30d' })
  }
  function contactLiveToken(contactId) {
    return jwt.sign({ portalId: PORTAL_ID, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, contactId, purpose: 'client-portal-live' }, SECRET, { expiresIn: '30d' })
  }

  beforeEach(() => jest.clearAllMocks())

  it('GET /live devuelve 401 sin token', async () => {
    const res = await request(app).get('/api/public/client-portal/kahuak/live')
    expect(res.status).toBe(401)
  })

  it('el token de portal NO sirve para rutas de staff (defense in depth)', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)
      .set('X-Workspace', WORKSPACE_SLUG)
    expect(res.status).toBe(401)
  })

  it('un token pre-migración (sin contactId) sigue viendo Datos en vivo — compatibilidad', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ liveDataCachedAt: null }))
    aggregateReportData.mockResolvedValue({
      project: { id: PROJECT_ID, name: 'Demo' }, month: '2026-07', dataMonth: '2026-07',
      sections: { instagram: { followersCount: 100 } }, objectives: [], period: { label: 'Julio 2026' },
      _analysisIsNew: false, _dataCacheIsNew: false,
    })
    prisma.projectClientPortal.update.mockResolvedValue(makePortal({ liveDataCachedAt: new Date() }))

    const res = await request(app)
      .get('/api/public/client-portal/kahuak/live')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(200)
    // No debe haber intentado resolver ningún contacto — el token legacy no trae contactId.
    expect(prisma.clientPortalContact.findUnique).not.toHaveBeenCalled()
    expect(res.body.data.sections.instagram.followersCount).toBe(100)
  })

  it('un token con contactId de un contacto activo funciona igual', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ liveDataCachedAt: new Date() }))
    prisma.clientPortalContact.findUnique.mockResolvedValue(makeContact({ id: 7, active: true, portalId: PORTAL_ID }))

    const res = await request(app)
      .get('/api/public/client-portal/kahuak/live')
      .set('Authorization', `Bearer ${contactLiveToken(7)}`)

    expect(res.status).toBe(200)
  })

  it('un contacto desactivado pierde el acceso al instante, aunque el token siga vigente', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findUnique.mockResolvedValue(makeContact({ id: 7, active: false }))

    const res = await request(app)
      .get('/api/public/client-portal/kahuak/live')
      .set('Authorization', `Bearer ${contactLiveToken(7)}`)

    expect(res.status).toBe(401)
  })

  it('un contacto borrado también corta el acceso', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/public/client-portal/kahuak/live')
      .set('Authorization', `Bearer ${contactLiveToken(999)}`)

    expect(res.status).toBe(401)
  })

  it('POST /live/refresh devuelve 429 si todavía no pasó el cooldown', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ liveDataCachedAt: new Date() }))

    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/refresh')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

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
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(200)
    expect(aggregateReportData).toHaveBeenCalled()
  })
})
