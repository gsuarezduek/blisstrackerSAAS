const router = require('express').Router()
const { loginHistory, lastLogins, userSummary, dashboardStats, updateLogin, deleteLogin, metricHistory } = require('../controllers/rrhh.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')
const { moduleAccessGuard } = require('../lib/moduleAccess')

router.use(auth)
router.use(resolveWorkspace)
router.use(moduleAccessGuard('rrhh'))

router.get('/dashboard-stats',     dashboardStats)
router.get('/metric-history',      metricHistory)
router.get('/logins',              loginHistory)
router.get('/last-logins',         lastLogins)
router.get('/user-summary/:id',    userSummary)
router.patch('/logins/:loginId',   updateLogin)
router.delete('/logins/:loginId',  deleteLogin)

module.exports = router
