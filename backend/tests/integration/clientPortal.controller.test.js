jest.mock('../../src/lib/prisma', () => ({
  workspace: {
    findUnique: jest.fn(),
  },
  workspaceMember: {
    findUnique: jest.fn(),
    findMany:   jest.fn(),
  },
  project: {
    findFirst:  jest.fn(),
    findUnique: jest.fn(),
  },
  projectMember: {
    findUnique: jest.fn(),
    findMany:   jest.fn(),
  },
  userRole: {
    findMany: jest.fn(),
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
    findMany:   jest.fn(),
    findFirst:  jest.fn(),
    findUnique: jest.fn(),
    update:     jest.fn(),
  },
  projectBrief: {
    findMany: jest.fn(),
  },
  featureFlag: {
    findUnique: jest.fn(),
  },
  contentPiece: {
    count:    jest.fn(),
    findMany: jest.fn(),
  },
  projectMeeting: {
    findFirst: jest.fn(),
    findMany:  jest.fn(),
  },
  marketingObjective: {
    findMany: jest.fn(),
  },
  analyticsSnapshot: {
    findMany: jest.fn(),
  },
  notification: {
    createMany: jest.fn(),
  },
}))

jest.mock('../../src/services/monthlyReport.service', () => ({
  aggregateReportData: jest.fn(),
}))

