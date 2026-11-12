const router = require('express').Router()
const { getCounts } = require('../controllers/nav.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')

// Sin guards de módulo a nivel de router a propósito: un `requireFeatureFlag` o un
// `moduleAccessGuard` devolvería 403 para TODA la respuesta cuando a la persona le
// falta UNO de los módulos. El controller decide módulo por módulo y simplemente
// omite las claves que no le corresponden.
router.use(auth)
router.use(resolveWorkspace)

router.get('/counts', getCounts)

module.exports = router
