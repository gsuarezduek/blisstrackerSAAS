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

// ── Tiempo de personas vs tiempo de agentes, en el mismo agregado ──────────────
// El tiempo de un agente ES tiempo trabajado: se le informa al cliente como trabajo
// hecho y consume las horas contratadas del proyecto. Pero internamente se muestra
// siempre separado del de la persona, y las métricas con las que se la evalúa
// (ocupación, benchmark) siguen siendo solo humanas. Para eso, en vez de dos queries
// espejo, se hace UNA sin filtro de ejecutor y se parte acá: las dos mitades salen del
// mismo `where`, el mismo rango y la misma timezone, así no pueden divergir y el total
// combinado es por construcción `totalMinutes + agentMinutes`.
//
// Convención de nombres (la que ya usaban Reportes y la pestaña Horas del proyecto):
//   totalMinutes / taskCount  → PERSONAS
//   agentMinutes / agentTasks → AGENTES
// El combinado y el % de presupuesto los arma quien pinta (frontend/src/utils/budget.js):
// el backend manda los dos hechos, la política de "qué consume presupuesto" vive en un
// solo lugar del frontend.

// Lo mínimo que tiene que traer el `select` para poder partir y calcular minutos.
const EXECUTOR_TASK_SELECT = Object.freeze({
  startedAt: true, completedAt: true, pausedMinutes: true, minutesOverride: true, isAgentTask: true,
})

function emptyExecutorSplit() {
  return { totalMinutes: 0, taskCount: 0, agentMinutes: 0, agentTasks: 0 }
}

// Acumula una tarea en un bucket con la convención de arriba y devuelve
// `{ mins, isAgent }` para que el caller siga con su propio detalle (por usuario, por
// proyecto, por agente) sin recalcular los minutos.
function addExecutorMinutes(bucket, task) {
  const mins = taskMins(task)
  const isAgent = !!task.isAgentTask
  if (isAgent) {
    bucket.agentMinutes += mins
    bucket.agentTasks   += 1
  } else {
    bucket.totalMinutes += mins
    bucket.taskCount    += 1
  }
  return { mins, isAgent }
}

// Totales planos de una lista ya traída, para el caso sin agrupar.
function splitByExecutor(tasks) {
  const bucket = emptyExecutorSplit()
  for (const t of tasks) addExecutorMinutes(bucket, t)
  return bucket
}

// ── Agrupar trabajo "por agente" ───────────────────────────────────────────────
// Clave de una fila agrupada por agente. Prioriza el TOKEN: cada fila `McpToken` es un
// agente con identidad propia (nombre, color, rol, ficha en /agentes/:id), así que todo
// su trabajo va junto aunque se haya autodeclarado con nombres distintos en `agentName`,
// o no lo haya mandado en algunas tools.
//
// Antes la clave era `token|agentName`, de cuando un token lo compartían varios agentes
// y `agentName` era lo único que los distinguía. Con un token por agente eso se dio
// vuelta: el MISMO agente salía partido en varias filas en Reportes, en la pestaña Horas
// y en el Scorecard, mientras en su ficha y en el proyecto era uno solo — y justo en los
// lugares que le muestran números al cliente. (Además `porAgente` se pinta con
// `key={a.agentId}`: dos filas del mismo agente son dos keys repetidas de React.)
//
// `agentName` sigue siendo la clave cuando NO hay token (`agent` null porque la fila se
// borró y las 17 FKs son SetNull): ahí es lo único que queda para no fundir el trabajo
// de varios agentes en un solo "Agente eliminado".
function agentGroupKey(task) {
  const declared = task.agentName?.trim() || null
  return task.agent ? `a:${task.agent.id}` : `d:${declared ?? ''}`
}

// Nombre visible de esa fila. Con token es el nombre del agente a secas: la fila junta
// todos sus `agentName`, así que elegir uno para el rótulo sería arbitrario.
function agentGroupName(task) {
  if (task.agent) return formatAgentName(task.agent, null)
  const declared = task.agentName?.trim() || null
  return declared ? `Agente eliminado · ${declared}` : 'Agente eliminado'
}

// La identidad de la fila, para spreadear en el bucket del caller (que le agrega sus
// propios contadores: minutes/taskCount, completed/minutes, count…).
function agentGroupIdentity(task) {
  return {
    agentId: task.agent?.id ?? null,
    // Sólo cuando ES la identidad (token borrado). Con token no hay un único nombre
    // declarado que poner acá, porque la fila los junta a todos.
    agentName: task.agent ? null : (task.agentName?.trim() || null),
    name: agentGroupName(task),
  }
}

// Detalle por agente de una lista de tareas de agente: una fila por agente (ver
// `agentGroupKey`).
function agentDetail(tasks) {
  const byKey = {}
  for (const t of tasks) {
    if (!t.isAgentTask) continue
    const key = agentGroupKey(t)
    byKey[key] ??= { ...agentGroupIdentity(t), minutes: 0, taskCount: 0 }
    byKey[key].minutes   += taskMins(t)
    byKey[key].taskCount += 1
  }
  return Object.values(byKey).sort((a, b) => b.minutes - a.minutes)
}

// Stats de los agentes de UNA persona en un período (actual vs previo, mismo criterio
// que las de la persona: tareas completadas por fecha de completado, minutos con
// taskMins). `tasks`: tareas de agente COMPLETADAS con completedDate ("YYYY-MM-DD"),
// projectId, project.name, agent {id,label} (null si el token se borró) y agentName.
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
    const aKey = agentGroupKey(t)
    byAgent[aKey] ??= { ...agentGroupIdentity(t), completed: 0, minutes: 0 }
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

// Nombre visible de un agente: el del token (o "Agente #id") + el que declaró el
// propio agente vía MCP (`agentName`), si hay — ej. "grokbot · Ventas". Mismo
// criterio que agentName() de frontend/src/hooks/useMyAgents.js.
function formatAgentName(agent, declaredName) {
  const base = agent ? (agent.label?.trim() || `Agente #${agent.id}`) : 'Agente'
  const declared = typeof declaredName === 'string' ? declaredName.trim() : ''
  return declared && declared !== base ? `${base} · ${declared}` : base
}

module.exports = {
  HUMAN_TASK_WHERE, PRESENCE_WORKDAY_WHERE, isPresenceTask, computeAgentStats, formatAgentName,
  EXECUTOR_TASK_SELECT, emptyExecutorSplit, addExecutorMinutes, splitByExecutor, agentDetail,
  agentGroupKey, agentGroupName, agentGroupIdentity,
}
