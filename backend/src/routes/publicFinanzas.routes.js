const express = require('express')
const router = express.Router()
const { getInvoiceForPrint } = require('../controllers/finanzas/invoicePrint.controller')

// Sin auth — solo la abre el render de PDF headless (token firmado, vence en minutos).
// Mismo criterio que /api/public/report-print/:printToken.
router.get('/invoice-print/:printToken', getInvoiceForPrint)

module.exports = router
