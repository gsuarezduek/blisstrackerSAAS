const router = require('express').Router()
const { create, list, markRead } = require('../controllers/feedback.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.post('/',           create)
router.get('/',            workspaceAdminOnly, list)
router.put('/:id/read',    workspaceAdminOnly, markRead)

module.exports = router
