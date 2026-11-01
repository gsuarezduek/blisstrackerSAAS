const router = require('express').Router()
const { listMine, createMine, revokeMine, updateMine, getWakeConfig, saveWakeConfig } = require('../controllers/mcpTokens.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

// Antes de /:id, que si no se come "wake-config" como id.
router.get('/wake-config',  getWakeConfig)
router.put('/wake-config',  workspaceAdminOnly, saveWakeConfig)

router.get('/',             listMine)
router.post('/',            createMine)
router.patch('/:id/revoke', revokeMine)
router.patch('/:id',        updateMine)

module.exports = router
