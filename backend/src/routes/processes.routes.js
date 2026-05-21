const router = require('express').Router()
const { listProcesses } = require('../controllers/processes.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.get('/', listProcesses)

module.exports = router
