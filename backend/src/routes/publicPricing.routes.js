const express = require('express')
const router = express.Router()
const pricing = require('../controllers/pricing.controller')

// Sin auth — consumido por Landing.jsx y Pricing.jsx
router.get('/pricing', pricing.getPublicPricing)

module.exports = router
