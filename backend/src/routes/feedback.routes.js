const router = require('express').Router()
const { create } = require('../controllers/feedback.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

// Solo el alta. Leer y marcar leído viven en `/api/superadmin/feedback`: esto no
// es un buzón del workspace — ver la cabecera del controller.
router.post('/', create)

module.exports = router
