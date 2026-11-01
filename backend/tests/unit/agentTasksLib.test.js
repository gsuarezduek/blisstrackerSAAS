const {
  computeAgentStats, isPresenceTask, formatAgentName, HUMAN_TASK_WHERE, PRESENCE_WORKDAY_WHERE,
  splitByExecutor, addExecutorMinutes, emptyExecutorSplit, agentDetail,
} = require('../../src/lib/agentTasks')

const period = { curStart: '2026-10-01', curEnd: '2026-10-31', prevStart: '2026-09-01', prevEnd: '2026-09-30' }
const grok   = { id: 7, label: 'Grok' }
const other  = { id: 8, label: null }

function done(date, mins, extra = {}) {
  return { completedDate: date, minutesOverride: mins, projectId: 1, project: { name: 'Pastiza' }, agent: grok, ...extra }
}

describe('computeAgentStats', () => {
  it('separa período actual y previo, con totales y deltas', () => {
    const s = computeAgentStats([
      done('2026-10-02', 10), done('2026-10-15', 20), done('2026-10-31', 30),
      done('2026-09-10', 15),
      done('2026-08-30', 99), // fuera de ambos períodos
    ], period)
    expect(s.current).toEqual({ completed: 3, minutes: 60 })
    expect(s.previous).toEqual({ completed: 1, minutes: 15 })
    expect(s.delta.tareasPct).toBe(2)   // 3 vs 1 → +200%
    expect(s.delta.minutosPct).toBe(3)  // 60 vs 15 → +300%
    expect(s.hasData).toBe(true)
  })

  it('agrupa por agente y por proyecto (solo período actual), con nombre de respaldo', () => {
    const s = computeAgentStats([
      done('2026-10-02', 10),
      done('2026-10-03', 5, { agent: other, projectId: 2, project: { name: 'Bliss' } }),
      done('2026-10-04', 5, { agent: null }),
      done('2026-09-04', 50, { agent: other }),
    ], period)
    expect(s.porAgente).toEqual(expect.arrayContaining([
      { agentId: 7, agentName: null, name: 'Grok', completed: 1, minutes: 10 },
      { agentId: 8, agentName: null, name: 'Agente #8', completed: 1, minutes: 5 },
      { agentId: null, agentName: null, name: 'Agente eliminado', completed: 1, minutes: 5 },
    ]))
    expect(s.porProyecto[0]).toEqual({ projectId: 1, name: 'Pastiza', completed: 2, minutes: 15 })
  })

  it('separa en filas a los agentes que comparten un token por su nombre declarado', () => {
    const s = computeAgentStats([
      done('2026-10-02', 10, { agentName: 'Ventas' }),
      done('2026-10-03', 20, { agentName: 'Ventas' }),
      done('2026-10-04', 5,  { agentName: 'SEO' }),
      done('2026-10-05', 1),
    ], period)
    expect(s.porAgente).toEqual([
      { agentId: 7, agentName: 'Ventas', name: 'Grok · Ventas', completed: 2, minutes: 30 },
      { agentId: 7, agentName: 'SEO', name: 'Grok · SEO', completed: 1, minutes: 5 },
      { agentId: 7, agentName: null, name: 'Grok', completed: 1, minutes: 1 },
    ])
  })

  it('sin tareas no tiene datos y el delta queda en 0', () => {
    const s = computeAgentStats([], period)
    expect(s.hasData).toBe(false)
    expect(s.delta.tareasPct).toBe(0)
  })
})

describe('reglas de trabajo humano y presencia', () => {
  it('una tarea cuenta como presencia solo si es de la persona y no la creó un agente', () => {
    expect(isPresenceTask({ isAgentTask: false, createdByAgentId: null })).toBe(true)
    expect(isPresenceTask({ isAgentTask: true, createdByAgentId: null })).toBe(false)
    expect(isPresenceTask({ isAgentTask: false, createdByAgentId: 7 })).toBe(false)
  })

  it('los fragmentos de where filtran tareas de agente', () => {
    expect(HUMAN_TASK_WHERE).toEqual({ isAgentTask: false })
    expect(PRESENCE_WORKDAY_WHERE.OR).toEqual([
      { tasks: { none: {} } },
      { tasks: { some: { isAgentTask: false, createdByAgentId: null } } },
    ])
  })
})

describe('formatAgentName', () => {
  it('suma el nombre declarado al del token', () => {
    expect(formatAgentName({ id: 7, label: 'grokbot' }, 'Ventas')).toBe('grokbot · Ventas')
  })
  it('sin nombre declarado (o igual al del token) queda el del token', () => {
    expect(formatAgentName({ id: 7, label: 'grokbot' }, null)).toBe('grokbot')
    expect(formatAgentName({ id: 7, label: 'grokbot' }, '  ')).toBe('grokbot')
    expect(formatAgentName({ id: 7, label: 'grokbot' }, 'grokbot')).toBe('grokbot')
  })
  it('token sin label cae a "Agente #id"', () => {
    expect(formatAgentName({ id: 9, label: null }, 'SEO')).toBe('Agente #9 · SEO')
  })
})

