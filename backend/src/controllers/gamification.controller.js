const prisma = require('../lib/prisma')
const {
  GAME_TYPES, SUBJECT_TYPES, VISIBILITY_MODES, RECURRING_KINDS,
  MARKETING_METRICS, MARKETING_CATEGORIES,
  gameTypeDef, isValidGameType, marketingMetricDef, isValidMarketingMetric,
} = require('../lib/gameCatalog')
const { isGameVisible, computeLeaderboard, resolveWinner } = require('../services/gamification.service')
const { sendGameFinishedEmail } = require('../services/email.service')
const { validateImageUpload } = require('../lib/imageType')

const ADS_PLATFORMS = ['meta_ads', 'google_ads']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tzOf(req) { return req.workspace.timezone || 'America/Argentina/Buenos_Aires' }

// Campos de Game que devolvemos al cliente: TODOS menos los bytes de la imagen
// (imageData). Se usa `select` explícito en vez de `omit` para no depender de un
// preview feature de Prisma. Si agregás un campo a Game, sumalo acá.
const GAME_FIELDS = {
  id: true, workspaceId: true, type: true, title: true, description: true, prize: true,
  subjectType: true, scoring: true, config: true, visibilityRule: true,
  startDate: true, endDate: true, status: true, sortOrder: true, winnerSubject: true,
  imageMimeType: true, createdById: true, createdAt: true, updatedAt: true,
}
const GAME_SELECT = GAME_FIELDS
const GAME_SELECT_TEAMS = { ...GAME_FIELDS, teams: true }

async function findGame(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return null
  return prisma.game.findFirst({ where: { id, workspaceId: req.workspace.id }, select: GAME_SELECT })
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
    sortOrder: g.sortOrder ?? 0,
    winnerSubject: g.winnerSubject || null,
    hasImage: !!g.imageMimeType,
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
  const marketingMetrics = Object.entries(MARKETING_METRICS).map(([key, def]) => ({ key, ...def }))
  res.json({
    types,
    subjectTypes: SUBJECT_TYPES,
    recurringKinds: RECURRING_KINDS,
    marketingMetrics,
    marketingCategories: MARKETING_CATEGORIES,
  })
}

// ─── Admin: CRUD de juegos ────────────────────────────────────────────────────

/** GET /api/gamification/games — lista todos los juegos del workspace (admin) */
async function listGames(req, res, next) {
  try {
    const games = await prisma.game.findMany({
      where: { workspaceId: req.workspace.id },
      select: GAME_SELECT_TEAMS,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
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

    const metricError = validateMarketingConfig(def, req.body)
    if (metricError) return res.status(400).json({ error: metricError })

    // Los nuevos van al final del orden manual (no desplazan el orden ya definido).
    const last = await prisma.game.aggregate({ where: { workspaceId: req.workspace.id }, _max: { sortOrder: true } })
    const sortOrder = (last._max.sortOrder ?? -1) + 1

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
        sortOrder,
        createdById: req.user.userId,
      },
      select: GAME_SELECT_TEAMS,
    })
    res.status(201).json({ game: shapeGame(game, { teams: game.teams }) })
  } catch (err) { next(err) }
}

function sanitizeConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return {}
  const out = {}
  if (Array.isArray(cfg.candidateIds)) out.candidateIds = cfg.candidateIds.map(Number).filter(Number.isInteger)
  if (Array.isArray(cfg.projectIds))   out.projectIds = cfg.projectIds.map(Number).filter(Number.isInteger)
  if (typeof cfg.metric === 'string' && isValidMarketingMetric(cfg.metric)) out.metric = cfg.metric
  if (ADS_PLATFORMS.includes(cfg.adsPlatform)) out.adsPlatform = cfg.adsPlatform
  if (cfg.metricNote) out.metricNote = String(cfg.metricNote).slice(0, 500)
  // Votación a ciegas: por defecto los votos quedan ocultos hasta el cierre.
  // Solo guardamos el override explícito a `false` (mostrar en vivo).
  if (cfg.hideLiveResults === false) out.hideLiveResults = false
  return out
}

