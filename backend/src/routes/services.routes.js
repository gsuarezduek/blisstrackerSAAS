const router = require('express').Router()
const { list, listAll, create, update } = require('../controllers/services.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.get('/',      list)
router.get('/all',   listAll)
router.post('/',     workspaceAdminOnly, create)
router.put('/:id',   workspaceAdminOnly, update)

module.exports = router
