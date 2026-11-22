const router = require('express').Router()
const { listAgents, getAgentProfile, getAgentCompleted, updateAgent, rotateAgentToken } = require('../controllers/agents.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')

// Agentes IA como entidad (roster y ficha), legible por cualquier miembro del workspace
// — mismo criterio que el roster de personas. La CREDENCIAL de un agente (su token, sus
// canales de salida) vive en /api/mcp-tokens y sigue siendo self-service del dueño.
router.use(auth)
router.use(resolveWorkspace)

router.get('/', listAgents)
router.get('/:id', getAgentProfile)
router.get('/:id/completed', getAgentCompleted)
router.patch('/:id', updateAgent)
router.post('/:id/rotate', rotateAgentToken)

module.exports = router
