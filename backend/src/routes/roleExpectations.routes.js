const router = require('express').Router()
const { list, getByRole, upsert, getMyRoleExpectation } = require('../controllers/roleExpectations.controller')
const { auth, adminOnly } = require('../middleware/auth')

router.get('/mine',        auth, getMyRoleExpectation)   // cualquier usuario autenticado
router.get('/',            auth, adminOnly, list)
router.get('/:roleName',   auth, adminOnly, getByRole)
router.put('/:roleName',   auth, adminOnly, upsert)

module.exports = router
