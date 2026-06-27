const router = require('express').Router()
const { list, getUserTasks, getUserProfile, getUserCompleted } = require('../controllers/users.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.get('/',             workspaceAdminOnly, list)
router.get('/:id/tasks',    getUserTasks)
router.get('/:id/profile',  getUserProfile)
router.get('/:id/completed', getUserCompleted)

module.exports = router
