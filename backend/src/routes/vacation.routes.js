const router = require('express').Router()
const {
  adjustVacationDays, getAdjustmentHistory, listRequests, reviewRequest,
  getMyVacation, createRequest,
} = require('../controllers/vacation.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

// Usuario autenticado
router.get('/my',              getMyVacation)
router.post('/my/request',     createRequest)

// Solo admins
router.patch('/admin/adjust/:userId',    workspaceAdminOnly, adjustVacationDays)
router.get('/admin/adjustments/:userId', workspaceAdminOnly, getAdjustmentHistory)
router.get('/admin/requests',            workspaceAdminOnly, listRequests)
router.patch('/admin/requests/:id',      workspaceAdminOnly, reviewRequest)

module.exports = router
