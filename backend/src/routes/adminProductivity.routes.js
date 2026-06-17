const router = require('express').Router()
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')
const { listProductivity, listByProject, refreshProductivity, sendDigestNow } = require('../controllers/adminProductivity.controller')

router.use(auth)
router.use(resolveWorkspace)
router.use(workspaceAdminOnly)

router.get('/',                 listProductivity)
router.get('/by-project',       listByProject)
router.post('/digest/send-now', sendDigestNow)
router.post('/:userId/refresh', refreshProductivity)

module.exports = router
