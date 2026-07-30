const router = require('express').Router()
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')
const { listProductivity, userOverview, userBreakdown, refreshProductivity, sendDigestNow } = require('../controllers/adminProductivity.controller')

router.use(auth)
router.use(resolveWorkspace)
router.use(workspaceAdminOnly)

router.get('/',                          listProductivity)
router.get('/users/:userId/overview',    userOverview)
router.get('/users/:userId/breakdown',   userBreakdown)
router.post('/digest/send-now',          sendDigestNow)
router.post('/:userId/refresh',          refreshProductivity)

module.exports = router
