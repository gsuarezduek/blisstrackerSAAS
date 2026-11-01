// `hoursHistory` alimenta la pestaña Horas del proyecto y la tarjeta de Horas del
// Resumen. Mismo criterio que Reportes: el tiempo de agente consume presupuesto y se
// devuelve desglosado, sin tocar el número de las personas.
jest.mock('../../src/lib/prisma', () => ({
  project: { findFirst: jest.fn(), findUnique: jest.fn() },
  task:    { findMany: jest.fn() },
  projectMonthlyHoursLog: { findMany: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const { hoursHistory } = require('../../src/controllers/projectReports.controller')

const TZ = 'America/Argentina/Buenos_Aires'
const ana  = { id: 11, name: 'Ana', avatar: '2bee.png' }
const grok = { id: 7, label: 'Grok' }

let seq = 0
function task({ completedAt, mins, agent = null, user = ana }) {
  seq += 1
  return {
    id: seq, description: `Tarea ${seq}`,
    startedAt: completedAt, completedAt,
    pausedMinutes: 0, minutesOverride: mins,
    isAgentTask: !!agent, agent, agentName: null, user,
  }
}

async function run(tasks, { months = 2, logs = [] } = {}) {
  prisma.project.findFirst.mockResolvedValue({ id: 1 })  // resolveProjectId
  prisma.project.findUnique.mockResolvedValue({
    id: 1, name: 'Pastiza', hoursEnabled: true, monthlyHours: 10, timezone: TZ,
  })
  prisma.task.findMany.mockResolvedValue(tasks)
  prisma.projectMonthlyHoursLog.findMany.mockResolvedValue(logs)
  const req = { params: { id: '1' }, query: { months: String(months) }, workspace: { id: 1, timezone: TZ } }
  let body
  await hoursHistory(req, { json: b => { body = b } }, e => { throw e })
  return body
}

// Un día bien dentro del mes, para no depender del offset de timezone.
const thisMonth = new Date().toISOString().slice(0, 7)
const day = `${thisMonth}-15T14:00:00Z`

beforeEach(() => { jest.clearAllMocks(); seq = 0 })

describe('GET /api/projects/:id/reports/hours-history', () => {
  it('parte el mes en horas de personas y horas de agentes', async () => {
    const r = await run([
      task({ completedAt: day, mins: 90 }),
      task({ completedAt: day, mins: 30 }),
      task({ completedAt: day, mins: 120, agent: grok }),
    ])
    const m = r.months.find(x => x.month === thisMonth)
    expect(m.totalMinutes).toBe(120)   // solo personas
    expect(m.taskCount).toBe(2)
    expect(m.agentMinutes).toBe(120)
    expect(m.agentTasks).toBe(1)
  })

  it('las horas de las personas no cambian por la presencia de un agente', async () => {
    const soloHumana = await run([task({ completedAt: day, mins: 90 })])
    seq = 0
    const conAgente = await run([task({ completedAt: day, mins: 90 }), task({ completedAt: day, mins: 300, agent: grok })])
    const get = r => r.months.find(x => x.month === thisMonth).totalMinutes
    expect(get(soloHumana)).toBe(90)
    expect(get(conAgente)).toBe(90)
  })

  it('byUser no incluye filas por el trabajo de los agentes', async () => {
    const r = await run([task({ completedAt: day, mins: 60 }), task({ completedAt: day, mins: 60, agent: grok })])
    const m = r.months.find(x => x.month === thisMonth)
    expect(m.byUser).toHaveLength(1)
    expect(m.byUser[0]).toMatchObject({ minutes: 60, tasks: 1 })
    expect(m.byAgent).toEqual([expect.objectContaining({ name: 'Grok', minutes: 60, tasks: 1 })])
  })

  it('los meses sin actividad vienen en cero, con su abono histórico', async () => {
    // `monthlyHours` por mes sale del historial de ProjectMonthlyHoursLog (carry-forward),
    // no del valor actual del proyecto: un mes anterior al primer log queda sin dato.
    const r = await run([], { months: 2, logs: [{ monthlyHours: 10, effectiveFrom: '2020-01' }] })
    for (const m of r.months) {
      expect(m).toMatchObject({ totalMinutes: 0, taskCount: 0, agentMinutes: 0, agentTasks: 0 })
      expect(m.monthlyHours).toBe(10)
      expect(m.byAgent).toEqual([])
    }
  })

  it('el rango de la query cubre la noche del último día del mes en hora local', async () => {
    // Antes el rango se armaba sobre el día UTC: una tarea completada 22:30 ART del último
    // día del mes (= 01:30Z del 1° del mes siguiente) quedaba FUERA de la query, y el
    // bucketing por mes local tampoco tenía dónde ponerla → desaparecía de los dos meses.
    await run([])
    const { completedAt } = prisma.task.findMany.mock.calls[0][0].where
    const [y, m] = thisMonth.split('-').map(Number)
    const ultimoDia = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    const nocheDelUltimoDia = new Date(`${ultimoDia}T22:30:00-03:00`)
    expect(nocheDelUltimoDia <= completedAt.lte).toBe(true)
    // Y el borde de abajo arranca en la medianoche LOCAL del primer mes de la ventana
    // (con `months: 2`, el mes anterior): antes arrancaba 3h antes, comiéndose la última
    // hora del mes previo a la ventana.
    const [py, pm] = thisMonth.split('-').map(Number)
    const primerMes = new Date(Date.UTC(py, pm - 2, 1)).toISOString().slice(0, 7)
    expect(completedAt.gte.toISOString()).toBe(new Date(`${primerMes}-01T00:00:00-03:00`).toISOString())
  })

  it('un mes donde solo trabajaron agentes tiene horas con 0 tareas de personas', async () => {
    const r = await run([task({ completedAt: day, mins: 200, agent: grok })])
    const m = r.months.find(x => x.month === thisMonth)
    expect(m.totalMinutes).toBe(0)
    expect(m.agentMinutes).toBe(200)
  })
})
