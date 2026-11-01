const axios = require('axios')
const crypto = require('crypto')
const prisma = require('../lib/prisma')
const { assertPublicUrl } = require('../lib/safeUrl')
const { formatAgentName } = require('../lib/agentTasks')

// Webhook saliente hacia un agente de IA (ver McpToken.webhookUrl).
//
// MCP es unidireccional: el agente nos llama, nunca al revés. Si corre en algún lado
// que pueda recibir un POST (n8n, un script, un bot propio), este es el camino de ida —
// el POST le avisa que hay una novedad y él sigue con `tasks_agent_updates`.
//
// Deliberadamente NO manda la novedad completa, solo el titular y el id de la tarea: el
// receptor tiene que ir a buscarla con el token, que es lo que autoriza a leerla. Así un
// webhook interceptado no filtra el contenido del trabajo, y la URL no necesita ser un
// secreto.
//
// Best-effort y fuera del camino de la respuesta HTTP: nunca lanza, nunca demora al
// usuario que desbloqueó la tarea. El resultado de la última entrega queda en
// `webhookLastAt`/`webhookLastStatus` para que Preferencias lo muestre (sin una tabla de
// log aparte: lo que importa es "¿está funcionando?", no el historial).

const TIMEOUT_MS = 5000
const RETRY_DELAY_MS = 2000

function sign(secret, body) {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`
}

// Un titular corto por tipo de novedad. El detalle lo trae tasks_agent_updates.
function headline(event, task, agentLabel) {
  const desc = task.description?.length > 70 ? `${task.description.slice(0, 67)}...` : task.description
  if (event === 'task.unblocked') return `Te destrabaron "${desc}": quedó pausada, retomala.`
  if (event === 'task.comment') return `Te comentaron en "${desc}".`
  return `Novedad en "${desc}" para ${agentLabel}.`
}

function buildPayload({ event, task, token, workspaceSlug }) {
  const agentLabel = formatAgentName(token, task.agentName)
  return {
    event,
    at: new Date().toISOString(),
    workspace: workspaceSlug,
    agent: { id: token.id, label: token.label ?? null },
    task: {
      id: task.id,
      description: task.description,
      status: task.status,
      project: task.project ? { id: task.project.id, name: task.project.name } : null,
    },
    headline: headline(event, task, agentLabel),
    // Lo que tiene que hacer el receptor: pedir el detalle por MCP. El Bearer de un
    // McpToken autentica SOLO contra /api/mcp (mcp/auth.js); la API REST usa el
    // middleware `auth`, que valida JWT de sesión y no conoce estos tokens.
    next: 'Pedí el detalle por MCP: la tool `tasks_agent_updates` contra POST /api/mcp con el Bearer de este agente. Ese token no sirve contra la API REST.',
  }
}

async function post(url, body, secret) {
  return axios.post(url, body, {
    timeout: TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'BlissTracker-Agent-Webhook/1',
      ...(secret ? { 'X-Bliss-Signature': sign(secret, body) } : {}),
    },
    // El status lo evaluamos nosotros: un 500 del receptor no tiene que tirar una
    // excepción distinta a un timeout, los dos se registran igual.
    validateStatus: () => true,
    maxRedirects: 0,
  })
}

// Dispara el webhook de UN token. `token` ya viene leído (con webhookUrl/webhookSecret).
// Nunca lanza.
async function sendAgentWebhook({ token, event, task, workspaceSlug }) {
  if (!token?.webhookUrl) return
  let status = 'error'
  try {
    // La URL se valida también acá y no solo al guardarla: un DNS puede cambiar de IP
    // entre que se configuró y que se usa (SSRF por rebinding).
    try {
      await assertPublicUrl(token.webhookUrl)
    } catch (e) {
      status = `url-no-permitida: ${e.message}`.slice(0, 120)
      return
    }

    const body = JSON.stringify(buildPayload({ event, task, token, workspaceSlug }))
    let res
    try {
      res = await post(token.webhookUrl, body, token.webhookSecret)
    } catch (e) {
      // Un reintento: el caso típico es el receptor dormido (cold start de un webhook
      // serverless), que responde bien al segundo intento.
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
      try {
        res = await post(token.webhookUrl, body, token.webhookSecret)
      } catch (e2) {
        status = /timeout/i.test(e2.message) ? 'timeout' : `error: ${e2.message}`.slice(0, 120)
        return
      }
    }
    status = String(res.status)
  } catch (err) {
    status = `error: ${err.message}`.slice(0, 120)
  } finally {
    // El registro del intento es best-effort también: si falla, no se pierde nada que
    // importe (es informativo para Preferencias).
    prisma.mcpToken
      .update({ where: { id: token.id }, data: { webhookLastAt: new Date(), webhookLastStatus: status } })
      .catch(() => {})
  }
}

module.exports = { sendAgentWebhook, sign, buildPayload }
