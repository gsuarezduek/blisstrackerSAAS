const router = require('express').Router()
const c = require('../controllers/whatsappMediaPublic.controller')

// Sin auth — ver whatsappMediaPublic.controller.js (URL pública no-adivinable).
router.get('/whatsapp-media/:id', c.serveMedia)

module.exports = router
