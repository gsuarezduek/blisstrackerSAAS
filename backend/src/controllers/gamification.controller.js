const prisma = require('../lib/prisma')
const {
  GAME_TYPES, SUBJECT_TYPES, VISIBILITY_MODES, RECURRING_KINDS,
  gameTypeDef, isValidGameType,
} = require('../lib/gameCatalog')
const { isGameVisible, computeLeaderboard, resolveWinner } = require('../services/gamification.service')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tzOf(req) { return req.workspace.timezone || 'America/Argentina/Buenos_Aires' }

async function findGame(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return null
  return prisma.game.findFirst({ where: { id, workspaceId: req.workspace.id } })
}

// Da forma a un juego para la respuesta (sin leaderboard).
function shapeGame(g, { teams } = {}) {
  return {
    id: g.id,
    type: g.type,
    typeName: gameTypeDef(g.type)?.name || g.type,
    title: g.title,
    description: g.description,
    prize: g.prize,
    subjectType: g.subjectType,
    scoring: g.scoring,
    config: g.config || {},
    visibilityRule: g.visibilityRule || {},
    startDate: g.startDate,
    endDate: g.endDate,
    status: g.status,
    winnerSubject: g.winnerSubject || null,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    ...(teams ? { teams: teams.map(shapeTeam) } : {}),
  }
}

function shapeTeam(t) {
  return {
    id: t.id,
    name: t.name,
    memberIds: Array.isArray(t.memberIds) ? t.memberIds : [],
    projectIds: Array.isArray(t.projectIds) ? t.projectIds : [],
  }
}

// Normaliza/valida la regla de visibilidad. Devuelve { error } o { rule }.
function validateVisibility(raw, def) {
  if (raw == null) return { rule: def?.defaultVisibility || { mode: 'always' } }
  if (typeof raw !== 'object') return { error: 'Regla de visibilidad inválida' }
  const mode = raw.mode || 'always'
  if (!VISIBILITY_MODES.includes(mode)) return { error: 'Modo de visibilidad inválido' }
  if (mode === 'recurring') {
    if (!RECURRING_KINDS.includes(raw.kind)) return { error: 'Tipo de ventana recurrente inválido' }
    return { rule: { mode, kind: raw.kind, n: raw.n, fromDay: raw.fromDay, toDay: raw.toDay, weekdays: raw.weekdays } }
  }
  return { rule: { mode } }
}

function parseDate(v) {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

// ─── Catálogo ─────────────────────────────────────────────────────────────────

/** GET /api/gamification/catalog */
function getCatalog(_req, res) {
  const types = Object.entries(GAME_TYPES).map(([key, def]) => ({ key, ...def }))
  res.json({ types, subjectTypes: SUBJECT_TYPES, recurringKinds: RECURRING_KINDS })
}

// ─── Admin: CRUD de juegos ────────────────────────────────────────────────────

/** GET /api/gamification/games — lista todos los juegos del workspace (admin) */
async function listGames(req, res, next) {
  try {
    const games = await prisma.game.findMany({
      where: { workspaceId: req.workspace.id },
      include: { teams: true },
      orderBy: { createdAt: 'desc' },
    })
    const now = new Date(), tz = tzOf(req)
    res.json({
      games: games.map((g) => ({ ...shapeGame(g, { teams: g.teams }), visibleNow: isGameVisible(g, now, tz) })),
    })
  } catch (err) { next(err) }
}

/** POST /api/gamification/games (admin) */
async function createGame(req, res, next) {
  try {
    const { type, title } = req.body
    if (!isValidGameType(type)) return res.status(400).json({ error: 'Tipo de juego inválido' })
    if (!title || !title.trim()) return res.status(400).json({ error: 'El enunciado (título) es obligatorio' })

    const def = gameTypeDef(type)
    let subjectType = def.subjectType
    if (def.subjectConfigurable) {
      subjectType = req.body.subjectType
      if (!SUBJECT_TYPES.includes(subjectType)) return res.status(400).json({ error: 'Tipo de sujeto inválido (project | person | team)' })
    }

    const { error: visError, rule } = validateVisibility(req.body.visibilityRule, def)
    if (visError) return res.status(400).json({ error: visError })

    const game = await prisma.game.create({
      data: {
        workspaceId: req.workspace.id,
        type,
        title: title.trim(),
        description: req.body.description?.trim() || null,
        prize: req.body.prize?.trim() || null,
        subjectType,
        scoring: def.scoring,
        config: sanitizeConfig(req.body.config),
        visibilityRule: rule,
        startDate: parseDate(req.body.startDate),
        endDate: parseDate(req.body.endDate),
        status: req.body.status === 'active' ? 'active' : 'draft',
        createdById: req.user.userId,
      },
      include: { teams: true },
    })
    res.status(201).json({ game: shapeGame(game, { teams: game.teams }) })
  } catch (err) { next(err) }
}

function sanitizeConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return {}
  const out = {}
  if (Array.isArray(cfg.candidateIds)) out.candidateIds = cfg.candidateIds.map(Number).filter(Number.isInteger)
  if (Array.isArray(cfg.projectIds))   out.projectIds = cfg.projectIds.map(Number).filter(Number.isInteger)
  if (cfg.metricNote) out.metricNote = String(cfg.metricNote).slice(0, 500)
  return out
}

