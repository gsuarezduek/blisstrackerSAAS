// Endpoints públicos de Mailing (pixel, clic, baja). Montados en /api/public.
const express = require('express')
const router = express.Router()
const pub = require('../controllers/mailing/public.controller')

router.get('/mailing/o/:token', pub.openPixel)
router.get('/mailing/c/:token/:idx', pub.clickRedirect)
router.get('/mailing/u/:token', pub.unsubscribeInfo)
router.post('/mailing/u/:token', pub.unsubscribePost)

module.exports = router
