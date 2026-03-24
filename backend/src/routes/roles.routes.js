const router = require('express').Router()
const { list, create, remove } = require('../controllers/roles.controller')
const { auth, adminOnly } = require('../middleware/auth')

router.get('/',    auth, list)
router.post('/',   auth, adminOnly, create)
router.delete('/:id', auth, adminOnly, remove)

module.exports = router
