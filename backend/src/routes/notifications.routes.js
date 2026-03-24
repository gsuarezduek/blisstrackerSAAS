const router = require('express').Router()
const { list, markAllRead } = require('../controllers/notifications.controller')
const { auth } = require('../middleware/auth')

router.use(auth)
router.get('/',         list)
router.post('/read-all', markAllRead)

module.exports = router
