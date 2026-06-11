const router = require('express').Router()
const c = require('../controllers/socialImage.controller')

// Ruta pública: sirve la imagen de RRSS cacheada desde DB (id = UUID)
router.get('/:id', c.serveImage)

module.exports = router
