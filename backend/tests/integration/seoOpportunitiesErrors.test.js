// Oportunidades SEO pasa los errores de Google por el mismo traductor que la pestaña
// SEO (respondGscError). Antes solo miraba el token vencido: un 403 "User does not
// have sufficient permission for site" (visto en producción) llegaba al navegador
// como 500 "Internal server error", sin decirle a nadie qué hacer.
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

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const PROJECT_ID     = 10

function authHeader() {
  return `Bearer ${jwt.sign(
    { userId: 1, workspaceId: WORKSPACE_ID, role: 'member', isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )}`
}

function mockAccess() {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss',
    disabledFeatureKeys: '[]', moduleAccess: null, marketingDisabledSections: '[]',
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: 'member', active: true })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'marketing', enabledGlobally: true, enabledWorkspaceIds: '[]' })
  prisma.project.findUnique.mockResolvedValue({ isPrivate: false, marketingEnabled: true, contenidoEnabled: true })
  prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID, name: 'Cliente', websiteUrl: 'https://www.cliente.com/' })
  prisma.projectIntegration.findUnique.mockResolvedValue({
    id: 99, projectId: PROJECT_ID, type: 'google_search_console', status: 'active', propertyId: null,
  })
  prisma.projectIntegration.update.mockResolvedValue({})
}

function googleFail(status, message) {
  const err = new Error(`Request failed with status code ${status}`)
  err.isAxiosError = true
  err.response = { status, data: { error: { message } } }
  return err
}

const getOpportunities = () => request(app)
  .get(`/api/marketing/projects/${PROJECT_ID}/seo/opportunities`)
  .set('Authorization', authHeader())
  .set('X-Workspace', WORKSPACE_SLUG)

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  mockAccess()
})
afterEach(() => console.error.mockRestore())

describe('GET /api/marketing/projects/:id/seo/opportunities — errores de Google', () => {
  it('403 sin permiso sobre el sitio → 403 NO_ACCESS con un mensaje accionable', async () => {
    axios.post.mockRejectedValue(googleFail(403, "User does not have sufficient permission for site 'https://www.cliente.com/'."))

    const res = await getOpportunities()

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('NO_ACCESS')
    expect(res.body.error).toMatch(/Sin acceso a esta propiedad/)
    expect(res.body.siteUrl).toBe('https://www.cliente.com/')
  })

  it('401 → token vencido: marca la integración y pide reconectar', async () => {
    axios.post.mockRejectedValue(googleFail(401, 'Request had invalid authentication credentials.'))

    const res = await getOpportunities()

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('TOKEN_EXPIRED')
    expect(prisma.projectIntegration.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'expired' },
    }))
  })

  it('403 por API apagada → API_DISABLED', async () => {
    axios.post.mockRejectedValue(googleFail(403, 'Google Search Console API has not been used in project 123 before or it is disabled.'))

    const res = await getOpportunities()

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('API_DISABLED')
  })
})
