const express = require('express')
const multer  = require('multer')
const router  = express.Router()
const { auth } = require('../middleware/auth')
const c   = require('../controllers/superadmin.controller')
const ann = require('../controllers/announcements.controller')
const av  = require('../controllers/avatars.controller')

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 2 * 1024 * 1024 }, // 2MB
})

function superAdminOnly(req, res, next) {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ error: 'Acceso restringido a super administradores' })
  }
  next()
}

router.use(auth)
router.use(superAdminOnly)

router.get('/stats',                    c.getStats)
router.get('/workspaces',               c.listWorkspaces)
router.get('/workspaces/:id',           c.getWorkspace)
router.patch('/workspaces/:id/status',  c.updateWorkspaceStatus)
router.post('/impersonate',             c.impersonate)
router.get('/feedback',                 c.listFeedback)
router.put('/feedback/:id/read',        c.markFeedbackRead)
router.get('/email-logs',               c.listEmailLogs)

// Anuncios
router.get('/announcements',              ann.listAll)
router.post('/announcements',             ann.create)
router.patch('/announcements/:id',        ann.update)
router.patch('/announcements/:id/toggle', ann.toggle)
router.delete('/announcements/:id',       ann.remove)

// Avatares
router.get('/avatars',                      av.listAll)
router.post('/avatars',                     upload.single('image'), av.upload)
router.patch('/avatars/reorder',            av.reorder)
router.patch('/avatars/:id',                av.update)
router.patch('/avatars/:id/toggle',         av.toggle)
router.delete('/avatars/:id',               av.remove)

module.exports = router
