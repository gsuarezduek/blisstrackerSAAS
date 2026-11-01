// `minutesOverride` es la única vía por la que un agente de IA registra su tiempo
// (task_set_duration vía MCP), y ese tiempo se le muestra al cliente y consume las horas
// contratadas del proyecto. `taskMins` no lo puede atajar: su tope de 8h aplica solo a la
// rama sin override. Por eso el tope vive acá, en la escritura.
jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  task: { findFirst: jest.fn(), update: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1

function authHeader(userId = 1, role = 'member') {
  return `Bearer ${jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )}`
}

function patchDuration(minutes, userId = 1) {
  return request(app)
    .patch('/api/tasks/1/duration')
    .set('Authorization', authHeader(userId))
    .set('X-Workspace', WORKSPACE_SLUG)
    .send({ minutes })
}

beforeEach(() => {
  jest.clearAllMocks()
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss',
    timezone: 'America/Argentina/Buenos_Aires',
    members: [{ workspaceId: WORKSPACE_ID, userId: 1, role: 'member', active: true }],
  })
  prisma.task.findFirst.mockResolvedValue({
    id: 1, userId: 1, status: 'COMPLETED', isAgentTask: true, description: 'Tarea del agente',
  })
  prisma.task.update.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }))
})

describe('PATCH /api/tasks/:id/duration — tope de la duración declarada', () => {
  it('acepta una jornada completa (480 min)', async () => {
    const res = await patchDuration(480)
    expect(res.status).toBe(200)
    expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { minutesOverride: 480 },
    }))
  })

  it('acepta el tope exacto de 24h (1440 min)', async () => {
    expect((await patchDuration(1440)).status).toBe(200)
  })

  it('rechaza una duración imposible (5000 min ≈ 83h)', async () => {
    const res = await patchDuration(5000)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/1440/)
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('rechaza 1441 (un minuto sobre el tope)', async () => {
    expect((await patchDuration(1441)).status).toBe(400)
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('sigue rechazando negativos y no-enteros', async () => {
    expect((await patchDuration(-1)).status).toBe(400)
    expect((await patchDuration(10.5)).status).toBe(400)
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('acepta 0 (borrar el tiempo registrado)', async () => {
    expect((await patchDuration(0)).status).toBe(200)
  })

  it('el tope aplica igual a una tarea humana (es el mismo campo que edita la persona)', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 1, userId: 1, status: 'COMPLETED', isAgentTask: false })
    expect((await patchDuration(5000)).status).toBe(400)
  })
})
