const router = require('express').Router()
const { getNotes, putNote } = require('../controllers/notes.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.get('/',       getNotes)
router.put('/:index', putNote)

module.exports = router
