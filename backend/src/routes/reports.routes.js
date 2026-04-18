const router = require('express').Router()
const { byProject, byUser, byUserSummary, mine } = require('../controllers/reports.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.get('/mine',           mine)
router.get('/by-project',     workspaceAdminOnly, byProject)
router.get('/by-user',        workspaceAdminOnly, byUser)
router.get('/by-user-summary', workspaceAdminOnly, byUserSummary)

module.exports = router