jest.mock('../../src/services/email.service', () => ({
  sendClientLoginCodeEmail:  jest.fn().mockResolvedValue(undefined),
  sendPortalFirstLoginEmail: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../src/lib/socket', () => ({ emitTo: jest.fn() }))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const { aggregateReportData } = require('../../src/services/monthlyReport.service')
const { sendClientLoginCodeEmail, sendPortalFirstLoginEmail } = require('../../src/services/email.service')
const { emitTo } = require('../../src/lib/socket')
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

// Tokens del portal de cliente (client-portal-live), reusados por todos los
// describes que ahora requieren login (branding es la única excepción pública).
// Sin contactId: simula un token emitido ANTES de la migración a multi-contacto.
function legacyLiveToken() {
  return jwt.sign({ portalId: PORTAL_ID, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, purpose: 'client-portal-live' }, SECRET, { expiresIn: '30d' })
}
function contactLiveToken(contactId) {
  return jwt.sign({ portalId: PORTAL_ID, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, contactId, purpose: 'client-portal-live' }, SECRET, { expiresIn: '30d' })
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
    showMeetings: false,
    showTeam: false,
    showObjectives: false,
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

  it('PUT persiste showMeetings', async () => {
    prisma.projectClientPortal.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makePortal({ showMeetings: true }))
    prisma.projectClientPortal.upsert.mockResolvedValue(makePortal())

    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/client-portal`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ slug: 'kahuak', active: true, showMeetings: true, liveSections: [] })

    expect(res.status).toBe(200)
    expect(res.body.portal.showMeetings).toBe(true)
    expect(prisma.projectClientPortal.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ showMeetings: true }),
    }))
  })

  it('PUT persiste showTeam', async () => {
    prisma.projectClientPortal.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makePortal({ showTeam: true }))
    prisma.projectClientPortal.upsert.mockResolvedValue(makePortal())

    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/client-portal`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ slug: 'kahuak', active: true, showTeam: true, liveSections: [] })

    expect(res.status).toBe(200)
    expect(res.body.portal.showTeam).toBe(true)
    expect(prisma.projectClientPortal.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ showTeam: true }),
    }))
  })

  it('PUT persiste showObjectives', async () => {
    prisma.projectClientPortal.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makePortal({ showObjectives: true }))
    prisma.projectClientPortal.upsert.mockResolvedValue(makePortal())

    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/client-portal`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ slug: 'kahuak', active: true, showObjectives: true, liveSections: [] })

    expect(res.status).toBe(200)
    expect(res.body.portal.showObjectives).toBe(true)
    expect(prisma.projectClientPortal.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ showObjectives: true }),
    }))
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

describe('Portal de cliente — branding (sin auth)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('GET /api/public/client-portal/:slug/branding 404 si no existe', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/public/client-portal/no-existe/branding')
    expect(res.status).toBe(404)
  })

  it('GET /api/public/client-portal/:slug/branding devuelve solo nombre + branding, nunca reports/briefs/hasContent', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.project.findUnique.mockResolvedValue({ id: PROJECT_ID, name: 'Proyecto Demo' })
    prisma.workspace.findUnique.mockResolvedValue({
      slug: WORKSPACE_SLUG, name: 'Bliss', companyName: 'Bliss Agency', logoData: null, brandColors: '[{"hex":"#f97316"}]',
    })

    const res = await request(app).get('/api/public/client-portal/kahuak/branding')

    expect(res.status).toBe(200)
    expect(res.body.project).toEqual({ name: 'Proyecto Demo' })
    expect(res.body.workspace).toEqual(expect.objectContaining({ companyName: 'Bliss Agency', hasLogo: false }))
    // El punto central de este endpoint: nada de datos del proyecto acá.
    expect(res.body.reports).toBeUndefined()
    expect(res.body.briefs).toBeUndefined()
    expect(res.body.hasContent).toBeUndefined()
    expect(res.body.pendingApprovalCount).toBeUndefined()
    // Ninguna query de datos del proyecto — solo project+workspace.
    expect(prisma.monthlyReport.findMany).not.toHaveBeenCalled()
    expect(prisma.projectBrief.findMany).not.toHaveBeenCalled()
  })
})

describe('Portal de cliente — meta completa (requiere token)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('GET /api/public/client-portal/:slug devuelve 401 sin token', async () => {
    const res = await request(app).get('/api/public/client-portal/kahuak')
    expect(res.status).toBe(401)
  })

  it('GET /api/public/client-portal/:slug devuelve reports y briefs con token válido', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.project.findUnique.mockResolvedValue({ id: PROJECT_ID, name: 'Proyecto Demo' })
    prisma.workspace.findUnique.mockResolvedValue({
      slug: WORKSPACE_SLUG, name: 'Bliss', companyName: null, companyDescription: null,
      industry: null, companyWebsite: null, logoData: null, brandColors: '[]', brandFonts: '[]',
      disabledFeatureKeys: '[]',
    })
    prisma.monthlyReport.findMany.mockResolvedValue([{ token: 'abc-123', month: '2026-06' }])
    prisma.projectBrief.findMany.mockResolvedValue([{ type: 'marca', answers: { nombre_marca: 'Demo' }, updatedAt: new Date() }])

    const res = await request(app)
      .get('/api/public/client-portal/kahuak')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

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

    const res = await request(app)
      .get('/api/public/client-portal/kahuak')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

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

    const res = await request(app)
      .get('/api/public/client-portal/kahuak')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.hasContent).toBe(false)
    expect(prisma.contentPiece.count).not.toHaveBeenCalled()
  })

  function mockBaseData() {
    prisma.project.findUnique.mockResolvedValue({ id: PROJECT_ID, name: 'Proyecto Demo' })
    prisma.workspace.findUnique.mockResolvedValue({
      slug: WORKSPACE_SLUG, name: 'Bliss', companyName: null, companyDescription: null,
      industry: null, companyWebsite: null, logoData: null, brandColors: '[]', brandFonts: '[]',
      disabledFeatureKeys: '[]',
    })
    prisma.monthlyReport.findMany.mockResolvedValue([])
    prisma.projectBrief.findMany.mockResolvedValue([])
    prisma.monthlyReport.findFirst.mockResolvedValue(null)
  }

  it('pendingPreview trae hasta 2 títulos cuando hay piezas esperando aprobación', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ contentEnabled: true }))
    mockBaseData()
    prisma.featureFlag.findUnique.mockResolvedValue({ key: 'contenido', enabledGlobally: true, enabledWorkspaceIds: '[]' })
    prisma.contentPiece.count
      .mockResolvedValueOnce(3) // visibleCount
      .mockResolvedValueOnce(2) // pendingCount
    prisma.contentPiece.findMany.mockResolvedValue([{ id: 1, title: 'Post jueves' }, { id: 2, title: 'Reel viernes' }])

    const res = await request(app)
      .get('/api/public/client-portal/kahuak')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.pendingPreview).toEqual([{ id: 1, title: 'Post jueves' }, { id: 2, title: 'Reel viernes' }])
    expect(prisma.contentPiece.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'aprobacion' }), take: 2,
    }))
  })

  it('pendingPreview queda vacío (sin query extra) cuando no hay piezas pendientes', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ contentEnabled: true }))
    mockBaseData()
    prisma.featureFlag.findUnique.mockResolvedValue({ key: 'contenido', enabledGlobally: true, enabledWorkspaceIds: '[]' })
    prisma.contentPiece.count.mockResolvedValueOnce(3).mockResolvedValueOnce(0)

    const res = await request(app)
      .get('/api/public/client-portal/kahuak')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.pendingPreview).toEqual([])
    expect(prisma.contentPiece.findMany).not.toHaveBeenCalled()
  })

  it('latestReportSummary limpia HTML/espacios y trunca el resumen del último informe', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    mockBaseData()
    const longText = 'Este mes crecieron mucho las ventas gracias a la nueva campaña. '.repeat(4)
    prisma.monthlyReport.findFirst.mockResolvedValue({
      token: 'latest-token', month: '2026-07',
      analysis: JSON.stringify({ resumen: `<p>${longText}</p>` }),
    })

    const res = await request(app)
      .get('/api/public/client-portal/kahuak')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.latestReportSummary.token).toBe('latest-token')
    expect(res.body.latestReportSummary.month).toBe('2026-07')
    expect(res.body.latestReportSummary.resumen).not.toMatch(/<[^>]+>/)
    expect(res.body.latestReportSummary.resumen.length).toBeLessThanOrEqual(181) // 180 + '…'
  })

  it('latestReportSummary es null si el último informe no tiene análisis todavía', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    mockBaseData()
    prisma.monthlyReport.findFirst.mockResolvedValue({ token: 'latest-token', month: '2026-07', analysis: null })

    const res = await request(app)
      .get('/api/public/client-portal/kahuak')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.latestReportSummary).toEqual({ token: 'latest-token', month: '2026-07', resumen: null })
  })

  it('nextMeeting viene null si el portal no activó showMeetings (ni se consulta)', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ showMeetings: false }))
    mockBaseData()

    const res = await request(app)
      .get('/api/public/client-portal/kahuak')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.nextMeeting).toBeNull()
    expect(res.body.meetings).toEqual([])
    expect(prisma.projectMeeting.findFirst).not.toHaveBeenCalled()
    expect(prisma.projectMeeting.findMany).not.toHaveBeenCalled()
  })

  it('nextMeeting trae fecha+título (nunca notes) cuando showMeetings está activo y hay una reunión futura, y solo mira ESTRICTAMENTE después de hoy', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ showMeetings: true }))
    mockBaseData()
    prisma.projectMeeting.findFirst.mockResolvedValue({ date: '2026-09-01', title: 'Revisión mensual' })
    prisma.projectMeeting.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/public/client-portal/kahuak')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.nextMeeting).toEqual({ date: '2026-09-01', title: 'Revisión mensual' })
    // `gt`, no `gte`: una reunión de HOY no cuenta como "próxima" — se suele cargar
    // el mismo día que se tiene (o después), así que ya sucedió.
    expect(prisma.projectMeeting.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ type: 'client', date: { gt: expect.any(String) } }),
      select: { date: true, title: true },
    }))
  })

  it('meetings trae el historial completo CON notas (son reuniones type:client, el cliente ya estuvo) + today para clasificar próximas/anteriores en el front', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ showMeetings: true }))
    mockBaseData()
    prisma.projectMeeting.findFirst.mockResolvedValue(null)
    prisma.projectMeeting.findMany.mockResolvedValue([
      { date: '2026-09-01', title: 'Revisión mensual', notes: '<p>Quedamos en subir el presupuesto</p>' },
      { date: '2026-07-01', title: 'Kickoff', notes: null },
    ])

    const res = await request(app)
      .get('/api/public/client-portal/kahuak')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.meetings).toEqual([
      { date: '2026-09-01', title: 'Revisión mensual', notes: '<p>Quedamos en subir el presupuesto</p>' },
      { date: '2026-07-01', title: 'Kickoff', notes: null },
    ])
    expect(prisma.projectMeeting.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:  expect.objectContaining({ type: 'client' }),
      select: { date: true, title: true, notes: true },
    }))
    expect(typeof res.body.today).toBe('string')
    expect(res.body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('team viene vacío (sin queries) si el portal no activó showTeam', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ showTeam: false }))
    mockBaseData()

    const res = await request(app)
      .get('/api/public/client-portal/kahuak')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.showTeam).toBe(false)
    expect(res.body.team).toEqual([])
    expect(prisma.projectMember.findMany).not.toHaveBeenCalled()
  })

  it('team es vacío (sin queries extra) si el proyecto no tiene integrantes asignados', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ showTeam: true }))
    mockBaseData()
    prisma.projectMember.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/public/client-portal/kahuak')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.team).toEqual([])
    expect(prisma.workspaceMember.findMany).not.toHaveBeenCalled()
    expect(prisma.userRole.findMany).not.toHaveBeenCalled()
  })

  it('team trae foto/nombre/rol resuelto cuando showTeam está activo', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ showTeam: true }))
    mockBaseData()
    prisma.projectMember.findMany.mockResolvedValue([
      { userId: 2, user: { id: 2, name: 'Ana', avatar: 'ana.png' } },
    ])
    prisma.workspaceMember.findMany.mockResolvedValue([{ userId: 2, teamRole: 'DESIGNER' }])
    prisma.userRole.findMany.mockResolvedValue([{ name: 'DESIGNER', label: 'Diseñadora' }])

    const res = await request(app)
      .get('/api/public/client-portal/kahuak')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.team).toEqual([{ id: 2, name: 'Ana', avatar: 'ana.png', roleLabel: 'Diseñadora' }])
  })

  it('team excluye a un integrante desactivado del workspace', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ showTeam: true }))
    mockBaseData()
    prisma.projectMember.findMany.mockResolvedValue([
      { userId: 2, user: { id: 2, name: 'Ana', avatar: 'ana.png' } },
      { userId: 3, user: { id: 3, name: 'Beto (desactivado)', avatar: 'beto.png' } },
    ])
    // El where de la query real ya filtra active:true — el mock solo devuelve al activo.
    prisma.workspaceMember.findMany.mockResolvedValue([{ userId: 2, teamRole: 'DESIGNER' }])
    prisma.userRole.findMany.mockResolvedValue([{ name: 'DESIGNER', label: 'Diseñadora' }])

    const res = await request(app)
      .get('/api/public/client-portal/kahuak')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.team).toEqual([{ id: 2, name: 'Ana', avatar: 'ana.png', roleLabel: 'Diseñadora' }])
  })

  it('objectives viene vacío (sin query) si el portal no activó showObjectives', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ showObjectives: false }))
    mockBaseData()

    const res = await request(app)
      .get('/api/public/client-portal/kahuak')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.showObjectives).toBe(false)
    expect(res.body.objectives).toEqual([])
    expect(prisma.marketingObjective.findMany).not.toHaveBeenCalled()
  })

  it('objectives trae el resultado calculado por el motor cuando showObjectives está activo', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal({ showObjectives: true }))
    mockBaseData()
    prisma.marketingObjective.findMany.mockResolvedValue([
      { id: 1, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, category: 'web', metric: 'visitas', periodicity: 'monthly', target: 100, platform: null, trackedKeywordId: null, competitorId: null, createdAt: new Date(), trackedKeyword: null, competitor: null },
    ])
    prisma.analyticsSnapshot.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/public/client-portal/kahuak')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.objectives).toEqual([
      expect.objectContaining({ id: 1, metric: 'visitas', label: 'Visitas al sitio', status: 'no_data', actual: null, target: 100 }),
    ])
  })
})

describe('Portal de cliente — informe individual (requiere token)', () => {
  function makeReport(overrides = {}) {
    return {
      id: 50, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, token: 'report-token',
      month: '2026-06', status: 'published', periodStart: null, periodEnd: null,
      notes: null, analysis: null, dataCache: null, enabledSections: null, bannerData: null,
      ...overrides,
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    prisma.workspace.findUnique.mockResolvedValue({
      slug: WORKSPACE_SLUG, name: 'Bliss', companyName: null, companyDescription: null,
      industry: null, companyWebsite: null, logoData: null, brandColors: '[]', brandFonts: '[]',
    })
    prisma.projectBrief.findMany.mockResolvedValue([])
    prisma.monthlyReport.findMany.mockResolvedValue([]) // siblings
    aggregateReportData.mockResolvedValue({ sections: {}, objectives: [], period: {}, project: {} })
  })

  it('devuelve 401 sin token', async () => {
    const res = await request(app).get('/api/public/client-portal/kahuak/reports/report-token')
    expect(res.status).toBe(401)
  })

  it('devuelve 404 si el informe no existe', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.monthlyReport.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/public/client-portal/kahuak/reports/no-existe')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(404)
  })

  it('devuelve 404 si el informe es de otro proyecto (cierra el hueco de un token ajeno)', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.monthlyReport.findUnique.mockResolvedValue(makeReport({ projectId: PROJECT_ID + 1 }))

    const res = await request(app)
      .get('/api/public/client-portal/kahuak/reports/report-token')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(404)
    expect(aggregateReportData).not.toHaveBeenCalled()
  })

  it('devuelve 404 REPORT_DRAFT si el informe no está publicado', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.monthlyReport.findUnique.mockResolvedValue(makeReport({ status: 'draft' }))

    const res = await request(app)
      .get('/api/public/client-portal/kahuak/reports/report-token')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('REPORT_DRAFT')
  })

  it('devuelve el informe si es del proyecto correcto y está publicado', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.monthlyReport.findUnique.mockResolvedValue(makeReport())

    const res = await request(app)
      .get('/api/public/client-portal/kahuak/reports/report-token')
      .set('Authorization', `Bearer ${legacyLiveToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.report.token).toBe('report-token')
    expect(aggregateReportData).toHaveBeenCalled()
  })
})

