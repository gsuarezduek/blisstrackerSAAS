jest.mock('../../src/lib/prisma', () => ({
  workspace:          { findUnique: jest.fn() },
  workspaceMember:    { findUnique: jest.fn() },
  featureFlag:        { findUnique: jest.fn() },
  project:            { findFirst: jest.fn(), findUnique: jest.fn() },
  projectMember:      { findUnique: jest.fn() },
  cannibalReport:     { findFirst: jest.fn() },
  cannibalResolution: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const PROJECT_ID     = 10
const USER_ID        = 1
const AGENT_TOKEN_ID = 77
const SITE           = 'https://mdzrentacar.com'
const BASE           = `/api/marketing/projects/${PROJECT_ID}/cannibal`

function authHeader(role = 'admin') {
  return `Bearer ${jwt.sign(
    { userId: USER_ID, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )}`
}

// Un agente pega al MISMO endpoint: lo que lo distingue son los claims mcpTokenId /
// mcpAgentName, que solo firma mcp/apiBridge.js (mismo patrón que agentTasks.test.js).
function agentHeader(mcpAgentName = 'SEO') {
  return `Bearer ${jwt.sign(
    {
      userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'admin', isSuperAdmin: false,
      name: 'Test', email: 't@t.com', mcpTokenId: AGENT_TOKEN_ID, mcpAgentName,
    },
    SECRET,
  )}`
}

function mockWorkspace({ role = 'admin', isPrivate = false } = {}) {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss',
    disabledFeatureKeys: '[]', moduleAccess: null,
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: USER_ID, role, active: true })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'marketing', enabledGlobally: true, enabledWorkspaceIds: '[]' })
  prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
  prisma.project.findUnique.mockResolvedValue({ isPrivate })
  prisma.projectMember.findUnique.mockResolvedValue(null)
}

function conflict(over = {}) {
  return {
    query: 'alquiler de autos',
    language: 'default',
    severity: 'Alta',
    severityScore: 70,
    totalImpressions: 1200,
    totalClicks: 40,
    urls: [{ url: `${SITE}/alquiler-autos` }, { url: `${SITE}/blog/alquiler-autos` }],
    recommendation: { mainUrl: `${SITE}/alquiler-autos` },
    ...over,
  }
}

function resolutionRow(over = {}) {
  return {
    id: 5, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID,
    query: 'alquiler de autos', language: 'default',
    action: '301', note: '301 hecho', status: 'resolved',
    resolvedAt: new Date('2026-10-01T12:00:00Z'),
    mainUrl: `${SITE}/alquiler-autos`,
    urls: JSON.stringify([`${SITE}/alquiler-autos`, `${SITE}/blog/alquiler-autos`]),
    reopenCount: 0, reopenedAt: null, reopenEvidence: null, lastCheckedAt: null,
    resolvedBy: { name: 'Gastón' }, resolvedByAgent: null, resolvedByAgentName: null,
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.APP_DOMAIN = 'blisstracker.app'
})

