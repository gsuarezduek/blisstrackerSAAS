const Anthropic = require('@anthropic-ai/sdk')
const { assertTokenBudget, hasTokenBudget } = require('./tokenBudget')
const { logTokens } = require('./logTokens')

// Cliente Anthropic ÚNICO y compartido de toda la app.
//
// - `maxRetries: 4`: el SDK reintenta con backoff exponencial + jitter y HONRA el
//   header `Retry-After` ante 408/409/429/5xx (incl. 529 "overloaded"). Esto es el
//   backoff que antes no teníamos: a 10x workspaces los 429 de Anthropic dejan de
//   perder datos silenciosamente en la cadena mensual.
// - `timeout`: corta requests colgados (los prompts de informe son grandes).
//
// Importá SIEMPRE desde acá (`require('../lib/claude')`) en vez de `new Anthropic()`
// para que el backoff (y, vía createMessage, el presupuesto + logging) aplique en todo
// el sistema.
const anthropic = new Anthropic({
  apiKey:     process.env.ANTHROPIC_API_KEY,
  maxRetries: 4,
  timeout:    120_000,
})

/**
 * Punto de entrada recomendado para invocar a Claude. Centraliza las tres cosas que
 * antes cada caller hacía (o se olvidaba de hacer):
 *   1. Presupuesto: lanza 429 `TOKEN_BUDGET_EXCEEDED` si el workspace superó su límite.
 *   2. Backoff: vía el cliente compartido (maxRetries).
 *   3. Logging: persiste el uso de tokens en AiTokenLog (no bloquea, nunca lanza).
 *
 * @param {object} params  params de anthropic.messages.create (model, max_tokens, messages…)
 * @param {object} opts
 * @param {number|null} opts.workspaceId  requerido para presupuesto + logging
 * @param {string}      opts.source       etiqueta del servicio (columna AiTokenLog.service)
 * @param {number|null} [opts.userId]     usuario que originó la llamada (si aplica)
 * @param {boolean}     [opts.enforceBudget=true]  poné false sólo si el caller ya validó el budget
 * @returns el objeto message de Anthropic
 */
async function createMessage(params, { workspaceId = null, source = 'ai', userId = null, enforceBudget = true } = {}) {
  if (enforceBudget && workspaceId != null) {
    await assertTokenBudget(workspaceId) // 429 TOKEN_BUDGET_EXCEEDED si excedido
  }
  const msg = await anthropic.messages.create(params)
  logTokens(source, userId, msg.usage, workspaceId).catch(() => {}) // fire-and-forget
  return msg
}

module.exports = { anthropic, createMessage, assertTokenBudget, hasTokenBudget }
