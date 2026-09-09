const router = require('express').Router()
const {
  listBalances, adjustBalance, getAdjustmentHistory, listRequests, reviewRequest,
  getMyBenefits, createRequest,
} = require('../controllers/benefits.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')
const { requireFeatureFlag } = require('../lib/featureFlags')
const { moduleAccessGuard } = require('../lib/moduleAccess')

router.use(auth)
router.use(resolveWorkspace)
router.use(requireFeatureFlag('rrhh'))

// Usuario autenticado: autoservicio sobre los propios bancos, sin moduleAccessGuard.
router.get('/my',          getMyBenefits)
router.post('/my/request', createRequest)

// Requiere acceso al módulo RRHH (admin/owner siempre pasa, ver moduleAccess.js)
router.get('/admin/balances',            moduleAccessGuard('rrhh'), listBalances)
router.patch('/admin/balances/:userId',  moduleAccessGuard('rrhh'), adjustBalance)
router.get('/admin/adjustments/:userId', moduleAccessGuard('rrhh'), getAdjustmentHistory)
router.get('/admin/requests',            moduleAccessGuard('rrhh'), listRequests)
router.patch('/admin/requests/:id',      moduleAccessGuard('rrhh'), reviewRequest)

module.exports = router
