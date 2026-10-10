const router = require('express').Router()
const { mcpAuth } = require('../mcp/auth')
const { handleMcpRequest } = require('../mcp/server')

// Sin `auth`/`resolveWorkspace` normales — este endpoint tiene su propia
// autenticación (token estático) y resuelve siempre al mismo workspace/usuario
// fijados por env vars. Ver mcp/auth.js y mcp/apiBridge.js.
router.all('/', mcpAuth, handleMcpRequest)

module.exports = router
