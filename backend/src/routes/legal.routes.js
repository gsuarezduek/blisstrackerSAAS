const express = require('express')
const router  = express.Router()
const legal   = require('../controllers/legal.controller')

// Ruta pública — sin auth
router.get('/:key', legal.getDocument)

module.exports = router
