const router = require('express').Router()
const multer = require('multer')
const gamesCrud = require('../controllers/gamification/gamesCrud.controller')
const teams = require('../controllers/gamification/teams.controller')
const quiz = require('../controllers/gamification/quiz.controller')
const scoring = require('../controllers/gamification/scoring.controller')
const image = require('../controllers/gamification/image.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')
const { requireFeatureFlag } = require('../lib/featureFlags')

const uploadImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

// ─── Pública (sin auth) — sirve la imagen del juego, igual que avatares/logo ──
router.get('/games/:id/image', image.serveImage)

router.use(auth)
router.use(resolveWorkspace)
router.use(requireFeatureFlag('gamification'))

// ─── Cualquier miembro del workspace ──────────────────────────────────────────
router.get('/catalog', gamesCrud.getCatalog)
router.get('/active', scoring.getActive)
router.get('/games/:id/leaderboard', scoring.getLeaderboard)
router.post('/games/:id/vote', scoring.castVote)
router.get('/games/:id/quiz', quiz.getQuiz)
router.post('/games/:id/quiz/submit', quiz.submitQuiz)

// ─── Solo admin/owner ─────────────────────────────────────────────────────────
router.get('/games', workspaceAdminOnly, gamesCrud.listGames)
router.post('/games', workspaceAdminOnly, gamesCrud.createGame)
router.put('/games/reorder', workspaceAdminOnly, gamesCrud.reorderGames)
router.get('/games/:id', workspaceAdminOnly, gamesCrud.getGame)
router.patch('/games/:id', workspaceAdminOnly, gamesCrud.updateGame)
router.delete('/games/:id', workspaceAdminOnly, gamesCrud.deleteGame)
router.post('/games/:id/finish', workspaceAdminOnly, gamesCrud.finishGame)
router.post('/games/:id/teams', workspaceAdminOnly, teams.createTeam)
router.patch('/games/:id/teams/:teamId', workspaceAdminOnly, teams.updateTeam)
router.delete('/games/:id/teams/:teamId', workspaceAdminOnly, teams.deleteTeam)
router.put('/games/:id/scores', workspaceAdminOnly, scoring.setScores)
router.put('/games/:id/questions', workspaceAdminOnly, quiz.putQuestions)
router.post('/games/:id/image', workspaceAdminOnly, uploadImage.single('image'), image.uploadImage)
router.delete('/games/:id/image', workspaceAdminOnly, image.deleteImage)

module.exports = router
