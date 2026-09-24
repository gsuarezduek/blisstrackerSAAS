const router = require('express').Router()
const { globalSearch } = require('../controllers/search.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.get('/', globalSearch)

module.exports = router
