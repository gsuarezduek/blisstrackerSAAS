const router = require('express').Router()
const { list, markAllRead } = require('../controllers/notifications.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.get('/',          list)
router.post('/read-all', markAllRead)

module.exports = router
