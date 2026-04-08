const router = require('express').Router()
const { login, me, forgotPassword, resetPassword, googleLogin, logout } = require('../controllers/auth.controller')
const { auth } = require('../middleware/auth')

router.post('/login', login)
router.get('/me', auth, me)
router.post('/logout', auth, logout)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)
router.post('/google', googleLogin)

module.exports = router
