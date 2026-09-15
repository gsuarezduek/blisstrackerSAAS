const router = require('express').Router()
const c = require('../controllers/chatAttachmentPublic.controller')

// Sin auth — ver chatAttachmentPublic.controller.js (URL pública no-adivinable).
router.get('/chat-attachment/:id', c.serveAttachment)

module.exports = router
