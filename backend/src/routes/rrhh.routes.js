const router = require('express').Router()
const { loginHistory, lastLogins, userSummary, dashboardStats, updateLogin, deleteLogin, metricHistory, monthAttendance } = require('../controllers/rrhh.controller')
const { updateLegajo, requestLegajo } = require('../controllers/rrhhLegajo.controller')
const { listOneOnOnes, createOneOnOne, updateOneOnOne, toggleAgreement, deleteOneOnOne } = require('../controllers/oneOnOne.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')
const { requireFeatureFlag } = require('../lib/featureFlags')
const { moduleAccessGuard } = require('../lib/moduleAccess')

router.use(auth)
router.use(resolveWorkspace)
router.use(requireFeatureFlag('rrhh'))
router.use(moduleAccessGuard('rrhh'))

router.get('/dashboard-stats',     dashboardStats)
router.get('/metric-history',      metricHistory)
router.get('/attendance',          monthAttendance)
router.get('/logins',              loginHistory)
router.get('/last-logins',         lastLogins)
router.get('/user-summary/:id',    userSummary)
router.patch('/legajo/:userId',         updateLegajo)   // completar datos de otra persona (salvo los de salud)
router.post('/legajo/:userId/request',  requestLegajo)  // pedirle a la persona que los complete ella
// 1on1: bajo RRHH y no bajo /api/eos/* — es trabajo de RRHH y tiene que andar en
// un workspace que no usa EOS (los strikes sí son de EOS y se quedaron allá).
router.get('/one-on-ones',        listOneOnOnes)
router.post('/one-on-ones',       createOneOnOne)
router.patch('/one-on-ones/:id',  updateOneOnOne)
router.delete('/one-on-ones/:id', deleteOneOnOne)
router.patch('/one-on-ones/:id/agreements/:agreementId', toggleAgreement)

router.patch('/logins/:loginId',   updateLogin)
router.delete('/logins/:loginId',  deleteLogin)

module.exports = router
