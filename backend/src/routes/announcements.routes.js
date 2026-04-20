const router = require('express').Router()
const { getActive } = require('../controllers/announcements.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')

// Endpoint de lectura para usuarios autenticados (sin restricción de admin)
router.get('/active', auth, resolveWorkspace, getActive)

module.exports = router