// Valida la métrica de una competencia de marketing. Devuelve string de error o null.
function validateMarketingConfig(def, body) {
  if (!def?.metricRequired) return null
  const metricKey = body.config?.metric
  const md = marketingMetricDef(metricKey)
  if (!md) return 'Elegí una métrica válida para la competencia'
  if (md.needsPlatform && !ADS_PLATFORMS.includes(body.config?.adsPlatform)) {
    return 'Para métricas de anuncios, elegí la plataforma (Meta Ads o Google Ads)'
  }
  return null
}

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

/** GET /api/gamification/games/:id (admin) — incluye leaderboard */
async function getGame(req, res, next) {
  try {
    const game = await prisma.game.findFirst({ where: { id: Number(req.params.id), workspaceId: req.workspace.id }, select: GAME_SELECT_TEAMS })
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    const leaderboard = await computeLeaderboard(game)
    const extra = await adminGameDetail(game)
    res.json({ game: shapeGame(game, { teams: game.teams }), leaderboard, ...extra })
  } catch (err) { next(err) }
}

// Detalle extra para el admin según el tipo de juego.
async function adminGameDetail(game) {
  const eligible = await activeMemberCount(game.workspaceId)

  if (game.scoring === 'vote') {
    // El voto es secreto: el admin ve cuántos votaron y el ranking, pero NO quién votó a quién.
    const voted = await prisma.gameVote.count({ where: { gameId: game.id } })
    return { participation: { voted, eligible } }
  }

  if (game.scoring === 'quiz') {
    const [questions, subs] = await Promise.all([
      prisma.gameQuestion.findMany({ where: { gameId: game.id }, orderBy: { order: 'asc' } }),
      prisma.gameQuizSubmission.findMany({ where: { gameId: game.id }, orderBy: { submittedAt: 'asc' } }),
    ])
    const names = await memberNameMap(game.workspaceId)
    const maxScore = questions.reduce((s, q) => s + (q.points || 0), 0)
    return {
      questions: questions.map(shapeQuestion),
      participation: { submitted: subs.length, eligible },
      maxScore,
      submissions: subs.map((s) => ({ userId: s.userId, userName: names.get(s.userId) || `Usuario ${s.userId}`, score: s.score, submittedAt: s.submittedAt })),
    }
  }
  return {}
}

async function activeMemberCount(workspaceId) {
  return prisma.workspaceMember.count({ where: { workspaceId, active: true } })
}
async function memberNameMap(workspaceId) {
  const members = await prisma.workspaceMember.findMany({ where: { workspaceId }, include: { user: { select: { id: true, name: true } } } })
  return new Map(members.map((m) => [m.userId, m.user?.name]))
}

// Pregunta para el admin (incluye la respuesta correcta).
function shapeQuestion(q) {
  return { id: q.id, order: q.order, text: q.text, options: Array.isArray(q.options) ? q.options : [], correctOptionId: q.correctOptionId, points: q.points }
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
    if (req.body.config !== undefined) {
      if (def?.metricRequired) {
        const metricError = validateMarketingConfig(def, req.body)
        if (metricError) return res.status(400).json({ error: metricError })
      }
      data.config = sanitizeConfig(req.body.config)
    }
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

    const updated = await prisma.game.update({ where: { id: game.id }, data, select: GAME_SELECT_TEAMS })
    res.json({ game: shapeGame(updated, { teams: updated.teams }) })
  } catch (err) { next(err) }
}

/**
 * PUT /api/gamification/games/reorder (admin)
 * Body: { orderedIds: number[] } — ids del workspace en el orden deseado.
 * Asigna sortOrder = índice a cada juego (los no listados quedan al final por createdAt).
 */
async function reorderGames(req, res, next) {
  try {
    const raw = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : null
    if (!raw) return res.status(400).json({ error: 'orderedIds debe ser un array' })
    const ids = [...new Set(raw.map(Number).filter(Number.isInteger))]

    // Solo se reordenan juegos del propio workspace (evita tocar ajenos).
    const owned = await prisma.game.findMany({
      where: { id: { in: ids }, workspaceId: req.workspace.id },
      select: { id: true },
    })
    const ownedIds = new Set(owned.map((g) => g.id))
    const finalOrder = ids.filter((id) => ownedIds.has(id))

    await prisma.$transaction(
      finalOrder.map((id, i) =>
        prisma.game.update({ where: { id }, data: { sortOrder: i } })),
    )
    res.json({ ok: true })
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
      select: GAME_SELECT_TEAMS,
    })
    // Notificar al equipo por email (fire-and-forget: nunca bloquea ni rompe el finish).
    notifyGameFinished(req.workspace, updated, winner).catch((e) => console.error('[Gamification] email ganador:', e.message))
    res.json({ game: shapeGame(updated, { teams: updated.teams }), winner })
  } catch (err) { next(err) }
}

