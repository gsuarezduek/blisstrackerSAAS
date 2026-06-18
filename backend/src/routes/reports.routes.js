const router = require('express').Router()
const { byProject, byUser, mine, mineProductivity } = require('../controllers/reports.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.get('/mine',              mine)
router.get('/mine/productivity', mineProductivity)
router.get('/by-project',        workspaceAdminOnly, byProject)
router.get('/by-user',           workspaceAdminOnly, byUser)

module.exports = router
