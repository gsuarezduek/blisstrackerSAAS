const express = require('express')
const router  = express.Router()
const {
  getPortalBranding,
  getPortalData,
  getPortalReport,
  requestLoginCode,
  verifyLoginCode,
  magicLogin,
  getLiveData,
  refreshLiveData,
  servePortalBanner,
} = require('../controllers/clientPortal.controller')
const { serveContentAsset } = require('../controllers/contentAssets.controller')
const {
  listPortalPieces,
  getPortalPiece,
  approvePiece,
  requestChanges,
  addPortalComment,
} = require('../controllers/contentPortal.controller')
const { clientPortalAuth } = require('../middleware/clientPortalAuth')

// Sin auth — SOLO branding (nombre de proyecto + logo/color) para pintar la
// pantalla de login previa. Todo lo demás del portal (Informes, Briefs,
// Contenido, Datos en vivo) exige loguearse primero — ver getPortalData.
router.get('/client-portal/:slug/branding', getPortalBranding)
router.get('/client-portal-banner/:slug',   servePortalBanner)
router.post('/client-portal/:slug/live/request-code', requestLoginCode)
router.post('/client-portal/:slug/live/verify-code',  verifyLoginCode)
router.post('/client-portal/:slug/live/magic-login',  magicLogin)

// Sin auth — asset de una pieza de Contenido, servido por publicId no adivinable
// (mismo criterio que /api/social-image/:id). Vive acá y no en publicReport.routes.js
// porque el módulo Contenido cuelga del portal de cliente, no de los informes.
router.get('/content-asset/:publicId', serveContentAsset)

// Requieren el JWT de propósito acotado emitido tras el código OTP
router.get('/client-portal/:slug',                clientPortalAuth, getPortalData)
router.get('/client-portal/:slug/reports/:token',  clientPortalAuth, getPortalReport)
router.get('/client-portal/:slug/live',            clientPortalAuth, getLiveData)
router.post('/client-portal/:slug/live/refresh',   clientPortalAuth, refreshLiveData)

// Contenido — aprobación de piezas desde el portal. Mismo JWT; identidad de
// contacto (req.clientPortalContact) y el flag `contenido` se chequean dentro
// de cada handler (ver contentPortal.controller.js: assertContentAccess).
router.get ('/client-portal/:slug/content',                    clientPortalAuth, listPortalPieces)
router.get ('/client-portal/:slug/content/:pid',                clientPortalAuth, getPortalPiece)
router.post('/client-portal/:slug/content/:pid/approve',        clientPortalAuth, approvePiece)
router.post('/client-portal/:slug/content/:pid/request-changes', clientPortalAuth, requestChanges)
router.post('/client-portal/:slug/content/:pid/comments',       clientPortalAuth, addPortalComment)

module.exports = router
