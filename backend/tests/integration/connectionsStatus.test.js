jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  featureFlag:     { findUnique: jest.fn() },
  project:         { findMany: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const PROJECT_ID     = 10

function authHeader(role = 'member') {
  return `Bearer ${jwt.sign(
    { userId: 1, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )}`
}

function mockWorkspace({ role = 'member', disabledSections = '[]' } = {}) {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss',
    disabledFeatureKeys: '[]', moduleAccess: null, marketingDisabledSections: disabledSections,
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role, active: true })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'marketing', enabledGlobally: true, enabledWorkspaceIds: '[]' })
}

function project(over = {}) {
  return {
    id: PROJECT_ID, name: 'BlissTracker', websiteUrl: 'https://blisstracker.app',
    isPrivate: false, active: true, integrations: [], members: [], ...over,
  }
}

function get(qs = '', role = 'member') {
  return request(app)
    .get(`/api/marketing/connections${qs}`)
    .set('Authorization', authHeader(role))
    .set('X-Workspace', WORKSPACE_SLUG)
}

const sourceOf = (body, type) => body.sources.find(s => s.type === type)

beforeEach(() => {
  jest.clearAllMocks()
  process.env.APP_DOMAIN = 'blisstracker.app'
})

describe('GET /api/marketing/connections', () => {
  it('distingue conectada, vencida y sin conectar, y solo linkea lo que hay que arreglar', async () => {
    mockWorkspace()
    prisma.project.findMany.mockResolvedValue([project({
      integrations: [
        { type: 'google_analytics', status: 'active', propertyId: 'properties/123', customerId: null, accountEmail: 'a@t.com', scopes: '', expiresAt: null },
        { type: 'google_ads', status: 'expired', propertyId: null, customerId: '123-456-7890', accountEmail: null, scopes: '', expiresAt: null },
      ],
    })])

    const res = await get(`?projectId=${PROJECT_ID}`)
    expect(res.status).toBe(200)

    const ga = sourceOf(res.body, 'google_analytics')
    expect(ga).toEqual({ type: 'google_analytics', label: 'Google Analytics', state: 'active', propertyId: 'properties/123', accountEmail: 'a@t.com' })
    expect(ga.reconnectUrl).toBeUndefined() // lo que funciona no necesita link

    expect(sourceOf(res.body, 'google_ads')).toEqual(expect.objectContaining({
      state: 'expired', customerId: '123-456-7890',
      reconnectUrl: 'https://bliss.blisstracker.app/marketing?tab=anuncios&sub=google-ads&projectId=10',
    }))
    expect(sourceOf(res.body, 'google_search_console')).toEqual(expect.objectContaining({
      state: 'missing',
      reconnectUrl: 'https://bliss.blisstracker.app/marketing?tab=geo-seo&sub=diagnostico&view=seo&projectId=10',
    }))
  })

  // El sitio web no es una integración OAuth: se carga en la ficha del proyecto.
  it('el sitio web sale de Project.websiteUrl y linkea a Ajustes', async () => {
    mockWorkspace()
    prisma.project.findMany.mockResolvedValue([project({ websiteUrl: null })])

    const res = await get(`?projectId=${PROJECT_ID}`)
    expect(sourceOf(res.body, 'website')).toEqual({
      type: 'website', label: 'Sitio web', state: 'missing',
      reconnectUrl: 'https://bliss.blisstracker.app/my-projects/10?infoTab=ajustes',
    })
  })

  it('no ofrece fuentes de secciones de Marketing apagadas en Preferencias', async () => {
    mockWorkspace({ disabledSections: '["anuncios","rrss"]' })
    prisma.project.findMany.mockResolvedValue([project()])

    const res = await get(`?projectId=${PROJECT_ID}`)
    const types = res.body.sources.map(s => s.type)
    expect(types).not.toContain('google_ads')
    expect(types).not.toContain('instagram')
    expect(types).toContain('google_search_console')
  })

  it('sin projectId devuelve solo lo que falta de cada proyecto', async () => {
    mockWorkspace()
    prisma.project.findMany.mockResolvedValue([
      project({ id: 1, name: 'Todo conectado', websiteUrl: 'https://x.com', integrations: require('../../src/lib/connectionCatalog').SOURCES.filter(s => s.type !== 'website').map(s => ({ type: s.type, status: 'active' })) }),
      project({ id: 2, name: 'Con faltantes', integrations: [{ type: 'google_ads', status: 'expired' }] }),
    ])

    const res = await get()
    expect(res.body.projects.map(p => p.projectId)).toEqual([2]) // el que está completo no aparece
    expect(res.body.projects[0].sources.every(s => s.state !== 'active')).toBe(true)
    expect(res.body.state).toBe('pending')
    expect(res.body.expiredCount).toBe(1)
    // Antes la lista de lo vencido viajaba DOS veces (en sources y otra vez entera):
    // el detalle sale de state:'expired', acá alcanza el conteo.
    expect(res.body.expired).toBeUndefined()
  })

  // Lo que pidió el agente: la vista de todo el workspace le pesaba 76 KB.
  it('state=expired deja solo lo que se cayó', async () => {
    mockWorkspace()
    prisma.project.findMany.mockResolvedValue([
      project({ id: 2, name: 'Mixto', integrations: [{ type: 'google_ads', status: 'expired' }] }),
    ])

    const res = await get('?state=expired')
    expect(res.body.state).toBe('expired')
    expect(res.body.projects[0].sources.map(s => s.type)).toEqual(['google_ads'])
    // `connected`/`total` siguen describiendo el proyecto entero, no el recorte.
    expect(res.body.projects[0].total).toBeGreaterThan(1)
  })

  it('state inválido es 400, no un filtro vacío', async () => {
    mockWorkspace()
    prisma.project.findMany.mockResolvedValue([project()])
    const res = await get('?state=vencidas')
    expect(res.status).toBe(400)
  })

  // Lo que confundió al agente: el access token de Google vence cada hora y se
  // renueva solo, así que una fecha pasada al lado de "conectada" es lo normal.
  it('no informa un vencimiento ya pasado en una conexión activa', async () => {
    mockWorkspace()
    prisma.project.findMany.mockResolvedValue([project({
      integrations: [{ type: 'google_analytics', status: 'active', expiresAt: new Date(Date.now() - 3600e3) }],
    })])

    const res = await get(`?projectId=${PROJECT_ID}`)
    expect(sourceOf(res.body, 'google_analytics').state).toBe('active')
    expect(sourceOf(res.body, 'google_analytics').expiresAt).toBeUndefined()
  })

  it('pero sí un plazo futuro, que es un vencimiento real', async () => {
    mockWorkspace()
    const futuro = new Date(Date.now() + 60 * 86400e3)
    prisma.project.findMany.mockResolvedValue([project({
      integrations: [{ type: 'meta_ads', status: 'active', expiresAt: futuro }],
    })])

    const res = await get(`?projectId=${PROJECT_ID}`)
    expect(sourceOf(res.body, 'meta_ads').expiresAt).toBe(futuro.toISOString())
  })

  // Esta ruta no cuelga de /projects/:id, así que el gate de privados lo resuelve
  // el handler (ver middleware/projectPrivacy.js).
  it('403 sobre un proyecto privado del que no soy del equipo', async () => {
    mockWorkspace()
    prisma.project.findMany.mockResolvedValue([project({ isPrivate: true, members: [] })])

    const res = await get(`?projectId=${PROJECT_ID}`)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('PROJECT_PRIVATE')
  })

  it('un privado del que soy del equipo se ve igual', async () => {
    mockWorkspace()
    prisma.project.findMany.mockResolvedValue([project({ isPrivate: true, members: [{ userId: 1 }] })])

    const res = await get(`?projectId=${PROJECT_ID}`)
    expect(res.status).toBe(200)
  })

  it('un privado ajeno no se cuela en el listado de todo el workspace', async () => {
    mockWorkspace()
    prisma.project.findMany.mockResolvedValue([
      project({ id: 1, name: 'Privado ajeno', isPrivate: true, members: [] }),
      project({ id: 2, name: 'Normal' }),
    ])

    const res = await get()
    expect(res.body.projects.map(p => p.projectId)).toEqual([2])
  })

  it('404 si el proyecto no existe en el workspace', async () => {
    mockWorkspace()
    prisma.project.findMany.mockResolvedValue([])
    const res = await get('?projectId=999')
    expect(res.status).toBe(404)
  })
})
