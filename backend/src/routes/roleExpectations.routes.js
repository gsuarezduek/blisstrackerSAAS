const router = require('express').Router()
const { list, getByRole, upsert, getMyRoleExpectation } = require('../controllers/roleExpectations.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.get('/mine',       getMyRoleExpectation)
router.get('/all',        list)                        // para la vista Docs (cualquier miembro)
router.get('/',           workspaceAdminOnly, list)
router.get('/:roleName',  workspaceAdminOnly, getByRole)
router.put('/:roleName',  workspaceAdminOnly, upsert)

module.exports = router
