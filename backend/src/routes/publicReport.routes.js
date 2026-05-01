const express           = require('express')
const router            = express.Router()
const { getPublicReport } = require('../controllers/monthlyReport.controller')

// Sin auth — endpoint público para informes mensuales de clientes
router.get('/report/:token', getPublicReport)

module.exports = router