/** GET /api/gamification/games/:id (admin) — incluye leaderboard */
async function getGame(req, res, next) {
  try {
    const game = await prisma.game.findFirst({ where: { id: Number(req.params.id), workspaceId: req.workspace.id }, include: { teams: true } })
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    const leaderboard = await computeLeaderboard(game)
    res.json({ game: shapeGame(game, { teams: game.teams }), leaderboard })
  } catch (err) { next(err) }
}

/** PATCH /api/gamification/games/:id (admin) */
async function updateGame(req, res, next) {
  try {
    const game = await findGame(req)
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })

    const def = gameTypeDef(game.type)
    const data = {}
    if (req.body.title !== undefined) {
      if (!req.body.title.trim()) return res.status(400).json({ error: 'El enunciado no puede quedar vacío' })
      data.title = req.body.title.trim()
    }
    if (req.body.description !== undefined) data.description = req.body.description?.trim() || null
    if (req.body.prize !== undefined) data.prize = req.body.prize?.trim() || null
    if (req.body.config !== undefined) data.config = sanitizeConfig(req.body.config)
    if (req.body.startDate !== undefined) data.startDate = parseDate(req.body.startDate)
    if (req.body.endDate !== undefined) data.endDate = parseDate(req.body.endDate)
    if (req.body.subjectType !== undefined && def?.subjectConfigurable) {
      if (!SUBJECT_TYPES.includes(req.body.subjectType)) return res.status(400).json({ error: 'Tipo de sujeto inválido' })
      data.subjectType = req.body.subjectType
    }
    if (req.body.visibilityRule !== undefined) {
      const { error, rule } = validateVisibility(req.body.visibilityRule, def)
      if (error) return res.status(400).json({ error })
      data.visibilityRule = rule
    }
    if (req.body.status !== undefined) {
      if (!['draft', 'active', 'finished', 'archived'].includes(req.body.status)) return res.status(400).json({ error: 'Estado inválido' })
      data.status = req.body.status
    }

    const updated = await prisma.game.update({ where: { id: game.id }, data, include: { teams: true } })
    res.json({ game: shapeGame(updated, { teams: updated.teams }) })
  } catch (err) { next(err) }
}

