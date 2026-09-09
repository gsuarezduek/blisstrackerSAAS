const router = require('express').Router()
const { list, getAdminUserDetail, getUserProfile, getUserCompleted } = require('../controllers/users.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')
const { moduleAccessGuard } = require('../lib/moduleAccess')

router.use(auth)
router.use(resolveWorkspace)

// Devuelven datos personales sensibles (DNI, salud, cuenta bancaria) — por eso siguen
// gateadas, ahora por acceso al módulo RRHH (admin/owner siempre pasa) en vez de
// admin-only fijo: RRHH.jsx necesita esto para listar el equipo con roles no-admin.
router.get('/',                  moduleAccessGuard('rrhh'), list)
router.get('/:id/admin-detail',  moduleAccessGuard('rrhh'), getAdminUserDetail)
router.get('/:id/profile',  getUserProfile)
router.get('/:id/completed', getUserCompleted)

module.exports = router
