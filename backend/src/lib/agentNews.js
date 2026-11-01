// Novedades de un agente de IA (MCP) — las dos fuentes, en un solo lugar.
//
// Un agente MCP no recibe avisos: solo actúa cuando lo invocan. Todo lo que pasó
// mientras no estaba le llega por acá, y hay tres consumidores que tienen que ver
// exactamente lo mismo:
//   1. `GET /tasks/agent-updates` (tool `tasks_agent_updates`) — la bandeja que lee y
//      que marca las novedades como vistas.
//   2. `mcp/newsNudge.js` — el bloque que se le pega a la respuesta de cualquier tool
//      cuando tiene novedades sin ver, para que no dependa de acordarse de mirar.
//   3. `services/agentWake.service.js` — el despertador: lo que se le cuenta al
//      invocarlo desde afuera.
// Por eso los `where` viven acá y no dentro del controller: dos copias "espejo" de
// una query se terminan desincronizando (ya pasó con el split de minutos de agente en
// `byProject`, ver lib/agentTasks.js).

// Tareas que ESTE agente creó y que alguien completó sin que él lo sepa.
// - `declaredName`: varios agentes pueden compartir un token (param `agentName` de las
//   tools), así que solo las que creó con ese nombre.
// - Se excluyen las que ejecutó él mismo: ya sabe que las terminó.
function createdNewsWhere({ agentId, declaredName, workspaceId }) {
  return {
    createdByAgentId: agentId,
    ...(declaredName ? { createdByAgentName: declaredName } : {}),
    status: 'COMPLETED',
    createdByAgentSeenAt: null,
    workDay: { workspaceId },
    NOT: { isAgentTask: true, agentId, ...(declaredName ? { agentName: declaredName } : {}) },
  }
}

// Lo que la persona le dejó en SUS tareas de agente desde la app: la destrabó
// (`agentUpdateKind: 'unblocked'`) o le comentó algo (`'comment'`).
// Mismo scope que `agent-queue` (las suyas + las delegadas a "cualquiera de mis
// agentes"), y **sin** filtrar por nombre declarado: es su lista de trabajo, y una
// tarea destrabada tiene que llegarle igual.
function inboxNewsWhere({ agentId, userId, workspaceId }) {
  return {
    userId,
    isAgentTask: true,
    agentUpdateAt: { not: null },
    workDay: { workspaceId },
    OR: [{ agentId }, { agentId: null }],
  }
}

// Cuántas novedades sin ver tiene, por fuente. Para decidir si hay algo que avisar
// (el nudge, el webhook, el despertador) sin traer las filas.
async function countPendingNews(prisma, { agentId, declaredName, userId, workspaceId }) {
  const [created, inbox] = await Promise.all([
    prisma.task.count({ where: createdNewsWhere({ agentId, declaredName, workspaceId }) }),
    prisma.task.count({ where: inboxNewsWhere({ agentId, userId, workspaceId }) }),
  ])
  return { created, inbox, total: created + inbox }
}

module.exports = { createdNewsWhere, inboxNewsWhere, countPendingNews }
