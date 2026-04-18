const router = require('express').Router()
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')
const { listProductivity, refreshProductivity } = require('../controllers/adminProductivity.controller')

router.use(auth)
router.use(resolveWorkspace)
router.use(workspaceAdminOnly)

router.get('/',                 listProductivity)
router.post('/:userId/refresh', refreshProductivity)

module.exports = router
