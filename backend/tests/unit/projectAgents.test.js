/**
 * Agentes IA en el equipo de un proyecto (ProjectAgent).
 *
 * ProjectAgent espeja ProjectMember: la lista que llega en el body ES el equipo, no un
 * delta, y se reemplaza entera. Lo que no espeja es la validación — los ids vienen del
 * body, así que un agente de otro workspace o ya revocado tiene que quedar afuera: una
 * fila así después aparece en el equipo del proyecto como si nada.
 */
jest.mock('../../src/lib/prisma', () => ({
  project:       { findFirst: jest.fn(), update: jest.fn() },
  projectMember: { findMany: jest.fn(), deleteMany: jest.fn() },
  projectAgent:  { deleteMany: jest.fn() },
  projectService:{ deleteMany: jest.fn() },
  mcpToken:      { findMany: jest.fn() },
  notification:  { createMany: jest.fn() },
  $transaction:  jest.fn(),
}))

const prisma = require('../../src/lib/prisma')
const { update } = require('../../src/controllers/projects/projects.controller')

function mkRes() {
  const res = { statusCode: 200, body: undefined }
  res.status = jest.fn(c => { res.statusCode = c; return res })
  res.json = jest.fn(b => { res.body = b; return res })
  return res
}

function mkReq(body) {
  return { params: { id: '3' }, body, user: { userId: 7 }, workspace: { id: 1 } }
}

const next = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  prisma.project.findFirst.mockResolvedValue({ id: 3 })
  prisma.project.update.mockResolvedValue({ id: 3, name: 'Bliss', agents: [] })
})

// `data.agents` tal como se lo pasa a prisma.project.update
const agentsWrite = () => prisma.project.update.mock.calls[0][0].data.agents

it('reemplaza la lista completa de agentes, no la suma', async () => {
  prisma.mcpToken.findMany.mockResolvedValue([{ id: 2 }, { id: 5 }])
  await update(mkReq({ agentIds: [2, 5] }), mkRes(), next)

  expect(prisma.projectAgent.deleteMany).toHaveBeenCalledWith({ where: { projectId: 3 } })
  expect(agentsWrite()).toEqual({ create: [{ agentId: 2 }, { agentId: 5 }] })
})

it('un array vacío deja al proyecto sin agentes', async () => {
  await update(mkReq({ agentIds: [] }), mkRes(), next)
  expect(prisma.projectAgent.deleteMany).toHaveBeenCalledWith({ where: { projectId: 3 } })
  expect(agentsWrite()).toEqual({ create: [] })
  // Sin ids no hace falta ir a buscar nada a la base.
  expect(prisma.mcpToken.findMany).not.toHaveBeenCalled()
})

it('descarta los ids que no son agentes vivos de ESTE workspace', async () => {
  // La base solo devuelve el 2: el 9999 no existe y el 4 es de otro workspace.
  prisma.mcpToken.findMany.mockResolvedValue([{ id: 2 }])
  await update(mkReq({ agentIds: [2, 4, 9999] }), mkRes(), next)

  expect(prisma.mcpToken.findMany.mock.calls[0][0].where).toEqual({
    id: { in: [2, 4, 9999] }, workspaceId: 1, revokedAt: null,
  })
  expect(agentsWrite()).toEqual({ create: [{ agentId: 2 }] })
})

it('deduplica y descarta basura del body', async () => {
  prisma.mcpToken.findMany.mockResolvedValue([{ id: 2 }])
  await update(mkReq({ agentIds: [2, 2, 'x', null] }), mkRes(), next)
  expect(prisma.mcpToken.findMany.mock.calls[0][0].where.id).toEqual({ in: [2] })
})

it('sin agentIds en el body no toca los agentes del proyecto', async () => {
  // Una clave ausente significa "no la toques", igual que el resto del endpoint.
  await update(mkReq({ name: 'Otro nombre' }), mkRes(), next)
  expect(prisma.projectAgent.deleteMany).not.toHaveBeenCalled()
  expect(prisma.project.update.mock.calls[0][0].data.agents).toBeUndefined()
})

it('no notifica a nadie por sumar un agente', async () => {
  // Un agente no tiene campana: se entera por whoami la próxima vez que se conecte.
  prisma.mcpToken.findMany.mockResolvedValue([{ id: 2 }])
  await update(mkReq({ agentIds: [2] }), mkRes(), next)
  expect(prisma.notification.createMany).not.toHaveBeenCalled()
})
