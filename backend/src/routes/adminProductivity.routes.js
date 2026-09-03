const router = require('express').Router()
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')
const { listProductivity, userOverview, userBreakdown, refreshProductivity, sendDigestNow } = require('../controllers/adminProductivity.controller')

router.use(auth)
router.use(resolveWorkspace)
// Productividad vive como tab dentro de RRHH: mismo acceso que ese módulo (admin-only).
router.use(workspaceAdminOnly)
router.use((req, res, next) => {
  if (req.workspace?.productivityEnabled === false) {
    return res.status(403).json({ error: 'La sección de Productividad está deshabilitada para este workspace' })
  }
  next()
})

router.get('/',                          listProductivity)
router.get('/users/:userId/overview',    userOverview)
router.get('/users/:userId/breakdown',   userBreakdown)
router.post('/digest/send-now',          sendDigestNow)
router.post('/:userId/refresh',          refreshProductivity)

module.exports = router
