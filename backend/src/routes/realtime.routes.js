const router = require('express').Router()
const { snapshot } = require('../controllers/realtime.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.get('/', snapshot)

module.exports = router
