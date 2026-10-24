const router = require('express').Router()
const { createPublicLead } = require('../controllers/ventas/publicLeadIntake.controller')

// Sin auth — intake público de Leads desde integraciones externas (ej. WP Webhooks +
// Contact Form 7). La identidad del workspace la da el token en la URL.
router.post('/leads/:token', createPublicLead)

module.exports = router
