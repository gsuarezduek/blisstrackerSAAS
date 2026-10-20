// Agentes IA en las métricas — un solo lugar para "qué es trabajo humano" y "qué
// día estuvo la persona", así Productividad, Asistencia, Reportes, el informe al
// cliente, el Scorecard de EOS y los insights usan exactamente el mismo criterio.
// Ver concepto "Agentes IA (tareas de agente)" en CLAUDE.md.

const { taskMins } = require('./timeMetrics')

// Tareas que ejecuta la persona (no uno de sus agentes). Se usa como fragmento de
// `where` en toda consulta que mide horas/tareas de personas.
const HUMAN_TASK_WHERE = Object.freeze({ isAgentTask: false })

// WorkDay que cuenta como "la persona estuvo": sin tareas (abrió el dashboard y
// trabajó sobre lo arrastrado) o con alguna tarea propia que NO creó un agente.
// Un WorkDay con solo tareas de agente / creadas por un agente lo abrió el agente
// (vía MCP crear tarea o materializar su lista), no la persona.
const PRESENCE_WORKDAY_WHERE = Object.freeze({
  OR: [
    { tasks: { none: {} } },
    { tasks: { some: { isAgentTask: false, createdByAgentId: null } } },
  ],
})

// Misma regla, sobre las tareas ya traídas de un WorkDay (necesitan isAgentTask y
// createdByAgentId en el select). Para cálculos en memoria.
function isPresenceTask(t) {
  return !t.isAgentTask && t.createdByAgentId == null
}

// Stats de los agentes de UNA persona en un período (actual vs previo, mismo criterio
// que las de la persona: tareas completadas por fecha de completado, minutos con
// taskMins). `tasks`: tareas de agente COMPLETADAS con completedDate ("YYYY-MM-DD"),
// projectId, project.name y agent {id,label} (null si el token se borró).
function computeAgentStats(tasks, { curStart, curEnd, prevStart, prevEnd }) {
  const inCur  = d => d >= curStart  && d <= curEnd
  const inPrev = d => d >= prevStart && d <= prevEnd
  const cur  = tasks.filter(t => inCur(t.completedDate))
  const prev = tasks.filter(t => inPrev(t.completedDate))

  const sum = list => ({
    completed: list.length,
    minutes:   list.reduce((s, t) => s + taskMins(t), 0),
  })
  const current  = sum(cur)
  const previous = sum(prev)
  const pct = (c, p) => (!p ? (c ? null : 0) : (c - p) / p)

  const byAgent = {}
  const byProject = {}
  for (const t of cur) {
    const aKey = t.agent?.id ?? 0
    byAgent[aKey] ??= { agentId: t.agent?.id ?? null, name: t.agent?.label?.trim() || (t.agent ? `Agente #${t.agent.id}` : 'Agente eliminado'), completed: 0, minutes: 0 }
    byAgent[aKey].completed += 1
    byAgent[aKey].minutes   += taskMins(t)
    byProject[t.projectId] ??= { projectId: t.projectId, name: t.project?.name ?? '', completed: 0, minutes: 0 }
    byProject[t.projectId].completed += 1
    byProject[t.projectId].minutes   += taskMins(t)
  }

  return {
    current,
    previous,
    delta: { tareasPct: pct(current.completed, previous.completed), minutosPct: pct(current.minutes, previous.minutes) },
    porAgente:   Object.values(byAgent).sort((a, b) => b.completed - a.completed),
    porProyecto: Object.values(byProject).sort((a, b) => b.completed - a.completed),
    hasData: current.completed > 0 || previous.completed > 0,
  }
}

module.exports = { HUMAN_TASK_WHERE, PRESENCE_WORKDAY_WHERE, isPresenceTask, computeAgentStats }
