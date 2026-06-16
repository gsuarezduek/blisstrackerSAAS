const router = require('express').Router()
const { loginHistory, lastLogins, userSummary, updateVacationDays, dashboardStats, updateLogin, deleteLogin, metricHistory } = require('../controllers/rrhh.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)
router.use(workspaceAdminOnly)

router.get('/dashboard-stats',     dashboardStats)
router.get('/metric-history',      metricHistory)
router.get('/logins',              loginHistory)
router.get('/last-logins',         lastLogins)
router.get('/user-summary/:id',    userSummary)
router.patch('/vacation-days/:id', updateVacationDays)
router.patch('/logins/:loginId',   updateLogin)
router.delete('/logins/:loginId',  deleteLogin)

module.exports = router
