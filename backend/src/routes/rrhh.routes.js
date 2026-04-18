const router = require('express').Router()
const { loginHistory, lastLogins, userSummary, updateVacationDays, dashboardStats } = require('../controllers/rrhh.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)
router.use(workspaceAdminOnly)

router.get('/dashboard-stats',     dashboardStats)
router.get('/logins',              loginHistory)
router.get('/last-logins',         lastLogins)
router.get('/user-summary/:id',    userSummary)
router.patch('/vacation-days/:id', updateVacationDays)

module.exports = router