describe('Portal de cliente — login OTP (sin auth)', () => {
  beforeEach(() => jest.clearAllMocks())

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
    // lastLoginAt ya seteado — NO es el primer login, este test se queda solo
    // con el comportamiento del token/lastLoginAt (ver el describe de abajo
    // para el aviso de primer login).
    prisma.clientPortalContact.findUnique.mockResolvedValue({ lastLoginAt: new Date(), name: 'Cliente Demo', email: 'cliente@example.com' })
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

    await new Promise(r => setImmediate(r))
    expect(prisma.notification.createMany).not.toHaveBeenCalled()
  })

  it('verify-code notifica al equipo (in-app + email) la primera vez que un contacto loguea', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalLoginCode.findFirst.mockResolvedValue({ id: 1, code: '123456', contactId: 7 })
    prisma.clientPortalLoginCode.update.mockResolvedValue({})
    prisma.clientPortalContact.findUnique.mockResolvedValue({ lastLoginAt: null, name: 'Cliente Demo', email: 'cliente@example.com' })
    prisma.clientPortalContact.update.mockResolvedValue(makeContact({ id: 7 }))
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 2, role: 'admin', user: { email: 'admin@bliss.test' } },
    ])
    prisma.projectMember.findMany.mockResolvedValue([])
    prisma.project.findUnique.mockResolvedValue({ name: 'Proyecto Demo' })
    prisma.workspace.findUnique.mockResolvedValue({ slug: WORKSPACE_SLUG })

    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/verify-code')
      .send({ email: 'cliente@example.com', code: '123456' })

    expect(res.status).toBe(200)

    // La notificación se dispara vía setImmediate — flusheamos el event loop.
    await new Promise(r => setImmediate(r))
    expect(prisma.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ userId: 2, actorId: null, type: 'PORTAL_CLIENT_LOGIN', projectId: PROJECT_ID })]),
    }))
    expect(emitTo).toHaveBeenCalledWith('user:2', 'notification:new', expect.objectContaining({ type: 'PORTAL_CLIENT_LOGIN' }))
    expect(sendPortalFirstLoginEmail).toHaveBeenCalledWith(
      ['admin@bliss.test'],
      expect.objectContaining({ projectName: 'Proyecto Demo', contactName: 'Cliente Demo' }),
      WORKSPACE_ID,
    )
  })
})

