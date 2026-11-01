const prisma = require('../lib/prisma')
const { sendAgentWebhook } = require('./agentWebhook.service')
const { maybeWakeAgent } = require('./agentWake.service')

// Un solo punto de salida hacia los agentes de IA.
//
// Los dos lugares donde una persona le deja algo a un agente (destrabar una tarea en
// `tasks/lifecycle.controller.js` y comentarla en `comments.controller.js`) llaman acá y
// no a cada canal por separado: así no se puede agregar un disparo y olvidarse de uno de
// los canales, que es exactamente el bug que tenía el desbloqueo (marcaba la novedad y
// nadie se enteraba).
//
// Tres canales, en orden de "cuánto depende de que el agente aparezca":
//   1. `Task.agentUpdateAt` — la bandeja. La escribe el que llama, no esto: tiene que
//      quedar marcada aunque los otros dos canales estén apagados o fallen.
//   2. Webhook (`McpToken.webhookUrl`) — para un agente con un proceso propio.
//   3. Despertador (`McpToken.wakeEnabled`) — el backend lo invoca por la API.
//
// Best-effort y en segundo plano: la respuesta HTTP de la persona que desbloqueó no
// espera a ninguno de los dos. Nunca lanza.

// A qué agentes le corresponde esta novedad. Una tarea delegada a "cualquiera de mis
// agentes" (`agentId` null) no tiene dueño todavía, así que se les avisa a todos los
// agentes activos de la persona — el que la tome primero se la queda, igual que con
// `task_start`. Solo los que tienen algún canal configurado: traer los demás sería
// trabajo al vacío.
function agentsToNotify({ agentId, userId, workspaceId }) {
  return prisma.mcpToken.findMany({
    where: {
      workspaceId,
      revokedAt: null,
      ...(agentId ? { id: agentId } : { userId }),
      OR: [{ webhookUrl: { not: null } }, { wakeEnabled: true }],
    },
  })
}

// `event`: 'task.unblocked' | 'task.comment'. `task` ya leído, con `project`.
async function notifyAgentOfNews({ event, task, workspaceId }) {
  try {
    if (!task?.isAgentTask) return
    const tokens = await agentsToNotify({ agentId: task.agentId, userId: task.userId, workspaceId })
    if (!tokens.length) return

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true } })
    await Promise.all(tokens.flatMap(token => [
      token.webhookUrl ? sendAgentWebhook({ token, event, task, workspaceSlug: workspace?.slug }) : null,
      token.wakeEnabled ? maybeWakeAgent(token) : null,
    ].filter(Boolean)))
  } catch (err) {
    console.error('[agentNotify] Error avisándole al agente:', err.message)
  }
}

// Dispara sin esperar: el caller sigue con su respuesta HTTP. El despertador puede
// tardar minutos (es un loop de LLM), así que esperarlo dejaría colgada la UI de la
// persona que apretó "Desbloquear".
function notifyAgentOfNewsInBackground(args) {
  setImmediate(() => { notifyAgentOfNews(args).catch(() => {}) })
}

module.exports = { notifyAgentOfNews, notifyAgentOfNewsInBackground }
