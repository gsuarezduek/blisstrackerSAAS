const router = require('express').Router()
const { list, getAdminUserDetail, getUserProfile, getUserCompleted } = require('../controllers/users.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')
const { moduleAccessGuard } = require('../lib/moduleAccess')

router.use(auth)
router.use(resolveWorkspace)

// Listado completo de miembros (con datos de legajo/horario): lo usa RRHH.jsx,
// por eso el gate es el mismo módulo, no un workspaceAdminOnly aparte.
router.get('/',                  moduleAccessGuard('rrhh'), list)
router.get('/:id/admin-detail',  moduleAccessGuard('rrhh'), getAdminUserDetail)
router.get('/:id/profile',  getUserProfile)
router.get('/:id/completed', getUserCompleted)

module.exports = router