describe('POST /cannibal/resolutions — marcar un conflicto como resuelto', () => {
  it('guarda acción, nota y fecha, y atribuye a la persona', async () => {
    mockWorkspace()
    prisma.cannibalResolution.upsert.mockImplementation(({ create }) => resolutionRow({ ...create, resolvedBy: { name: 'Gastón' } }))

    const res = await request(app).post(`${BASE}/resolutions`)
      .set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)
      .send({
        query: 'alquiler de autos', action: '301', note: '301 hecho desde /blog',
        resolvedAt: '2026-10-01', urls: [`${SITE}/alquiler-autos`, `${SITE}/blog/alquiler-autos`],
        mainUrl: `${SITE}/alquiler-autos`,
      })

    expect(res.status).toBe(201)
    expect(res.body.resolution.action).toBe('301')
    expect(res.body.resolution.note).toBe('301 hecho desde /blog')
    expect(res.body.resolution.urls).toHaveLength(2)
    const { create } = prisma.cannibalResolution.upsert.mock.calls[0][0]
    expect(create.resolvedById).toBe(USER_ID)
    expect(create.resolvedByAgentId).toBeNull()
    expect(create.resolvedAt.toISOString().slice(0, 10)).toBe('2026-10-01')
  })

  it('un agente queda registrado como autor, con su nombre declarado', async () => {
    mockWorkspace()
    prisma.cannibalResolution.upsert.mockImplementation(({ create }) => resolutionRow({ ...create, resolvedByAgent: { label: 'Grok' } }))

    const res = await request(app).post(`${BASE}/resolutions`)
      .set('Authorization', agentHeader('SEO')).set('X-Workspace', WORKSPACE_SLUG)
      .send({ query: 'alquiler de autos', action: 'canonical' })

    expect(res.status).toBe(201)
    const { create } = prisma.cannibalResolution.upsert.mock.calls[0][0]
    expect(create.resolvedByAgentId).toBe(AGENT_TOKEN_ID)
    expect(create.resolvedByAgentName).toBe('SEO')
    expect(create.resolvedById).toBe(USER_ID) // sigue siendo en nombre de su dueño
  })

  it('volver a marcarlo cierra la reapertura pero conserva el historial', async () => {
    mockWorkspace()
    prisma.cannibalResolution.upsert.mockResolvedValue(resolutionRow({ reopenCount: 1 }))

    await request(app).post(`${BASE}/resolutions`)
      .set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)
      .send({ query: 'alquiler de autos', action: '301' })

    const { update } = prisma.cannibalResolution.upsert.mock.calls[0][0]
    expect(update.status).toBe('resolved')
    expect(update.reopenedAt).toBeNull()
    expect(update.reopenEvidence).toBeNull()
    expect(update).not.toHaveProperty('reopenCount') // el contador de reaperturas no se pisa
  })

  it('no acepta una fecha de arreglo futura — define la ventana de verificación', async () => {
    mockWorkspace()
    prisma.cannibalResolution.upsert.mockImplementation(({ create }) => resolutionRow(create))
    const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

    await request(app).post(`${BASE}/resolutions`)
      .set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)
      .send({ query: 'alquiler de autos', resolvedAt: future })

    const { create } = prisma.cannibalResolution.upsert.mock.calls[0][0]
    expect(create.resolvedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000)
  })

  it('rechaza sin keyword, con fecha inválida, y normaliza una acción desconocida', async () => {
    mockWorkspace()
    prisma.cannibalResolution.upsert.mockImplementation(({ create }) => resolutionRow(create))

    const sinQuery = await request(app).post(`${BASE}/resolutions`)
      .set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG).send({ action: '301' })
    expect(sinQuery.status).toBe(400)

    const fechaMala = await request(app).post(`${BASE}/resolutions`)
      .set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)
      .send({ query: 'x', resolvedAt: 'ayer a la tarde' })
    expect(fechaMala.status).toBe(400)

    await request(app).post(`${BASE}/resolutions`)
      .set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)
      .send({ query: 'x', action: 'magia' })
    expect(prisma.cannibalResolution.upsert.mock.calls[0][0].create.action).toBe('otro')
  })

  it('guarda la keyword como la devuelve Search Console (minúsculas)', async () => {
    // La verificación filtra por `query equals <lo guardado>`: con otra forma no
    // matchearía ninguna fila y el conflicto no se reabriría nunca.
    mockWorkspace()
    prisma.cannibalResolution.upsert.mockImplementation(({ create }) => resolutionRow(create))

    await request(app).post(`${BASE}/resolutions`)
      .set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)
      .send({ query: '  Alquiler De Autos  ', language: 'EN' })

    const { where, create } = prisma.cannibalResolution.upsert.mock.calls[0][0]
    expect(create.query).toBe('alquiler de autos')
    expect(create.language).toBe('en')
    expect(where.projectId_query_language.query).toBe('alquiler de autos')
  })

  it('un member que no es del equipo del proyecto no puede marcar resuelto', async () => {
    mockWorkspace({ role: 'member' })

    const res = await request(app).post(`${BASE}/resolutions`)
      .set('Authorization', authHeader('member')).set('X-Workspace', WORKSPACE_SLUG)
      .send({ query: 'alquiler de autos' })

    expect(res.status).toBe(403)
    expect(prisma.cannibalResolution.upsert).not.toHaveBeenCalled()
  })
})

