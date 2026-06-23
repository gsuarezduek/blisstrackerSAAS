const router = require('express').Router()
const ctrl = require('../controllers/gamification.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

// ─── Cualquier miembro del workspace ──────────────────────────────────────────
router.get('/catalog', ctrl.getCatalog)
router.get('/active', ctrl.getActive)
router.get('/games/:id/leaderboard', ctrl.getLeaderboard)
router.post('/games/:id/vote', ctrl.castVote)

// ─── Solo admin/owner ─────────────────────────────────────────────────────────
router.get('/games', workspaceAdminOnly, ctrl.listGames)
router.post('/games', workspaceAdminOnly, ctrl.createGame)
router.get('/games/:id', workspaceAdminOnly, ctrl.getGame)
router.patch('/games/:id', workspaceAdminOnly, ctrl.updateGame)
router.delete('/games/:id', workspaceAdminOnly, ctrl.deleteGame)
router.post('/games/:id/finish', workspaceAdminOnly, ctrl.finishGame)
router.post('/games/:id/teams', workspaceAdminOnly, ctrl.createTeam)
router.patch('/games/:id/teams/:teamId', workspaceAdminOnly, ctrl.updateTeam)
router.delete('/games/:id/teams/:teamId', workspaceAdminOnly, ctrl.deleteTeam)
router.put('/games/:id/scores', workspaceAdminOnly, ctrl.setScores)

module.exports = router
