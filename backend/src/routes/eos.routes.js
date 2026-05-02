const router = require('express').Router()
const { getEOS, updateEOS } = require('../controllers/eos.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)
router.use(workspaceAdminOnly)

router.get('/',   getEOS)
router.patch('/', updateEOS)

module.exports = router
