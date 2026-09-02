const router = require('express').Router()
const multer = require('multer')
const ctrl = require('../controllers/gamification.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')
const { requireFeatureFlag } = require('../lib/featureFlags')
const { moduleAccessGuard } = require('../lib/moduleAccess')

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
router.get('/games', moduleAccessGuard('gamification'), ctrl.listGames)
router.post('/games', moduleAccessGuard('gamification'), ctrl.createGame)
router.put('/games/reorder', moduleAccessGuard('gamification'), ctrl.reorderGames)
router.get('/games/:id', moduleAccessGuard('gamification'), ctrl.getGame)
router.patch('/games/:id', moduleAccessGuard('gamification'), ctrl.updateGame)
router.delete('/games/:id', moduleAccessGuard('gamification'), ctrl.deleteGame)
router.post('/games/:id/finish', moduleAccessGuard('gamification'), ctrl.finishGame)
router.post('/games/:id/teams', moduleAccessGuard('gamification'), ctrl.createTeam)
router.patch('/games/:id/teams/:teamId', moduleAccessGuard('gamification'), ctrl.updateTeam)
router.delete('/games/:id/teams/:teamId', moduleAccessGuard('gamification'), ctrl.deleteTeam)
router.put('/games/:id/scores', moduleAccessGuard('gamification'), ctrl.setScores)
router.put('/games/:id/questions', moduleAccessGuard('gamification'), ctrl.putQuestions)
router.post('/games/:id/image', moduleAccessGuard('gamification'), uploadImage.single('image'), ctrl.uploadImage)
router.delete('/games/:id/image', moduleAccessGuard('gamification'), ctrl.deleteImage)

module.exports = router
