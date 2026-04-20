const router = require('express').Router()
const multer = require('multer')
const c      = require('../controllers/avatars.controller')
const { auth } = require('../middleware/auth')

// Multer: guardar en memoria (los bytes van directo a la DB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 2 * 1024 * 1024 }, // 2MB máximo
})

// Ruta pública: sirve la imagen desde DB
router.get('/img/:filename', c.serveImage)

// Requiere auth: lista de avatares activos para el selector de perfil
router.get('/', auth, c.list)

module.exports = router
