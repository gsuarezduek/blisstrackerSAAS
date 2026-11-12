jest.mock('../../src/lib/prisma', () => ({
  workspace:        { findUnique: jest.fn() },
  workspaceMember:  { findUnique: jest.fn() },
  featureFlag:      { findUnique: jest.fn() },
  vacationRequest:  { count: jest.fn() },
  benefitBankRequest: { count: jest.fn() },
  contentPiece:     { count: jest.fn() },
  financeTask:      { count: jest.fn() },
  user:             { findUnique: jest.fn() },
  $queryRaw:        jest.fn(),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const USER_ID        = 1

// Contadores de la barra lateral. Lo que más importa de este endpoint no es el número
// sino QUÉ CLAVES VIENEN: una clave ausente significa "este módulo no aplica para vos".
// Si el gating se desincroniza del de cada módulo, alguien sin acceso a RRHH se entera
// de que hay solicitudes pendientes.

function authHeader(role = 'member') {
  return `Bearer ${jwt.sign(
    { userId: USER_ID, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )}`
}

/**
 * @param moduleAccess - lo que el workspace tiene configurado por rol (null = nadie salvo admin)
 * @param flags        - qué feature flags están prendidos
 */
function mockWorkspace({ role = 'member', moduleAccess = null, flags = [] } = {}) {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss',
    // `moduleAccess` es Json en Prisma: llega como objeto, no como string.
    disabledFeatureKeys: '[]', moduleAccess,
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({
    workspaceId: WORKSPACE_ID, userId: USER_ID, role, active: true, teamRole: 'DESIGNER', extraTeamRoles: [],
  })
  prisma.featureFlag.findUnique.mockImplementation(({ where }) => Promise.resolve(
    flags.includes(where.key)
      ? { key: where.key, enabledGlobally: true, enabledWorkspaceIds: '[]' }
      : { key: where.key, enabledGlobally: false, enabledWorkspaceIds: '[]' },
  ))
  // La sesión no está revocada (middleware auth → sessionRevoked).
  prisma.user.findUnique.mockResolvedValue({ sessionValidAfter: null })
}

function get(role = 'member') {
  return request(app)
    .get('/api/nav/counts')
    .set('Authorization', authHeader(role))
    .set('X-Workspace', WORKSPACE_SLUG)
}

beforeEach(() => {
  jest.clearAllMocks()
  prisma.$queryRaw.mockResolvedValue([{ n: 0 }])
  prisma.vacationRequest.count.mockResolvedValue(0)
  prisma.benefitBankRequest.count.mockResolvedValue(0)
  prisma.contentPiece.count.mockResolvedValue(0)
  prisma.financeTask.count.mockResolvedValue(0)
})

describe('GET /api/nav/counts — qué módulos se informan', () => {
  it('sin ningún módulo habilitado devuelve vacío y no corre ninguna query de conteo', async () => {
    mockWorkspace({ role: 'member' })
    const res = await get()

    expect(res.status).toBe(200)
    expect(res.body.modules).toEqual({})
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
    expect(prisma.vacationRequest.count).not.toHaveBeenCalled()
    expect(prisma.contentPiece.count).not.toHaveBeenCalled()
    expect(prisma.financeTask.count).not.toHaveBeenCalled()
  })

  it('un admin con todo prendido recibe las cuatro claves', async () => {
    mockWorkspace({ role: 'admin', flags: ['whatsapp', 'rrhh', 'contenido', 'finanzas'] })
    const res = await get('admin')

    expect(res.status).toBe(200)
    expect(Object.keys(res.body.modules).sort()).toEqual(['contenido', 'finanzas', 'rrhh', 'ventas'])
  })

  it('un miembro sin acceso a RRHH no recibe la clave rrhh, aunque el módulo esté prendido', async () => {
    mockWorkspace({ role: 'member', flags: ['rrhh'] })
    const res = await get()

    expect(res.body.modules.rrhh).toBeUndefined()
    expect(prisma.vacationRequest.count).not.toHaveBeenCalled()
  })

  it('con acceso por rol a RRHH sí la recibe', async () => {
    mockWorkspace({ role: 'member', flags: ['rrhh'], moduleAccess: { rrhh: { roles: ['DESIGNER'] } } })
    prisma.vacationRequest.count.mockResolvedValue(2)
    const res = await get()

    expect(res.body.modules.rrhh).toEqual({ dot: true })
  })

  it('con el feature flag apagado no viene la clave, aunque tenga acceso por rol', async () => {
    mockWorkspace({ role: 'member', flags: [], moduleAccess: { rrhh: { roles: ['DESIGNER'] } } })
    const res = await get()

    expect(res.body.modules.rrhh).toBeUndefined()
  })

  it('Ventas prendido pero WhatsApp apagado: no viene la sub-clave de WhatsApp', async () => {
    mockWorkspace({ role: 'admin', flags: ['ventas'] })
    const res = await get('admin')

    expect(res.body.modules.ventas).toBeUndefined()
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
  })
})

describe('GET /api/nav/counts — los números', () => {
  it('WhatsApp viaja como número, no como punto', async () => {
    mockWorkspace({ role: 'admin', flags: ['whatsapp'] })
    prisma.$queryRaw.mockResolvedValue([{ n: 7 }])
    const res = await get('admin')

    expect(res.body.modules.ventas).toEqual({ subs: { whatsapp: { n: 7 } } })
  })

  it('RRHH suma licencias y beneficios en un solo punto', async () => {
    mockWorkspace({ role: 'admin', flags: ['rrhh'] })
    prisma.vacationRequest.count.mockResolvedValue(0)
    prisma.benefitBankRequest.count.mockResolvedValue(3)
    const res = await get('admin')

    expect(res.body.modules.rrhh).toEqual({ dot: true })
  })

  it('sin nada pendiente la clave viene igual, con dot en false', async () => {
    // Ausente ≠ false: ausente es "no te corresponde", false es "te corresponde y está limpio".
    mockWorkspace({ role: 'admin', flags: ['rrhh', 'finanzas'] })
    const res = await get('admin')

    expect(res.body.modules.rrhh).toEqual({ dot: false })
    expect(res.body.modules.finanzas).toEqual({ dot: false })
  })

  it('Finanzas cuenta las abiertas y las pospuestas ya vencidas, y NO corre el sync', async () => {
    mockWorkspace({ role: 'admin', flags: ['finanzas'] })
    prisma.financeTask.count.mockResolvedValue(4)
    const res = await get('admin')

    expect(res.body.modules.finanzas).toEqual({ dot: true })
    const { where } = prisma.financeTask.count.mock.calls[0][0]
    expect(where.workspaceId).toBe(WORKSPACE_ID)
    expect(where.deletedAt).toBeNull()
    expect(where.OR).toEqual([
      { status: { in: ['open'] } },
      { status: 'postponed', postponedUntil: { lte: expect.any(Date) } },
    ])
    // El sync de tareas generadas es una escritura: corre al abrir Finanzas, nunca acá.
    expect(prisma.financeTask.count).toHaveBeenCalledTimes(1)
  })

  it('Contenido cuenta las piezas esperando al cliente, solo de proyectos con el módulo prendido', async () => {
    mockWorkspace({ role: 'admin', flags: ['contenido'] })
    prisma.contentPiece.count.mockResolvedValue(2)
    const res = await get('admin')

    expect(res.body.modules.contenido).toEqual({ dot: true })
    const { where } = prisma.contentPiece.count.mock.calls[0][0]
    expect(where.status.in).toContain('aprobacion')
    expect(where.project.contenidoEnabled).not.toBe(false) // viene de CONTENIDO_PROJECT_WHERE
    expect(where.deletedAt).toBeNull()
  })

  it('un no-admin solo cuenta piezas de proyectos que puede ver', async () => {
    mockWorkspace({ role: 'member', flags: ['contenido'], moduleAccess: { contenido: { allMembers: true } } })
    await get()

    const { where } = prisma.contentPiece.count.mock.calls[0][0]
    expect(where.project.OR).toEqual([
      { isPrivate: false },
      { isPrivate: true, members: { some: { userId: USER_ID } } },
    ])
  })

  it('un admin no filtra por proyectos privados', async () => {
    mockWorkspace({ role: 'admin', flags: ['contenido'] })
    await get('admin')

    expect(prisma.contentPiece.count.mock.calls[0][0].where.project.OR).toBeUndefined()
  })
})

describe('GET /api/nav/counts — acceso', () => {
  it('sin token responde 401', async () => {
    const res = await request(app).get('/api/nav/counts').set('X-Workspace', WORKSPACE_SLUG)
    expect(res.status).toBe(401)
  })

  it('la respuesta no se cachea', async () => {
    mockWorkspace({ role: 'admin', flags: [] })
    const res = await get('admin')
    expect(res.headers['cache-control']).toBe('no-store')
  })
})
