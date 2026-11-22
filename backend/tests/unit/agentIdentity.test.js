/**
 * Identidad del agente IA (controllers/agents.controller.js).
 *
 * Lo que se protege acá es sobre todo la separación entre ENTIDAD y CREDENCIAL: el
 * roster de agentes lo lee cualquier miembro del workspace, así que nada de lo que
 * autentica (el hash del token) ni de lo que configura su canal de salida (la URL del
 * webhook y su secret) puede viajar en esa respuesta. Es una fuga que ya apareció una
 * vez, cuando `shapeAgent` hacía spread de la fila y la ficha devolvía `webhookUrl`.
 *
 * Y la otra invariante: rotar el token conserva al agente. Es lo que hace sostenible
 * que la identidad viva en la misma fila que la credencial — sin eso, cambiar un token
 * comprometido obliga a crear otra fila y el agente pierde nombre, proyectos e historial.
 */
jest.mock('../../src/lib/prisma', () => ({
  mcpToken: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  userRole: { findFirst: jest.fn() },
  task:     { findMany: jest.fn() },
  projectMember: { findMany: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const {
  listAgents, getAgentProfile, updateAgent, rotateAgentToken,
  AGENT_PUBLIC_SELECT, AGENT_COLORS, agentScopeWhere, shapeAgent,
} = require('../../src/controllers/agents.controller')

const OWNER_ID = 7
const OTHER_ID = 99

function mkReq(over = {}) {
  return {
    params: { id: '5' },
    query: {},
    body: {},
    user: { userId: OWNER_ID },
    workspace: { id: 1, timezone: 'America/Argentina/Buenos_Aires' },
    workspaceMember: { role: 'member' },
    ...over,
  }
}

function mkRes() {
  const res = { statusCode: 200, body: undefined }
  res.status = jest.fn(c => { res.statusCode = c; return res })
  res.json = jest.fn(b => { res.body = b; return res })
  return res
}

const next = jest.fn()

// Fila como la devuelve Prisma con AGENT_PUBLIC_SELECT + los campos internos que el
// controller pide para decidir permisos.
function agentRow(over = {}) {
  return {
    id: 5, label: 'Grok SEO', color: 'violet', teamRole: 'DESIGNER',
    description: 'Audita keywords', createdAt: new Date('2026-11-01'), lastUsedAt: null,
    user: { id: OWNER_ID, name: 'Gastón', avatar: '2bee.png' },
    projects: [{ project: { id: 3, name: 'Bliss' } }],
    workspaceId: 1, userId: OWNER_ID, revokedAt: null,
    webhookUrl: 'https://hooks.example.com/abc', wakeEnabled: true,
    ...over,
  }
}

beforeEach(() => jest.clearAllMocks())

describe('qué sale de un agente hacia el workspace', () => {
  it('AGENT_PUBLIC_SELECT no pide ningún campo de credencial', () => {
    for (const secret of ['tokenHash', 'webhookUrl', 'webhookSecret', 'wakeEnabled', 'authFailures', 'revokedNoticeAt']) {
      expect(AGENT_PUBLIC_SELECT[secret]).toBeUndefined()
    }
  })

  it('shapeAgent descarta los campos internos aunque la fila los traiga', () => {
    const shaped = shapeAgent(agentRow(), OWNER_ID)
    // Enumerar la forma completa, no solo "no tiene webhookUrl": un spread futuro que
    // reintroduzca la fuga tiene que romper este test.
    expect(Object.keys(shaped).sort()).toEqual(
      ['color', 'createdAt', 'description', 'id', 'isMine', 'label', 'lastUsedAt', 'owner', 'projects', 'teamRole'].sort()
    )
    expect(shaped.projects).toEqual([{ id: 3, name: 'Bliss' }])
    expect(shaped.owner).toEqual({ id: OWNER_ID, name: 'Gastón', avatar: '2bee.png' })
  })

  it('isMine distingue al dueño de quien solo mira', () => {
    expect(shapeAgent(agentRow(), OWNER_ID).isMine).toBe(true)
    expect(shapeAgent(agentRow(), OTHER_ID).isMine).toBe(false)
  })

  it('el roster trae solo agentes vivos del workspace, y ?mine=true solo los propios', async () => {
    prisma.mcpToken.findMany.mockResolvedValue([agentRow()])
    await listAgents(mkReq(), mkRes(), next)
    expect(prisma.mcpToken.findMany.mock.calls[0][0].where).toEqual({ workspaceId: 1, revokedAt: null })

    await listAgents(mkReq({ query: { mine: 'true' } }), mkRes(), next)
    expect(prisma.mcpToken.findMany.mock.calls[1][0].where).toEqual({ workspaceId: 1, revokedAt: null, userId: OWNER_ID })
  })
})

describe('la ficha', () => {
  it('no filtra el webhook a quien no es dueño ni admin', async () => {
    prisma.mcpToken.findUnique.mockResolvedValue(agentRow())
    prisma.task.findMany.mockResolvedValue([])
    const res = mkRes()
    await getAgentProfile(mkReq({ user: { userId: OTHER_ID } }), res, next)

    expect(res.body.channels).toBeNull()
    expect(res.body.canEdit).toBe(false)
    expect(JSON.stringify(res.body)).not.toContain('hooks.example.com')
  })

  it('al dueño le dice si los canales están enchufados, sin la URL', async () => {
    prisma.mcpToken.findUnique.mockResolvedValue(agentRow())
    prisma.task.findMany.mockResolvedValue([])
    const res = mkRes()
    await getAgentProfile(mkReq(), res, next)

    expect(res.body.channels).toEqual({ hasWebhook: true, wakeEnabled: true })
    expect(JSON.stringify(res.body)).not.toContain('hooks.example.com')
  })

  it('un agente de otro workspace es 404, no 403', async () => {
    prisma.mcpToken.findUnique.mockResolvedValue(agentRow({ workspaceId: 42 }))
    const res = mkRes()
    await getAgentProfile(mkReq(), res, next)
    expect(res.statusCode).toBe(404)
  })

  it('el scope incluye las delegadas a "cualquiera de mis agentes"', () => {
    // Sin la rama `agentId: null` la ficha mostraría menos trabajo del que el agente
    // puede tomar — es el mismo scope que agent-queue y la bandeja de novedades.
    expect(agentScopeWhere({ id: 5, userId: OWNER_ID })).toEqual({
      isAgentTask: true,
      OR: [{ agentId: 5 }, { agentId: null, userId: OWNER_ID }],
    })
  })
})

describe('editar la identidad', () => {
  beforeEach(() => {
    prisma.mcpToken.findUnique.mockResolvedValue(agentRow())
    prisma.mcpToken.update.mockResolvedValue(agentRow())
  })

  it('el dueño puede, aunque sea un member común', async () => {
    const res = mkRes()
    await updateAgent(mkReq({ body: { label: 'Grok Ventas' } }), res, next)
    expect(res.statusCode).toBe(200)
    expect(prisma.mcpToken.update.mock.calls[0][0].data).toEqual({ label: 'Grok Ventas' })
  })

  it('un admin del workspace puede editar un agente ajeno', async () => {
    const res = mkRes()
    await updateAgent(mkReq({ user: { userId: OTHER_ID }, workspaceMember: { role: 'admin' }, body: { label: 'X' } }), res, next)
    expect(res.statusCode).toBe(200)
  })

  it('un member ajeno no puede', async () => {
    const res = mkRes()
    await updateAgent(mkReq({ user: { userId: OTHER_ID }, body: { label: 'X' } }), res, next)
    expect(res.statusCode).toBe(403)
    expect(prisma.mcpToken.update).not.toHaveBeenCalled()
  })

  it('rechaza un rol que no existe en el workspace', async () => {
    prisma.userRole.findFirst.mockResolvedValue(null)
    const res = mkRes()
    await updateAgent(mkReq({ body: { teamRole: 'NO_EXISTE' } }), res, next)
    expect(res.statusCode).toBe(400)
  })

  it('rechaza un color fuera de la paleta pero acepta "" para volver al derivado', async () => {
    const res1 = mkRes()
    await updateAgent(mkReq({ body: { color: '#ff0000' } }), res1, next)
    expect(res1.statusCode).toBe(400)

    const res2 = mkRes()
    await updateAgent(mkReq({ body: { color: '' } }), res2, next)
    expect(prisma.mcpToken.update.mock.calls[0][0].data).toEqual({ color: null })

    for (const c of AGENT_COLORS) {
      prisma.mcpToken.update.mockClear()
      await updateAgent(mkReq({ body: { color: c } }), mkRes(), next)
      expect(prisma.mcpToken.update.mock.calls[0][0].data).toEqual({ color: c })
    }
  })

  it('no deja al agente sin nombre', async () => {
    const res = mkRes()
    await updateAgent(mkReq({ body: { label: '   ' } }), res, next)
    expect(res.statusCode).toBe(400)
    expect(prisma.mcpToken.update).not.toHaveBeenCalled()
  })
})

describe('rotar el token', () => {
  it('conserva la fila: mismo id, mismo nombre, mismos proyectos, hash nuevo', async () => {
    prisma.mcpToken.findUnique.mockResolvedValue(agentRow())
    prisma.mcpToken.update.mockResolvedValue(agentRow())
    const res = mkRes()
    await rotateAgentToken(mkReq(), res, next)

    const call = prisma.mcpToken.update.mock.calls[0][0]
    expect(call.where).toEqual({ id: 5 })               // la MISMA fila, no una nueva
    expect(call.data.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(call.data.revokedNoticeAt).toBeNull()        // el antiflood ya no describe nada
    expect(res.body.id).toBe(5)
    expect(res.body.projects).toEqual([{ id: 3, name: 'Bliss' }])
    expect(res.body.token).toEqual(expect.any(String))  // el valor en claro, una sola vez
  })

  it('solo el dueño rota, ni siquiera un admin', async () => {
    // Un admin puede editar el nombre de un agente ajeno, pero no cambiarle la
    // credencial: el valor nuevo hay que pegarlo en el cliente MCP del dueño.
    prisma.mcpToken.findUnique.mockResolvedValue(agentRow())
    const res = mkRes()
    await rotateAgentToken(mkReq({ user: { userId: OTHER_ID }, workspaceMember: { role: 'admin' } }), res, next)
    expect(res.statusCode).toBe(403)
    expect(prisma.mcpToken.update).not.toHaveBeenCalled()
  })

  it('un agente revocado no se rota, se crea uno nuevo', async () => {
    prisma.mcpToken.findUnique.mockResolvedValue(agentRow({ revokedAt: new Date() }))
    const res = mkRes()
    await rotateAgentToken(mkReq(), res, next)
    expect(res.statusCode).toBe(400)
  })
})
