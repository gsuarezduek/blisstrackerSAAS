const prisma = require('../../lib/prisma')
const {
  GAME_TYPES, SUBJECT_TYPES, VISIBILITY_MODES, RECURRING_KINDS,
  MARKETING_METRICS, MARKETING_CATEGORIES,
  gameTypeDef, isValidGameType, marketingMetricDef, isValidMarketingMetric,
} = require('../../lib/gameCatalog')
const { isGameVisible, computeLeaderboard, resolveWinner } = require('../../services/gamification.service')
const { sendGameFinishedEmail } = require('../../services/email.service')
const {
  tzOf, GAME_SELECT_TEAMS, findGame, shapeGame,
  quizParticipationPoints, reconcileOrphanAnswers,
} = require('./_shared')

const ADS_PLATFORMS = ['meta_ads', 'google_ads']

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

    // Por defecto el más nuevo va primero (arriba); un reordenamiento manual desde
    // Activos (▲▼) puede moverlo, pero el próximo juego que se cree vuelve a ir arriba.
    const first = await prisma.game.aggregate({ where: { workspaceId: req.workspace.id }, _min: { sortOrder: true } })
    const sortOrder = (first._min.sortOrder ?? 1) - 1

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
    // Si nace ya activo, es un lanzamiento: avisar al equipo (fire-and-forget).
    if (game.status === 'active') {
      notifyGameLaunched(req.workspace, game, req.user.userId).catch((e) => console.error('[Gamification] notif lanzamiento:', e.message))
    }
    res.status(201).json({ game: shapeGame(game, { teams: game.teams }) })
  } catch (err) { next(err) }
}

// Notifica in-app a todo el equipo activo (menos quien lo lanzó) cuando un juego pasa a
// 'active' — al crearlo directamente activo, o al pasar un borrador a activo después.
async function notifyGameLaunched(workspace, game, actorId) {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id, active: true, userId: { not: actorId } },
    select: { userId: true },
  })
  if (members.length === 0) return
  const title = game.title.length > 60 ? game.title.slice(0, 57) + '...' : game.title
  await prisma.notification.createMany({
    data: members.map((m) => ({
      userId:      m.userId,
      actorId,
      workspaceId: workspace.id,
      gameId:      game.id,
      type:        'GAME_LAUNCHED',
      message:     `lanzó un nuevo juego: "${title}"`,
    })),
  })
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
  // Cuestionario con/sin puntaje: por defecto suma puntos (withPoints ausente = true).
  if (typeof cfg.withPoints === 'boolean') out.withPoints = cfg.withPoints
  // Puntos extra por participar (independiente de acertar): se suman al puntaje de
  // cada entrega. Útil sobre todo en cuestionarios sin puntaje por acierto (encuestas
  // de preferencia) para igual poder premiar la participación.
  const pp = Number(cfg.participationPoints)
  if (Number.isFinite(pp) && pp > 0) out.participationPoints = pp
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
    const maxScore = questions.reduce((s, q) => s + (q.points || 0), 0) + quizParticipationPoints(game)
    const questionIds = new Set(questions.map((q) => String(q.id)))
    const optionToQuestionId = new Map()
    for (const q of questions) {
      for (const o of (Array.isArray(q.options) ? q.options : [])) optionToQuestionId.set(String(o.id), String(q.id))
    }
    return {
      questions: questions.map(shapeQuestion),
      participation: { submitted: subs.length, eligible },
      maxScore,
      submissions: subs.map((s) => ({
        userId: s.userId,
        userName: names.get(s.userId) || `Usuario ${s.userId}`,
        score: s.score,
        submittedAt: s.submittedAt,
        // Respuesta de cada persona a cada pregunta (opción elegida o texto libre), para
        // que el admin vea "quién respondió qué" — clave en cuestionarios sin puntaje.
        // reconcileOrphanAnswers repara entregas de una versión anterior del cuestionario.
        answers: reconcileOrphanAnswers(
          (Array.isArray(s.answers) ? s.answers : []).filter(Boolean),
          questions, questionIds, optionToQuestionId,
        ),
      })),
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
  return { id: q.id, order: q.order, kind: q.kind || 'multiple_choice', text: q.text, options: Array.isArray(q.options) ? q.options : [], correctOptionId: q.correctOptionId, points: q.points }
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

    const isLaunch = data.status === 'active' && game.status !== 'active'
    const updated = await prisma.game.update({ where: { id: game.id }, data, select: GAME_SELECT_TEAMS })
    // Pasó de no-activo a activo: es un lanzamiento (primera vez o relanzamiento).
    if (isLaunch) {
      notifyGameLaunched(req.workspace, updated, req.user.userId).catch((e) => console.error('[Gamification] notif lanzamiento:', e.message))
    }
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
      data: { status: 'finished', winnerSubject: winner, finishedAt: new Date() },
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

module.exports = {
  getCatalog,
  listGames, createGame, getGame, updateGame, reorderGames, deleteGame, finishGame,
}