describe('GET /cannibal/:rid — las resoluciones se aplican en la lectura', () => {
  function mockReport(conflicts) {
    prisma.cannibalReport.findFirst.mockResolvedValue({
      id: 3, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, status: 'completed',
      dateRange: '90d', languageFilter: 'all',
      totalConflicts: conflicts.length, criticalCount: 1, warningCount: 1, lowCount: 0,
      trafficAtRisk: 1700, hreflangCount: 0, indexedByMistakeCount: 0,
      conflicts: JSON.stringify(conflicts),
      hreflangIssues: '[]', indexedByMistake: '[]',
      resumenGeneral: null, errorMsg: null,
    })
  }

  it('descuenta lo resuelto al instante, sin esperar un análisis nuevo', async () => {
    mockWorkspace()
    mockReport([conflict(), conflict({ query: 'autos en mendoza', severity: 'Media', totalImpressions: 500 })])
    prisma.cannibalResolution.findMany.mockResolvedValue([resolutionRow()])

    const res = await request(app).get(`${BASE}/3`)
      .set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.conflicts.map(c => c.query)).toEqual(['autos en mendoza'])
    expect(res.body.resolvedConflicts).toHaveLength(1)
    expect(res.body.resolvedConflicts[0].resolution.note).toBe('301 hecho')
    // Conteos recalculados sobre los abiertos: el encabezado no contradice la lista.
    expect(res.body.totalConflicts).toBe(1)
    expect(res.body.criticalCount).toBe(0)
    expect(res.body.warningCount).toBe(1)
    expect(res.body.trafficAtRisk).toBe(500)
    expect(res.body.detectedConflicts).toBe(2)
    expect(res.body.resolvedCount).toBe(1)
  })

  it('un conflicto reabierto vuelve a la lista, con el historial del arreglo anterior', async () => {
    mockWorkspace()
    mockReport([conflict()])
    prisma.cannibalResolution.findMany.mockResolvedValue([resolutionRow({
      status: 'reopened',
      reopenedAt: new Date('2026-10-25T00:00:00Z'),
      reopenCount: 1,
      reopenEvidence: JSON.stringify({
        from: '2026-10-02', to: '2026-10-31', days: 30, totalImpressions: 700,
        urls: [{ url: `${SITE}/alquiler-autos`, impressions: 400, share: 0.57 }],
      }),
    })])

    const res = await request(app).get(`${BASE}/3`)
      .set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)

    expect(res.body.resolvedConflicts).toHaveLength(0)
    expect(res.body.conflicts).toHaveLength(1)
    expect(res.body.conflicts[0].resolution.status).toBe('reopened')
    expect(res.body.conflicts[0].resolution.reopenEvidence.from).toBe('2026-10-02')
    expect(res.body.totalConflicts).toBe(1)
  })
})

describe('GET /cannibal/resolutions', () => {
  it('lista las resoluciones del proyecto para cualquier miembro del workspace', async () => {
    mockWorkspace({ role: 'member' })
    prisma.cannibalResolution.findMany.mockResolvedValue([resolutionRow()])

    const res = await request(app).get(`${BASE}/resolutions`)
      .set('Authorization', authHeader('member')).set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.resolutions).toHaveLength(1)
    expect(res.body.resolutions[0].resolvedBy).toBe('Gastón')
  })

  it('"resolutions" no se confunde con el id de un reporte', async () => {
    mockWorkspace()
    prisma.cannibalResolution.findMany.mockResolvedValue([])

    const res = await request(app).get(`${BASE}/resolutions`)
      .set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(prisma.cannibalReport.findFirst).not.toHaveBeenCalled()
  })
})

describe('DELETE /cannibal/resolutions/:rid — desmarcar', () => {
  it('borra la resolución y devuelve 404 si no era de este proyecto', async () => {
    mockWorkspace()
    prisma.cannibalResolution.deleteMany.mockResolvedValue({ count: 1 })

    const ok = await request(app).delete(`${BASE}/resolutions/5`)
      .set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)
    expect(ok.status).toBe(200)
    expect(prisma.cannibalResolution.deleteMany).toHaveBeenCalledWith({
      where: { id: 5, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID },
    })

    prisma.cannibalResolution.deleteMany.mockResolvedValue({ count: 0 })
    const nope = await request(app).delete(`${BASE}/resolutions/999`)
      .set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)
    expect(nope.status).toBe(404)
  })

  it('un member ajeno al proyecto no puede desmarcar', async () => {
    mockWorkspace({ role: 'member' })

    const res = await request(app).delete(`${BASE}/resolutions/5`)
      .set('Authorization', authHeader('member')).set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(403)
    expect(prisma.cannibalResolution.deleteMany).not.toHaveBeenCalled()
  })
})
