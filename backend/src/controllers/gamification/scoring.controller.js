const prisma = require('../../lib/prisma')
const { isGameVisible, computeLeaderboard } = require('../../services/gamification.service')
const { tzOf, GAME_SELECT, GAME_SELECT_TEAMS, findGame, shapeGame } = require('./_shared')

// ─── Admin: puntajes manuales ─────────────────────────────────────────────────

/** PUT /api/gamification/games/:id/scores (admin) — reemplaza todos los puntajes manuales */
async function setScores(req, res, next) {
  try {
    const game = await findGame(req)
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    if (game.scoring !== 'manual') return res.status(400).json({ error: 'Solo los juegos de puntaje manual aceptan carga de puntos' })

    const scores = Array.isArray(req.body.scores) ? req.body.scores : []
    const rows = scores
      .filter((s) => s && s.subjectId != null)
      .map((s) => ({
        gameId: game.id,
        subjectType: game.subjectType,
        subjectId: String(s.subjectId),
        label: s.label?.trim() || null,
        points: Number.isFinite(Number(s.points)) ? Number(s.points) : 0,
      }))

    await prisma.$transaction([
      prisma.gameScore.deleteMany({ where: { gameId: game.id } }),
      ...(rows.length ? [prisma.gameScore.createMany({ data: rows })] : []),
    ])
    const leaderboard = await computeLeaderboard(game)
    res.json({ ok: true, leaderboard })
  } catch (err) { next(err) }
}

// ─── Usuario: vista + votación ────────────────────────────────────────────────

// ¿Hay que ocultar el ranking a los usuarios? Aplica a votaciones en curso, salvo
// que el juego haya optado explícitamente por mostrar resultados en vivo.
function resultsHidden(game) {
  return game.scoring === 'vote' && game.status !== 'finished' && game.config?.hideLiveResults !== false
}

// Versión del leaderboard para los USUARIOS. En votaciones a ciegas oculta los
// puntajes y reordena por nombre (para no filtrar quién va ganando por el orden).
function maskLeaderboard(game, leaderboard) {
  if (!resultsHidden(game)) return leaderboard
  const subjects = [...(leaderboard.subjects || [])]
    .sort((a, b) => String(a.label).localeCompare(String(b.label)))
    .map(({ score, ...rest }) => rest)
  return { subjects, resultsHidden: true, totalVotes: leaderboard.totalVotes }
}

