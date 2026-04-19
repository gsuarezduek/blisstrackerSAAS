const router = require('express').Router()
const { login, me, forgotPassword, resetPassword, googleLogin, switchWorkspace, logout } = require('../controllers/auth.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')
const prisma = require('../lib/prisma')

router.post('/login',             login)
router.post('/google',            googleLogin)
router.post('/forgot-password',   forgotPassword)
router.post('/reset-password',    resetPassword)
router.post('/switch-workspace',  auth, switchWorkspace)

// Verificar si un email ya tiene cuenta (público, para el formulario de registro)
router.get('/check-email', async (req, res) => {
  const { email } = req.query
  if (!email) return res.status(400).json({ error: 'Email requerido' })
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  res.json({ exists: !!user })
})

// /me y /logout necesitan contexto de workspace para devolver datos del miembro
router.get('/me',      auth, resolveWorkspace, me)
router.post('/logout', auth, logout)

module.exports = router
