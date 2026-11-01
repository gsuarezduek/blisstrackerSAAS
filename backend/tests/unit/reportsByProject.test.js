// `byProject` alimenta "horas usadas vs contratadas" de Reportes. Con el cambio de
// criterio (el tiempo de agente consume presupuesto) pasó de dos queries a una sola
// partida en JS, así que el assert más importante es de NO-REGRESIÓN: el número de las
// personas tiene que ser idéntico al de antes con el mismo dataset.
jest.mock('../../src/lib/prisma', () => ({
  task:    { findMany: jest.fn() },
  project: { findMany: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const { byProject } = require('../../src/controllers/reports.controller')

const TZ = 'America/Argentina/Buenos_Aires'
const pastiza = { id: 1, name: 'Pastiza', hoursEnabled: true, monthlyHours: 10 }
const otro    = { id: 2, name: 'Otro',    hoursEnabled: true, monthlyHours: 5 }
const ana     = { id: 11, name: 'Ana' }
const beto    = { id: 12, name: 'Beto' }
const grok    = { id: 7, label: 'Grok' }

let completed = 0
function task({ project = pastiza, user = ana, mins, agent = null, agentName = null }) {
  completed += 1
  return {
    id: completed, description: `Tarea ${completed}`,
    startedAt: '2026-10-20T10:00:00Z', completedAt: '2026-10-20T11:00:00Z',
    pausedMinutes: 0, minutesOverride: mins,
    project, user, isAgentTask: !!agent, agent: agent === 'deleted' ? null : agent, agentName,
  }
}

async function run(tasks, idle = []) {
  prisma.task.findMany.mockResolvedValue(tasks)
  prisma.project.findMany.mockResolvedValue(idle)
  const req = { workspace: { id: 1, timezone: TZ }, query: { from: '2026-10-01', to: '2026-10-31' } }
  let body
  const res = { json: b => { body = b } }
  await byProject(req, res, e => { throw e })
  return body
}

beforeEach(() => { jest.clearAllMocks(); completed = 0 })

describe('GET /api/reports (byProject) — personas y agentes en el mismo agregado', () => {
  it('las horas de las personas no cambian por la presencia de un agente', async () => {
    const humanas = [task({ mins: 60, user: ana }), task({ mins: 30, user: beto })]
    const sinAgente = await run([...humanas])
    completed = 0
    const conAgente = await run([...humanas, task({ mins: 120, agent: grok })])

    expect(sinAgente.projects[0].totalMinutes).toBe(90)
    expect(conAgente.projects[0].totalMinutes).toBe(90)   // ← no-regresión
    expect(conAgente.projects[0].taskCount).toBe(2)
    expect(conAgente.projects[0].agentMinutes).toBe(120)
    expect(conAgente.projects[0].agentTasks).toBe(1)
  })

  it('el detalle por usuario sigue siendo solo de personas', async () => {
    const r = await run([
      task({ mins: 60, user: ana }),
      task({ mins: 120, agent: grok, user: ana }),
    ])
    const [p] = r.projects
    expect(p.byUser).toHaveLength(1)
    expect(p.byUser[0]).toMatchObject({ user: ana, minutes: 60, tasks: 1 })
    expect(p.byUser[0].taskList).toHaveLength(1)
  })

  it('devuelve el detalle por agente, ordenado por tiempo', async () => {
    const r = await run([
      task({ mins: 30, agent: grok, agentName: 'Ventas' }),
      task({ mins: 90, agent: grok, agentName: 'SEO' }),
      task({ mins: 10, agent: grok, agentName: 'Ventas' }),
    ])
    expect(r.projects[0].byAgent.map(a => [a.name, a.minutes, a.tasks])).toEqual([
      ['Grok · SEO', 90, 1],
      ['Grok · Ventas', 40, 2],
    ])
  })

  it('un proyecto donde SOLO trabajaron agentes aparece con 0 tareas de personas', async () => {
    const r = await run([task({ project: otro, mins: 240, agent: grok })])
    const p = r.projects.find(x => x.project.id === otro.id)
    expect(p.totalMinutes).toBe(0)
    expect(p.taskCount).toBe(0)
    expect(p.agentMinutes).toBe(240)
  })

  it('un agente con token borrado no pierde su tiempo', async () => {
    const r = await run([task({ mins: 45, agent: 'deleted', agentName: 'Ventas' })])
    expect(r.projects[0].agentMinutes).toBe(45)
    expect(r.projects[0].byAgent[0]).toMatchObject({ agentId: null, name: 'Agente eliminado · Ventas' })
  })

  it('un proyecto con abono y sin actividad sigue apareciendo en cero', async () => {
    const r = await run([], [otro])
    const p = r.projects.find(x => x.project.id === otro.id)
    expect(p).toMatchObject({ totalMinutes: 0, taskCount: 0, agentMinutes: 0, agentTasks: 0 })
    expect(p.byUser).toEqual([])
    expect(p.byAgent).toEqual([])
  })

  it('una sola query a la DB (las dos mitades salen del mismo where)', async () => {
    await run([task({ mins: 60 }), task({ mins: 10, agent: grok })])
    expect(prisma.task.findMany).toHaveBeenCalledTimes(1)
    // Y sin filtro de ejecutor: si filtrara, una de las mitades vendría siempre vacía.
    expect(prisma.task.findMany.mock.calls[0][0].where).not.toHaveProperty('isAgentTask')
  })
})