/** GET /api/gamification/active — juegos visibles ahora + finalizados recientes (alimenta el botón flotante) */
async function getActive(req, res, next) {
  try {
    const now = new Date(), tz = tzOf(req)
    const RECENT_MS = 7 * 24 * 60 * 60 * 1000 // los finalizados se muestran 7 días
    const games = await prisma.game.findMany({
      where: { workspaceId: req.workspace.id, status: { in: ['active', 'finished'] } },
      select: GAME_SELECT_TEAMS,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })
    const shown = games.filter((g) => {
      if (g.status === 'active') return isGameVisible(g, now, tz)
      // Finalizado: se sigue mostrando un tiempo para celebrar al ganador. La ventana se
      // mide desde finishedAt (no updatedAt), así editar/reordenar un finalizado no lo revive.
      // Los finalizados sin finishedAt (legacy) ya no se muestran.
      return g.winnerSubject && g.finishedAt && (now - new Date(g.finishedAt)) <= RECENT_MS
    })

    // Votos del usuario actual en estos juegos.
    const myVotes = await prisma.gameVote.findMany({
      where: { gameId: { in: shown.map((g) => g.id) }, voterId: req.user.userId },
    })
    const myVoteByGame = new Map(myVotes.map((v) => [v.gameId, v.targetUserId]))

    // Quiz: entrega del usuario + cantidad de preguntas por juego.
    const quizIds = shown.filter((g) => g.scoring === 'quiz').map((g) => g.id)
    const mySubs = quizIds.length ? await prisma.gameQuizSubmission.findMany({ where: { gameId: { in: quizIds }, userId: req.user.userId } }) : []
    const mySubByGame = new Map(mySubs.map((s) => [s.gameId, s]))
    const qCounts = quizIds.length ? await prisma.gameQuestion.groupBy({ by: ['gameId'], where: { gameId: { in: quizIds } }, _count: { _all: true } }) : []
    const qCountByGame = new Map(qCounts.map((c) => [c.gameId, c._count._all]))

    // "Nuevo" = todavía tiene sin leer la notificación GAME_LAUNCHED de este juego para
    // este usuario. Reutiliza esa notificación como único registro de "visto" (sin agregar
    // un modelo aparte) — el frontend la marca leída al abrir el flotante.
    const unseenLaunches = await prisma.notification.findMany({
      where: { userId: req.user.userId, workspaceId: req.workspace.id, type: 'GAME_LAUNCHED', read: false, gameId: { in: shown.map((g) => g.id) } },
      select: { gameId: true },
    })
    const newGameIds = new Set(unseenLaunches.map((n) => n.gameId))

    const out = []
    for (const g of shown) {
      const leaderboard = maskLeaderboard(g, await computeLeaderboard(g))
      out.push({
        ...shapeGame(g, { teams: g.teams }),
        finished: g.status === 'finished',
        isNew: newGameIds.has(g.id),
        leaderboard,
        ...(g.scoring === 'vote'
          ? { myVote: myVoteByGame.has(g.id) ? String(myVoteByGame.get(g.id)) : null }
          : {}),
        ...(g.scoring === 'quiz'
          ? { questionCount: qCountByGame.get(g.id) || 0, mySubmission: mySubByGame.has(g.id) ? { score: mySubByGame.get(g.id).score } : null }
          : {}),
      })
    }
    res.json({ count: out.length, games: out })
  } catch (err) { next(err) }
}

/** GET /api/gamification/games/:id/leaderboard (cualquier miembro) */
async function getLeaderboard(req, res, next) {
  try {
    const game = await prisma.game.findFirst({ where: { id: Number(req.params.id), workspaceId: req.workspace.id }, select: GAME_SELECT_TEAMS })
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    const leaderboard = maskLeaderboard(game, await computeLeaderboard(game))
    res.json({ game: shapeGame(game, { teams: game.teams }), leaderboard })
  } catch (err) { next(err) }
}

/** POST /api/gamification/games/:id/vote (cualquier miembro) — body { targetUserId } */
async function castVote(req, res, next) {
  try {
    const game = await prisma.game.findFirst({ where: { id: Number(req.params.id), workspaceId: req.workspace.id }, select: GAME_SELECT })
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    if (game.scoring !== 'vote') return res.status(400).json({ error: 'Este juego no es de votación' })
    if (!isGameVisible(game, new Date(), tzOf(req))) return res.status(400).json({ error: 'La votación no está abierta en este momento' })

    const targetUserId = Number(req.body.targetUserId)
    if (!Number.isInteger(targetUserId)) return res.status(400).json({ error: 'Falta a quién votar (targetUserId)' })
    if (targetUserId === req.user.userId) return res.status(400).json({ error: 'No podés votarte a vos mismo' })

    // El votado debe ser miembro activo (y candidato, si hay lista acotada).
    const target = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: req.workspace.id, userId: targetUserId } },
    })
    if (!target || !target.active) return res.status(400).json({ error: 'La persona votada no es un miembro activo' })

    const candidateIds = Array.isArray(game.config?.candidateIds) ? game.config.candidateIds.map(Number) : null
    if (candidateIds?.length && !candidateIds.includes(targetUserId)) {
      return res.status(400).json({ error: 'Esa persona no está entre los candidatos de este juego' })
    }

    await prisma.gameVote.upsert({
      where: { gameId_voterId: { gameId: game.id, voterId: req.user.userId } },
      update: { targetUserId },
      create: { gameId: game.id, voterId: req.user.userId, targetUserId },
    })

    const leaderboard = maskLeaderboard(game, await computeLeaderboard(game))
    res.json({ ok: true, myVote: String(targetUserId), leaderboard })
  } catch (err) { next(err) }
}

module.exports = { setScores, getActive, getLeaderboard, castVote }
