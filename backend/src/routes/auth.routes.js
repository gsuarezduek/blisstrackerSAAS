const router = require('express').Router()
const { login, me, forgotPassword, resetPassword, googleLogin, logout } = require('../controllers/auth.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')

router.post('/login', login)
router.post('/google', googleLogin)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)

// /me y /logout necesitan contexto de workspace para devolver datos del miembro
router.get('/me',     auth, resolveWorkspace, me)
router.post('/logout', auth, logout)

module.exports = router
