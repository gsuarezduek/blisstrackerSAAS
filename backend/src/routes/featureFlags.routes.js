const express = require('express')
const router  = express.Router()
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')
const { checkFlag } = require('../controllers/featureFlags.controller')

// GET /api/feature-flags/:key — disponible para cualquier usuario autenticado
router.get('/:key', auth, resolveWorkspace, checkFlag)

module.exports = router