// ── Partir un agregado en tiempo de personas y tiempo de agentes ──────────────
// Convención: totalMinutes/taskCount = personas, agentMinutes/agentTasks = agentes.
// Las dos mitades salen de la MISMA query (una sola, sin filtro de ejecutor), así que el
// total que se le factura al cliente es por construcción totalMinutes + agentMinutes.

describe('splitByExecutor / addExecutorMinutes', () => {
  const human = (mins, extra = {}) => ({ isAgentTask: false, minutesOverride: mins, ...extra })
  const robot = (mins, extra = {}) => ({ isAgentTask: true,  minutesOverride: mins, ...extra })

  it('acumula cada mitad por separado', () => {
    const s = splitByExecutor([human(60), human(30), robot(45), robot(15)])
    expect(s).toEqual({ totalMinutes: 90, taskCount: 2, agentMinutes: 60, agentTasks: 2 })
  })

  it('una lista vacía devuelve el bucket en cero (no null)', () => {
    expect(splitByExecutor([])).toEqual(emptyExecutorSplit())
  })

  it('solo agentes: horas trabajadas con 0 tareas de personas', () => {
    const s = splitByExecutor([robot(120)])
    expect(s.totalMinutes).toBe(0)
    expect(s.taskCount).toBe(0)
    expect(s.agentMinutes).toBe(120)
  })

  it('addExecutorMinutes devuelve los minutos y de qué lado cayó, para el detalle del caller', () => {
    const bucket = emptyExecutorSplit()
    expect(addExecutorMinutes(bucket, human(25))).toEqual({ mins: 25, isAgent: false })
    expect(addExecutorMinutes(bucket, robot(10))).toEqual({ mins: 10, isAgent: true })
    expect(bucket).toEqual({ totalMinutes: 25, taskCount: 1, agentMinutes: 10, agentTasks: 1 })
  })

  it('usa taskMins: respeta minutesOverride y topea en 8h solo cuando no hay override', () => {
    // Sin override, 10h de reloj se recortan a 480 (alguien se olvidó de pausar).
    const sinOverride = {
      isAgentTask: false,
      startedAt: '2026-10-20T00:00:00Z', completedAt: '2026-10-20T10:00:00Z',
    }
    expect(splitByExecutor([sinOverride]).totalMinutes).toBe(480)
    // Con override el valor pasa tal cual — por eso el tope del tiempo declarado por un
    // agente vive en la escritura (setDuration), no acá.
    expect(splitByExecutor([robot(600)]).agentMinutes).toBe(600)
  })

  it('descuenta las pausas', () => {
    const t = {
      isAgentTask: false, pausedMinutes: 20,
      startedAt: '2026-10-20T10:00:00Z', completedAt: '2026-10-20T11:00:00Z',
    }
    expect(splitByExecutor([t]).totalMinutes).toBe(40)
  })
})

describe('agentDetail', () => {
  it('una fila por agente, ordenada por tiempo, con su nombre resuelto', () => {
    const rows = agentDetail([
      { isAgentTask: true, minutesOverride: 30, agent: grok },
      { isAgentTask: true, minutesOverride: 90, agent: other },
      { isAgentTask: true, minutesOverride: 10, agent: grok },
      { isAgentTask: false, minutesOverride: 500, agent: null }, // humana: se ignora
    ])
    expect(rows).toEqual([
      { agentId: 8, agentName: null, name: 'Agente #8', minutes: 90, taskCount: 1 },
      { agentId: 7, agentName: null, name: 'Grok',      minutes: 40, taskCount: 2 },
    ])
  })

  it('separa agentes que comparten token por su nombre declarado', () => {
    const rows = agentDetail([
      { isAgentTask: true, minutesOverride: 20, agent: grok, agentName: 'Ventas' },
      { isAgentTask: true, minutesOverride: 50, agent: grok, agentName: 'SEO' },
    ])
    expect(rows.map(r => [r.name, r.minutes])).toEqual([['Grok · SEO', 50], ['Grok · Ventas', 20]])
  })

  it('un token borrado no pierde su tiempo', () => {
    const rows = agentDetail([{ isAgentTask: true, minutesOverride: 15, agent: null, agentName: 'Ventas' }])
    expect(rows[0]).toMatchObject({ agentId: null, name: 'Agente eliminado · Ventas', minutes: 15 })
  })
})