/** DELETE /api/gamification/games/:id (admin) */
async function deleteGame(req, res, next) {
  try {
    const r = await prisma.game.deleteMany({ where: { id: Number(req.params.id), workspaceId: req.workspace.id } })
    if (r.count === 0) return res.status(404).json({ error: 'Juego no encontrado' })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/** POST /api/gamification/games/:id/finish (admin) — resuelve ganador + finaliza */
async function finishGame(req, res, next) {
  try {
    const game = await findGame(req)
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    const winner = await resolveWinner(game)
    const updated = await prisma.game.update({
      where: { id: game.id },
      data: { status: 'finished', winnerSubject: winner },
      include: { teams: true },
    })
    res.json({ game: shapeGame(updated, { teams: updated.teams }), winner })
  } catch (err) { next(err) }
}

// ─── Admin: equipos custom ────────────────────────────────────────────────────

function parseTeamBody(body) {
  const name = body.name?.trim()
  if (!name) return { error: 'El nombre del equipo es obligatorio' }
  return {
    data: {
      name,
      memberIds: Array.isArray(body.memberIds) ? body.memberIds.map(Number).filter(Number.isInteger) : [],
      projectIds: Array.isArray(body.projectIds) ? body.projectIds.map(Number).filter(Number.isInteger) : [],
    },
  }
}

/** POST /api/gamification/games/:id/teams (admin) */
async function createTeam(req, res, next) {
  try {
    const game = await findGame(req)
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    const { error, data } = parseTeamBody(req.body)
    if (error) return res.status(400).json({ error })
    const team = await prisma.gameTeam.create({ data: { ...data, gameId: game.id } })
    res.status(201).json({ team: shapeTeam(team) })
  } catch (err) { next(err) }
}

/** PATCH /api/gamification/games/:id/teams/:teamId (admin) */
async function updateTeam(req, res, next) {
  try {
    const game = await findGame(req)
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    const { error, data } = parseTeamBody(req.body)
    if (error) return res.status(400).json({ error })
    const r = await prisma.gameTeam.updateMany({ where: { id: req.params.teamId, gameId: game.id }, data })
    if (r.count === 0) return res.status(404).json({ error: 'Equipo no encontrado' })
    const team = await prisma.gameTeam.findUnique({ where: { id: req.params.teamId } })
    res.json({ team: shapeTeam(team) })
  } catch (err) { next(err) }
}

/** DELETE /api/gamification/games/:id/teams/:teamId (admin) */
async function deleteTeam(req, res, next) {
  try {
    const game = await findGame(req)
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    const r = await prisma.gameTeam.deleteMany({ where: { id: req.params.teamId, gameId: game.id } })
    if (r.count === 0) return res.status(404).json({ error: 'Equipo no encontrado' })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

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

/** GET /api/gamification/active — juegos visibles ahora para el usuario (alimenta el botón flotante) */
async function getActive(req, res, next) {
  try {
    const now = new Date(), tz = tzOf(req)
    const games = await prisma.game.findMany({
      where: { workspaceId: req.workspace.id, status: 'active' },
      include: { teams: true },
      orderBy: { createdAt: 'desc' },
    })
    const visible = games.filter((g) => isGameVisible(g, now, tz))

    // Votos del usuario actual en estos juegos.
    const myVotes = await prisma.gameVote.findMany({
      where: { gameId: { in: visible.map((g) => g.id) }, voterId: req.user.userId },
    })
    const myVoteByGame = new Map(myVotes.map((v) => [v.gameId, v.targetUserId]))

    const out = []
    for (const g of visible) {
      const leaderboard = await computeLeaderboard(g)
      out.push({
        ...shapeGame(g, { teams: g.teams }),
        leaderboard,
        ...(g.scoring === 'vote'
          ? { myVote: myVoteByGame.has(g.id) ? String(myVoteByGame.get(g.id)) : null }
          : {}),
      })
    }
    res.json({ count: out.length, games: out })
  } catch (err) { next(err) }
}

/** GET /api/gamification/games/:id/leaderboard (cualquier miembro) */
async function getLeaderboard(req, res, next) {
  try {
    const game = await prisma.game.findFirst({ where: { id: Number(req.params.id), workspaceId: req.workspace.id }, include: { teams: true } })
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    const leaderboard = await computeLeaderboard(game)
    res.json({ game: shapeGame(game, { teams: game.teams }), leaderboard })
  } catch (err) { next(err) }
}

/** POST /api/gamification/games/:id/vote (cualquier miembro) — body { targetUserId } */
async function castVote(req, res, next) {
  try {
    const game = await prisma.game.findFirst({ where: { id: Number(req.params.id), workspaceId: req.workspace.id } })
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

    const leaderboard = await computeLeaderboard(game)
    res.json({ ok: true, myVote: String(targetUserId), leaderboard })
  } catch (err) { next(err) }
}

module.exports = {
  getCatalog,
  listGames, createGame, getGame, updateGame, deleteGame, finishGame,
  createTeam, updateTeam, deleteTeam,
  setScores,
  getActive, getLeaderboard, castVote,
}
