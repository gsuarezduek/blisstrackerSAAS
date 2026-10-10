const jwt = require('jsonwebtoken')
const axios = require('axios')
const prisma = require('../lib/prisma')

// Puente entre las tools del MCP y la API HTTP interna del propio backend. En
// vez de duplicar controllers/middlewares (feature flags, moduleAccessGuard,
// proyectos privados, billing status, etc.), cada tool pega por loopback a
// `/api/...` con un JWT de vida muy corta mintado al vuelo — así hereda
// exactamente las mismas reglas de acceso que una request real del frontend.
//
// Alcance v1: UN solo workspace + UN solo usuario, fijados por env vars
// (MCP_WORKSPACE_SLUG / MCP_USER_EMAIL). Ver "MCP (Grok) — integración" en
// backend/CLAUDE.md.

const PORT     = process.env.PORT || 3001
const BASE_URL = `http://127.0.0.1:${PORT}/api`

let cachedContext = null // { userId, workspaceSlug }

async function resolveContext() {
  if (cachedContext) return cachedContext

  const email = process.env.MCP_USER_EMAIL
  const slug  = process.env.MCP_WORKSPACE_SLUG
  if (!email || !slug) {
    throw new Error('MCP no configurado: faltan MCP_USER_EMAIL / MCP_WORKSPACE_SLUG')
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new Error(`MCP: no existe ningún usuario con email ${email}`)

  cachedContext = { userId: user.id, workspaceSlug: slug }
  return cachedContext
}

// Mismo secreto/algoritmo que /api/auth/* (ver lib/jwt.js verifyToken), pero
// expiresIn cortísimo porque se mint a por cada llamada — nunca viaja fuera
// de este proceso. `isSuperAdmin: false` a propósito: el MCP nunca debe poder
// escalar por encima del rol real que el usuario tiene en WorkspaceMember
// (eso lo resuelve resolveWorkspace leyendo la DB, no el JWT).
function mintInternalToken(userId) {
  return jwt.sign({ userId, isSuperAdmin: false }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '2m',
  })
}

// method: 'GET'|'POST'|'PATCH'|'DELETE'. path: con leading slash, ej '/tasks'.
async function callApi(method, path, { query, body } = {}) {
  const { userId, workspaceSlug } = await resolveContext()
  const token = mintInternalToken(userId)

  const response = await axios({
    method,
    url: `${BASE_URL}${path}`,
    params: query,
    data: body,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Workspace': workspaceSlug,
    },
    validateStatus: () => true, // los 4xx/5xx los interpreta el caller, no axios
  })

  return { status: response.status, data: response.data }
}

module.exports = { callApi }
