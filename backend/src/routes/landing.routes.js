const router = require('express').Router()
const c = require('../controllers/landing.controller')

// Todas públicas — las consume la landing pública sin auth.
router.get('/content', c.getContent)
router.get('/trusted-companies', c.listTrustedCompanies)
router.get('/trusted-companies/:id/image', c.serveTrustedCompanyImage)
router.get('/testimonials', c.listTestimonials)
router.get('/testimonials/:id/image', c.serveTestimonialImage)

module.exports = router
