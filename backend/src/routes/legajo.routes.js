const router = require('express').Router()
const { getFields, saveFields } = require('../controllers/legajo.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.get('/fields',  getFields)              // cualquier miembro
router.put('/fields',  workspaceAdminOnly, saveFields)  // solo admin/owner

module.exports = router
