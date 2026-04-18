const router = require('express').Router()
const c = require('../controllers/projects.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.get('/',                            c.list)
router.get('/all',                         workspaceAdminOnly, c.listAll)
router.get('/settings',                    workspaceAdminOnly, c.getGlobalSettings)
router.patch('/settings',                  workspaceAdminOnly, c.saveGlobalSettings)
router.post('/settings/test-email',        workspaceAdminOnly, c.sendTestEmail)
router.get('/settings/ai-usage',           workspaceAdminOnly, c.getAiUsage)
router.get('/:id/members',                 c.getMembers)
router.get('/:id/tasks',                   c.projectTasks)
router.get('/:id/completed',               c.projectCompletedHistory)
router.post('/',                           workspaceAdminOnly, c.create)
router.put('/:id',                         workspaceAdminOnly, c.update)
router.put('/:id/links',                   c.saveLinks)
router.patch('/:id/situation',             c.saveSituation)

module.exports = router
