const router = require('express').Router()
const { snapshot } = require('../controllers/realtime.controller')
const { auth, adminOnly } = require('../middleware/auth')

router.get('/', auth, snapshot)

module.exports = router
