const { AnthropicError } = require('@anthropic-ai/sdk')

// Errores de servicios externos (Anthropic, axios contra Google/Meta/TikTok/etc.) traen
// su propio `status` HTTP. Si el error handler global lo reenvía tal cual, un 401 de
// Anthropic ("invalid x-api-key") llega al navegador como 401 y el interceptor de
// `frontend/src/api/client.js` lo toma como sesión vencida: borra el token y manda a
// /login → al volver al Dashboard se repite y nadie puede entrar. Por eso un error de
// un tercero nunca se responde con su status original: es una falla nuestra (502).
//
// Además, ningún código propio lanza 401 vía `next(err)` (la auth responde 401 directo
// con res.status), así que cualquier 401 que llegue al handler se trata igual.

function isUpstreamError(err) {
  return !!err && (err instanceof AnthropicError || err.isAxiosError === true)
}

function httpStatusFor(err) {
  if (isUpstreamError(err)) return 502
  const status = err?.status || 500
  return status === 401 ? 502 : status
}

module.exports = { isUpstreamError, httpStatusFor }
