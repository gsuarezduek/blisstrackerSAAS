const router = require('express').Router()
const multer = require('multer')
const ctrl = require('../controllers/gamification.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')
const { requireFeatureFlag } = require('../lib/featureFlags')

const uploadImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

// ─── Pública (sin auth) — sirve la imagen del juego, igual que avatares/logo ──
router.get('/games/:id/image', ctrl.serveImage)

router.use(auth)
router.use(resolveWorkspace)
router.use(requireFeatureFlag('gamification'))

// ─── Cualquier miembro del workspace ──────────────────────────────────────────
router.get('/catalog', ctrl.getCatalog)
router.get('/active', ctrl.getActive)
router.get('/games/:id/leaderboard', ctrl.getLeaderboard)
router.post('/games/:id/vote', ctrl.castVote)
router.get('/games/:id/quiz', ctrl.getQuiz)
router.post('/games/:id/quiz/submit', ctrl.submitQuiz)

// ─── Solo admin/owner ─────────────────────────────────────────────────────────
router.get('/games', workspaceAdminOnly, ctrl.listGames)
router.post('/games', workspaceAdminOnly, ctrl.createGame)
router.put('/games/reorder', workspaceAdminOnly, ctrl.reorderGames)
router.get('/games/:id', workspaceAdminOnly, ctrl.getGame)
router.patch('/games/:id', workspaceAdminOnly, ctrl.updateGame)
router.delete('/games/:id', workspaceAdminOnly, ctrl.deleteGame)
router.post('/games/:id/finish', workspaceAdminOnly, ctrl.finishGame)
router.post('/games/:id/teams', workspaceAdminOnly, ctrl.createTeam)
router.patch('/games/:id/teams/:teamId', workspaceAdminOnly, ctrl.updateTeam)
router.delete('/games/:id/teams/:teamId', workspaceAdminOnly, ctrl.deleteTeam)
router.put('/games/:id/scores', workspaceAdminOnly, ctrl.setScores)
router.put('/games/:id/questions', workspaceAdminOnly, ctrl.putQuestions)
router.post('/games/:id/image', workspaceAdminOnly, uploadImage.single('image'), ctrl.uploadImage)
router.delete('/games/:id/image', workspaceAdminOnly, ctrl.deleteImage)

module.exports = router
