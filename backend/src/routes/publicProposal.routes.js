const express = require('express')
const router = express.Router()
const { getPublicProposal } = require('../controllers/ventas/proposals.controller')

// Sin auth — link público de solo lectura para compartir una propuesta con
// el cliente (mismo criterio que /api/public/report/:token).
router.get('/proposal/:token', getPublicProposal)

module.exports = router