// Magic-token de "Pedir aprobación" de Contenido (content.controller.js
// requestApproval): mismo `purpose: 'client-portal-magic'` que emite ahí,
// nunca `client-portal-live` — así un token de sesión normal no cuela acá.
function magicToken(overrides = {}) {
  return jwt.sign(
    { purpose: 'client-portal-magic', portalId: PORTAL_ID, contactId: 1, ...overrides },
    SECRET,
    { expiresIn: overrides.expiresIn || '72h' },
  )
}

describe('Portal de cliente — magic-login de "Pedir aprobación" (sin auth)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('devuelve 404 si el portal no existe o está inactivo', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/magic-login')
      .send({ token: magicToken() })
    expect(res.status).toBe(404)
  })

  it('devuelve 401 con un token vencido o con firma inválida', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/magic-login')
      .send({ token: 'esto-no-es-un-jwt' })
    expect(res.status).toBe(401)
    expect(prisma.clientPortalContact.update).not.toHaveBeenCalled()
  })

  it('devuelve 401 si el token es de propósito distinto (ej. un client-portal-live normal)', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    const liveToken = contactLiveToken(1)
    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/magic-login')
      .send({ token: liveToken })
    expect(res.status).toBe(401)
  })

  it('devuelve 401 si el token es de otro portal', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/magic-login')
      .send({ token: magicToken({ portalId: PORTAL_ID + 999 }) })
    expect(res.status).toBe(401)
    expect(prisma.clientPortalContact.findUnique).not.toHaveBeenCalled()
  })

  it('devuelve 401 si el contacto ya no existe o fue desactivado, aunque el token siga vigente', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findUnique.mockResolvedValue(makeContact({ active: false }))
    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/magic-login')
      .send({ token: magicToken() })
    expect(res.status).toBe(401)
    expect(prisma.clientPortalContact.update).not.toHaveBeenCalled()
  })

  it('devuelve un token de sesión normal (client-portal-live) y actualiza lastLoginAt', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findUnique.mockResolvedValue(makeContact({ lastLoginAt: new Date() }))
    prisma.clientPortalContact.update.mockResolvedValue(makeContact({ id: 1 }))

    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/magic-login')
      .send({ token: magicToken() })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    const decoded = jwt.verify(res.body.token, SECRET)
    expect(decoded.purpose).toBe('client-portal-live')
    expect(decoded.portalId).toBe(PORTAL_ID)
    expect(decoded.contactId).toBe(1)
    expect(prisma.clientPortalContact.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { lastLoginAt: expect.any(Date) } })

    await new Promise(r => setImmediate(r))
    expect(prisma.notification.createMany).not.toHaveBeenCalled()
  })

  it('notifica al equipo (in-app + email) si es el primer login del contacto', async () => {
    prisma.projectClientPortal.findUnique.mockResolvedValue(makePortal())
    prisma.clientPortalContact.findUnique.mockResolvedValue(makeContact({ lastLoginAt: null }))
    prisma.clientPortalContact.update.mockResolvedValue(makeContact({ id: 1 }))
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 2, role: 'admin', user: { email: 'admin@bliss.test' } },
    ])
    prisma.projectMember.findMany.mockResolvedValue([])
    prisma.project.findUnique.mockResolvedValue({ name: 'Proyecto Demo' })
    prisma.workspace.findUnique.mockResolvedValue({ slug: WORKSPACE_SLUG })

    const res = await request(app)
      .post('/api/public/client-portal/kahuak/live/magic-login')
      .send({ token: magicToken() })

    expect(res.status).toBe(200)
    await new Promise(r => setImmediate(r))
    expect(prisma.notification.createMany).toHaveBeenCalled()
    expect(sendPortalFirstLoginEmail).toHaveBeenCalled()
  })
})

describe('Portal de cliente — datos en vivo (requiere token)', () => {
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
