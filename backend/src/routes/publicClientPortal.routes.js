const express = require('express')
const router  = express.Router()
const {
  getPortalPublic,
  requestLoginCode,
  verifyLoginCode,
  getLiveData,
  refreshLiveData,
} = require('../controllers/clientPortal.controller')
const { clientPortalAuth } = require('../middleware/clientPortalAuth')

// Sin auth — portal de cliente (Informes + Briefs abiertos)
router.get('/client-portal/:slug', getPortalPublic)
router.post('/client-portal/:slug/live/request-code', requestLoginCode)
router.post('/client-portal/:slug/live/verify-code',  verifyLoginCode)

// Requieren el JWT de propósito acotado emitido tras el código OTP
router.get('/client-portal/:slug/live',           clientPortalAuth, getLiveData)
router.post('/client-portal/:slug/live/refresh',  clientPortalAuth, refreshLiveData)

module.exports = router
