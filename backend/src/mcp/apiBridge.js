const jwt = require('jsonwebtoken')
const axios = require('axios')

// Puente entre las tools del MCP y la API HTTP interna del propio backend. En
// vez de duplicar controllers/middlewares (feature flags, moduleAccessGuard,
// proyectos privados, billing status, etc.), cada tool pega por loopback a
// `/api/...` con un JWT de vida muy corta mintado al vuelo — así hereda
// exactamente las mismas reglas de acceso que una request real del frontend.
//
// La identidad (userId/workspaceSlug) la resuelve mcp/auth.js a partir del
// token recibido (tabla McpToken) y viaja como parámetro — este módulo no
// conoce workspaces/usuarios fijos, por eso sirve igual para 1 o N de cada uno.

const PORT     = process.env.PORT || 3001
const BASE_URL = `http://127.0.0.1:${PORT}/api`

// Mismo secreto/algoritmo que /api/auth/* (ver lib/jwt.js verifyToken), pero
// expiresIn cortísimo porque se mint a por cada llamada — nunca viaja fuera
// de este proceso. `isSuperAdmin: false` a propósito: el MCP nunca debe poder
// escalar por encima del rol real que el usuario tiene en WorkspaceMember
// (eso lo resuelve resolveWorkspace leyendo la DB, no el JWT).
//
// `mcpTokenId`: qué agente (McpToken) hace la llamada — la API lo lee como
// req.user.mcpTokenId para marcar Task.createdByAgentId / la cola del agente
// (ver concepto "Agentes IA" en backend/CLAUDE.md). Solo se puede obtener
// firmando con JWT_SECRET, o sea solo desde acá: un cliente no lo puede falsificar.
function mintInternalToken(userId, mcpTokenId) {
  return jwt.sign({ userId, isSuperAdmin: false, mcpTokenId: mcpTokenId ?? null }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '2m',
  })
}

// identity: { userId, workspaceSlug, tokenId }. method: 'GET'|'POST'|'PATCH'|'DELETE'.
// path: con leading slash, ej '/tasks'.
async function callApi(identity, method, path, { query, body } = {}) {
  const token = mintInternalToken(identity.userId, identity.tokenId)

  const response = await axios({
    method,
    url: `${BASE_URL}${path}`,
    params: query,
    data: body,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Workspace': identity.workspaceSlug,
    },
    validateStatus: () => true, // los 4xx/5xx los interpreta el caller, no axios
  })

  return { status: response.status, data: response.data }
}

module.exports = { callApi }