// Envía el email de "juego finalizado" a todos los miembros activos del workspace.
async function notifyGameFinished(workspace, game, winner) {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id, active: true },
    select: { user: { select: { email: true } } },
  })
  const emails = members.map((m) => m.user?.email).filter(Boolean)
  if (!emails.length) return
  await sendGameFinishedEmail(emails, workspace.name, game, winner, process.env.FRONTEND_URL, workspace.id)
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
      // Finalizado: se sigue mostrando un tiempo para celebrar al ganador.
      return g.winnerSubject && (now - new Date(g.updatedAt)) <= RECENT_MS
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

    const out = []
    for (const g of shown) {
      const leaderboard = maskLeaderboard(g, await computeLeaderboard(g))
      out.push({
        ...shapeGame(g, { teams: g.teams }),
        finished: g.status === 'finished',
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

// ─── Cuestionario (quiz) ──────────────────────────────────────────────────────

/** PUT /api/gamification/games/:id/questions (admin) — reemplaza todas las preguntas */
async function putQuestions(req, res, next) {
  try {
    const game = await findGame(req)
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    if (game.scoring !== 'quiz') return res.status(400).json({ error: 'Este juego no es un cuestionario' })

    const incoming = Array.isArray(req.body.questions) ? req.body.questions : []
    const rows = []
    for (let i = 0; i < incoming.length; i++) {
      const q = incoming[i] || {}
      const text = String(q.text || '').trim()
      if (!text) return res.status(400).json({ error: `La pregunta ${i + 1} no tiene enunciado` })
      const options = (Array.isArray(q.options) ? q.options : [])
        .map((o, idx) => ({ id: String(o?.id || `o${idx + 1}`), text: String(o?.text || '').trim() }))
        .filter((o) => o.text)
      if (options.length < 2) return res.status(400).json({ error: `La pregunta ${i + 1} necesita al menos 2 opciones` })
      if (!options.some((o) => o.id === q.correctOptionId)) return res.status(400).json({ error: `Marcá la opción correcta de la pregunta ${i + 1}` })
      const points = Number(q.points) > 0 ? Number(q.points) : 1
      rows.push({ gameId: game.id, order: i, text, options, correctOptionId: q.correctOptionId, points })
    }

    await prisma.$transaction([
      prisma.gameQuestion.deleteMany({ where: { gameId: game.id } }),
      ...(rows.length ? [prisma.gameQuestion.createMany({ data: rows })] : []),
    ])
    res.json({ ok: true, count: rows.length })
  } catch (err) { next(err) }
}

// Pregunta para el usuario (oculta la respuesta correcta salvo que `reveal`).
function publicQuestion(q, reveal) {
  return {
    id: q.id, order: q.order, text: q.text, points: q.points,
    options: (Array.isArray(q.options) ? q.options : []).map((o) => ({ id: o.id, text: o.text })),
    ...(reveal ? { correctOptionId: q.correctOptionId } : {}),
  }
}

/** GET /api/gamification/games/:id/quiz (cualquier miembro) — preguntas sin la respuesta correcta */
async function getQuiz(req, res, next) {
  try {
    const game = await prisma.game.findFirst({ where: { id: Number(req.params.id), workspaceId: req.workspace.id }, select: GAME_SELECT })
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    if (game.scoring !== 'quiz') return res.status(400).json({ error: 'Este juego no es un cuestionario' })

    const [questions, mine] = await Promise.all([
      prisma.gameQuestion.findMany({ where: { gameId: game.id }, orderBy: { order: 'asc' } }),
      prisma.gameQuizSubmission.findUnique({ where: { gameId_userId: { gameId: game.id, userId: req.user.userId } } }),
    ])
    const reveal = !!mine || game.status === 'finished'
    res.json({
      game: shapeGame(game),
      open: isGameVisible(game, new Date(), tzOf(req)) && game.status === 'active' && !mine,
      submitted: !!mine,
      mySubmission: mine ? { score: mine.score, answers: mine.answers, submittedAt: mine.submittedAt } : null,
      maxScore: questions.reduce((s, q) => s + (q.points || 0), 0),
      questions: questions.map((q) => publicQuestion(q, reveal)),
    })
  } catch (err) { next(err) }
}

/** POST /api/gamification/games/:id/quiz/submit (cualquier miembro) — body { answers:[{questionId,optionId}] } */
async function submitQuiz(req, res, next) {
  try {
    const game = await prisma.game.findFirst({ where: { id: Number(req.params.id), workspaceId: req.workspace.id }, select: GAME_SELECT })
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    if (game.scoring !== 'quiz') return res.status(400).json({ error: 'Este juego no es un cuestionario' })
    if (!isGameVisible(game, new Date(), tzOf(req))) return res.status(400).json({ error: 'El cuestionario no está abierto en este momento' })

    const existing = await prisma.gameQuizSubmission.findUnique({ where: { gameId_userId: { gameId: game.id, userId: req.user.userId } } })
    if (existing) return res.status(400).json({ error: 'Ya respondiste este cuestionario' })

    const questions = await prisma.gameQuestion.findMany({ where: { gameId: game.id } })
    if (!questions.length) return res.status(400).json({ error: 'El cuestionario no tiene preguntas' })

    const answers = Array.isArray(req.body.answers) ? req.body.answers : []
    const ansMap = new Map(answers.map((a) => [String(a.questionId), String(a.optionId)]))
    let score = 0
    const results = questions.map((q) => {
      const chosen = ansMap.get(String(q.id)) || null
      const correct = chosen != null && chosen === q.correctOptionId
      if (correct) score += q.points || 0
      return { questionId: q.id, chosenOptionId: chosen, correctOptionId: q.correctOptionId, correct, points: q.points }
    })

    await prisma.gameQuizSubmission.create({
      data: { gameId: game.id, userId: req.user.userId, answers: answers.map((a) => ({ questionId: String(a.questionId), optionId: String(a.optionId) })), score },
    })
    res.json({ ok: true, score, maxScore: questions.reduce((s, q) => s + (q.points || 0), 0), results })
  } catch (err) { next(err) }
}

// ─── Imagen del juego ─────────────────────────────────────────────────────────

/** POST /api/gamification/games/:id/image (admin) — multipart, campo "image" */
async function uploadImage(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' })
    // Validar por contenido real (magic bytes), no por extensión ni Content-Type del cliente.
    const check = validateImageUpload(req.file.buffer, ['image/png', 'image/jpeg', 'image/webp'])
    if (!check.ok) return res.status(400).json({ error: 'Formato no soportado. Usá PNG, JPG o WebP.' })

    const r = await prisma.game.updateMany({
      where: { id: Number(req.params.id), workspaceId: req.workspace.id },
      data:  { imageData: req.file.buffer, imageMimeType: check.mimeType },
    })
    if (r.count === 0) return res.status(404).json({ error: 'Juego no encontrado' })
    res.json({ ok: true, hasImage: true })
  } catch (err) { next(err) }
}

/** DELETE /api/gamification/games/:id/image (admin) */
async function deleteImage(req, res, next) {
  try {
    const r = await prisma.game.updateMany({
      where: { id: Number(req.params.id), workspaceId: req.workspace.id },
      data:  { imageData: null, imageMimeType: null },
    })
    if (r.count === 0) return res.status(404).json({ error: 'Juego no encontrado' })
    res.json({ ok: true, hasImage: false })
  } catch (err) { next(err) }
}

/** GET /api/gamification/games/:id/image — sirve la imagen (público, sin auth, igual que avatares/logo) */
async function serveImage(req, res, next) {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(404).end()
    const game = await prisma.game.findUnique({ where: { id }, select: { imageData: true, imageMimeType: true } })
    if (!game?.imageData || !game.imageMimeType) return res.status(404).json({ error: 'Imagen no encontrada' })
    res.set('Content-Type', game.imageMimeType)
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(Buffer.from(game.imageData))
  } catch (err) { next(err) }
}

module.exports = {
  getCatalog,
  listGames, createGame, getGame, updateGame, reorderGames, deleteGame, finishGame,
  createTeam, updateTeam, deleteTeam,
  setScores,
  putQuestions, getQuiz, submitQuiz,
  getActive, getLeaderboard, castVote,
  uploadImage, deleteImage, serveImage,
}
