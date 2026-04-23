const express  = require('express')
const router   = express.Router()
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')
const c = require('../controllers/billing.controller')

router.use(auth, resolveWorkspace)

router.get('/status',   c.getStatus)
router.post('/checkout', c.createCheckout)
router.post('/portal',   c.createPortal)
router.post('/sync',     c.syncFromStripe)   // re-sincroniza estado desde Stripe (post-checkout)
router.get('/invoices',  c.getInvoices)       // historial de facturas (admin/owner)

module.exports = router
