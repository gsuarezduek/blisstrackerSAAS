const express = require('express')
const router  = express.Router()
const { auth }             = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')
const geo = require('../controllers/geo.controller')

router.use(auth, resolveWorkspace)

// GEO
router.post('/geo/audit',      geo.runAudit)
router.get('/geo/audits',      geo.listAudits)
router.get('/geo/audits/:id',  geo.getAudit)

module.exports = router
