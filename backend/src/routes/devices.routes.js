const router = require('express').Router()
const { register, unregister } = require('../controllers/devices.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.post('/register',   register)
router.delete('/register', unregister)

module.exports = router
