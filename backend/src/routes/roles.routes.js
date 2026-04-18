const router = require('express').Router()
const { list, create, remove } = require('../controllers/roles.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.get('/',       list)
router.post('/',      workspaceAdminOnly, create)
router.delete('/:id', workspaceAdminOnly, remove)

module.exports = router
