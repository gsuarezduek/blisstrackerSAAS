const router = require('express').Router()
const { getOrCreateToday, finish } = require('../controllers/workdays.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.get('/today',   getOrCreateToday)
router.post('/finish', finish)

module.exports = router
