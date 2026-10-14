const router = require('express').Router()
const { listMine, createMine, revokeMine } = require('../controllers/mcpTokens.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.get('/',             listMine)
router.post('/',            createMine)
router.patch('/:id/revoke', revokeMine)

module.exports = router
