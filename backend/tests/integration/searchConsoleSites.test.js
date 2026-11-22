jest.mock('../../src/lib/prisma', () => ({
  workspace:          { findUnique: jest.fn() },
  workspaceMember:    { findUnique: jest.fn() },
  featureFlag:        { findUnique: jest.fn() },
  project:            { findUnique: jest.fn(), findFirst: jest.fn() },
  projectIntegration: { findUnique: jest.fn(), update: jest.fn() },
}))
jest.mock('axios')
jest.mock('../../src/services/tokenRefresh.service', () => ({
  getValidAccessToken: jest.fn().mockResolvedValue('ya29.token'),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const axios   = require('axios')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')
const { clearCache } = require('../../src/services/googleSearchConsole.service')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const PROJECT_ID     = 10
const INTEGRATION_ID = 99

function authHeader() {
  return `Bearer ${jwt.sign(
    { userId: 1, workspaceId: WORKSPACE_ID, role: 'member', isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )}`
}

function mockAccess({ propertyId = null } = {}) {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss',
    disabledFeatureKeys: '[]', moduleAccess: null, marketingDisabledSections: '[]',
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: 'member', active: true })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'marketing', enabledGlobally: true, enabledWorkspaceIds: '[]' })
  // El middleware de privacidad/módulos lee el proyecto con su propio select
  prisma.project.findUnique.mockResolvedValue({ isPrivate: false, marketingEnabled: true, contenidoEnabled: true })
  prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID, name: 'BlissTracker', websiteUrl: 'https://blisstracker.app' })
  prisma.projectIntegration.findUnique.mockResolvedValue({
    id: INTEGRATION_ID, projectId: PROJECT_ID, type: 'google_search_console', status: 'active',
    propertyId, accountEmail: 'dueño@blissmkt.ar',
  })
  prisma.projectIntegration.update.mockResolvedValue({})
}

const getSites = () => request(app)
  .get(`/api/marketing/projects/${PROJECT_ID}/search-console/sites`)
  .set('Authorization', authHeader())
  .set('X-Workspace', WORKSPACE_SLUG)

const getData = () => request(app)
  .get(`/api/marketing/projects/${PROJECT_ID}/search-console`)
  .set('Authorization', authHeader())
  .set('X-Workspace', WORKSPACE_SLUG)

beforeEach(() => {
  jest.clearAllMocks()
  clearCache(INTEGRATION_ID)
  process.env.APP_DOMAIN = 'blisstracker.app'
})

describe('GET /api/marketing/projects/:id/search-console/sites', () => {
  it('devuelve las propiedades de la cuenta con el id exacto, la de Dominio primero', async () => {
    mockAccess({ propertyId: 'https://blisstracker.app/' })
    axios.get.mockResolvedValue({
      data: {
        siteEntry: [
          { siteUrl: 'https://otrocliente.com/',      permissionLevel: 'siteOwner' },
          { siteUrl: 'https://blisstracker.app/',     permissionLevel: 'siteOwner' },
          { siteUrl: 'sc-domain:blisstracker.app',    permissionLevel: 'siteOwner' },
        ],
      },
    })

    const res = await getSites()

    expect(res.status).toBe(200)
    expect(res.body.accountEmail).toBe('dueño@blissmkt.ar')
    // `current` es lo que el backend consulta hoy: el 403 venía de pedir el prefijo
    expect(res.body.current).toBe('https://blisstracker.app/')
    expect(res.body.sites.map(s => s.siteUrl)).toEqual([
      'sc-domain:blisstracker.app',
      'https://blisstracker.app/',
      'https://otrocliente.com/',
    ])
    expect(res.body.sites[0]).toMatchObject({ isDomainProperty: true, matchesProject: true, verified: true })
  })

  it('404 si el proyecto no tiene Search Console conectado', async () => {
    mockAccess()
    prisma.projectIntegration.findUnique.mockResolvedValue(null)

    const res = await getSites()

    expect(res.status).toBe(404)
    expect(res.body.status).toBe('no_integration')
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('un token sin el scope de Search Console se reporta como missing_scope (no hay propiedad que elegir)', async () => {
    mockAccess()
    axios.get.mockRejectedValue({
      response: { status: 403, data: { error: { message: 'Request had insufficient authentication scopes.' } } },
    })

    const res = await getSites()

    expect(res.status).toBe(400)
    expect(res.body.status).toBe('missing_scope')
  })
})

describe('GET /api/marketing/projects/:id/search-console — mapeo del 403 de propiedad', () => {
  it('sigue devolviendo no_access con el Site URL que se probó', async () => {
    mockAccess({ propertyId: 'https://blisstracker.app/' })
    axios.post.mockRejectedValue({
      response: {
        status: 403,
        data: { error: { message: "User does not have sufficient permission for site 'https://blisstracker.app/'." } },
      },
    })

    const res = await getData()

    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ status: 'no_access', code: 'NO_ACCESS', siteUrl: 'https://blisstracker.app/' })
  })

  it('distingue la API deshabilitada del problema de permisos', async () => {
    mockAccess({ propertyId: 'https://blisstracker.app/' })
    axios.post.mockRejectedValue({
      response: {
        status: 403,
        data: { error: { message: 'Google Search Console API has not been used in project 123 before or it is disabled.' } },
      },
    })

    const res = await getData()

    expect(res.status).toBe(400)
    expect(res.body.status).toBe('api_disabled')
  })
})
