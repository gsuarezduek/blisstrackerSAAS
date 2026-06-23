// Motor de Gamification: visibilidad de juegos + cálculo de leaderboards.
//
// Las funciones de VISIBILIDAD son puras (sin DB) y están testeadas en
// tests/unit/gamification.service.test.js. Las de LEADERBOARD consultan Prisma.
//
// Cada juego es autónomo: su ranking se calcula al vuelo según su `scoring`.
//   - auto_metric : lee datos existentes (ej. delta de seguidores de IG por proyecto)
//   - vote        : cuenta GameVote por persona votada
//   - manual      : lee GameScore (puntos cargados por el admin)

const prisma = require('../lib/prisma')
const { gameTypeDef } = require('../lib/gameCatalog')

// ─── Helpers de fecha en la timezone del workspace ────────────────────────────

/** Devuelve { y, m, d, weekday } de `date` en la timezone `tz`. m es 1-12, weekday 0=Dom..6=Sáb. */
function localParts(date, tz) {
  const d = date instanceof Date ? date : new Date(date)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  })
  const parts = fmt.formatToParts(d)
  const get = (t) => parts.find((p) => p.type === t)?.value
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    weekday: WD[get('weekday')] ?? 0,
  }
}

/** Cantidad de días del mes `m` (1-12) del año `y`. */
function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate() }

/** "YYYY-MM-DD" de `date` en la timezone `tz`. */
function ymdString(date, tz) {
  const { y, m, d } = localParts(date, tz)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// ─── Motor de visibilidad (puro) ──────────────────────────────────────────────

/**
 * ¿El juego está visible para los usuarios en este momento?
 * Solo los juegos `active` pueden estar visibles; la regla decide la ventana.
 *   - always      : siempre (mientras esté activo)
 *   - date_range  : entre startDate y endDate (inclusive)
 *   - recurring   : ventana recurrente del mes/semana (ver isInRecurringWindow)
 */
function isGameVisible(game, now = new Date(), tz = 'America/Argentina/Buenos_Aires') {
  if (!game || game.status !== 'active') return false
  const rule = game.visibilityRule || {}
  const mode = rule.mode || 'always'

  if (mode === 'always') return true

  if (mode === 'date_range') {
    if (game.startDate && now < new Date(game.startDate)) return false
    if (game.endDate && now > endOfDay(game.endDate)) return false
    return true
  }

  if (mode === 'recurring') return isInRecurringWindow(rule, now, tz)

  return true
}

/** endDate se interpreta inclusive: hasta el final de ese día (UTC del valor guardado). */
function endOfDay(date) {
  const d = new Date(date)
  // Si vino sin hora (medianoche UTC), extender al final del día para incluirlo.
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1)
  }
  return d
}

/**
 * Ventanas recurrentes, evaluadas en la timezone del workspace:
 *   - last_n_days_of_month  : últimos `n` días del mes (ej. n=7 → última semana)
 *   - first_n_days_of_month : primeros `n` días del mes
 *   - day_range_of_month    : entre `fromDay` y `toDay` (inclusive)
 *   - weekdays              : ciertos días de la semana (`weekdays`: [0-6], 0=Dom)
 */
function isInRecurringWindow(rule, now = new Date(), tz = 'America/Argentina/Buenos_Aires') {
  const { y, m, d, weekday } = localParts(now, tz)
  const dim = daysInMonth(y, m)

  switch (rule.kind) {
    case 'last_n_days_of_month': {
      const n = clampInt(rule.n, 1, 28, 7)
      return d >= dim - n + 1
    }
    case 'first_n_days_of_month': {
      const n = clampInt(rule.n, 1, 28, 7)
      return d <= n
    }
    case 'day_range_of_month': {
      const from = clampInt(rule.fromDay, 1, 31, 1)
      const to = clampInt(rule.toDay, 1, 31, dim)
      return d >= from && d <= Math.min(to, dim)
    }
    case 'weekdays': {
      const days = Array.isArray(rule.weekdays) ? rule.weekdays : []
      return days.includes(weekday)
    }
    default:
      return true
  }
}

function clampInt(v, min, max, def) {
  const n = Number(v)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.round(n)))
}

// ─── Leaderboards (consultan DB) ──────────────────────────────────────────────

/**
 * Calcula el ranking de un juego. Devuelve:
 *   { subjects: [{ subjectId, label, score, detail }], warnings: [str], totalVotes? }
 * Los subjects vienen ordenados de mejor a peor según la dirección del tipo.
 */
async function computeLeaderboard(game) {
  if (game.scoring === 'vote')        return leaderboardVote(game)
  if (game.scoring === 'manual')      return leaderboardManual(game)
  if (game.scoring === 'auto_metric') return leaderboardAutoMetric(game)
  return { subjects: [], warnings: [] }
}

/** Votación: cuenta votos por persona candidata. */
async function leaderboardVote(game) {
  const cfg = game.config || {}
  const candidateIds = Array.isArray(cfg.candidateIds) ? cfg.candidateIds.map(Number) : null

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: game.workspaceId, active: true },
    include: { user: { select: { id: true, name: true, avatar: true } } },
  })
  const candidates = candidateIds?.length
    ? members.filter((mm) => candidateIds.includes(mm.userId))
    : members

  const votes = await prisma.gameVote.findMany({ where: { gameId: game.id } })
  const tally = new Map()
  for (const v of votes) tally.set(v.targetUserId, (tally.get(v.targetUserId) || 0) + 1)

  const subjects = candidates.map((mm) => ({
    subjectId: String(mm.userId),
    label: mm.user?.name || `Usuario ${mm.userId}`,
    avatar: mm.user?.avatar || null,
    score: tally.get(mm.userId) || 0,
    detail: {},
  }))
  subjects.sort((a, b) => b.score - a.score)
  return { subjects, warnings: [], totalVotes: votes.length }
}

/** Manual: lee los puntos cargados por el admin. */
async function leaderboardManual(game) {
  const rows = await prisma.gameScore.findMany({ where: { gameId: game.id } })
  const labels = await resolveSubjectLabels(game, rows.map((r) => r.subjectId))
  const subjects = rows.map((r) => ({
    subjectId: r.subjectId,
    label: r.label || labels.get(r.subjectId) || r.subjectId,
    score: r.points,
    detail: r.detail || {},
  }))
  subjects.sort((a, b) => b.score - a.score)
  return { subjects, warnings: [] }
}

/** Auto por métrica. Hoy: instagram_followers (delta de seguidores por proyecto en el período). */
async function leaderboardAutoMetric(game) {
  const def = gameTypeDef(game.type)
  if (def?.metric === 'instagram_followers') return leaderboardInstagramFollowers(game)
  return { subjects: [], warnings: ['Métrica automática no soportada'] }
}

async function leaderboardInstagramFollowers(game) {
  const tz = await workspaceTz(game.workspaceId)
  const cfg = game.config || {}
  const projectIds = Array.isArray(cfg.projectIds) ? cfg.projectIds.map(Number) : null

  const projects = await prisma.project.findMany({
    where: { workspaceId: game.workspaceId, active: true, ...(projectIds?.length ? { id: { in: projectIds } } : {}) },
    select: { id: true, name: true },
  })

  // Período: el delta se mide entre startDate y endDate (inclusive). Sin período
  // medimos sobre todos los logs disponibles.
  const fromStr = game.startDate ? ymdString(game.startDate, tz) : null
  const toStr   = game.endDate ? ymdString(game.endDate, tz) : null

  const warnings = []
  const subjects = []

  for (const p of projects) {
    const logs = await prisma.instagramFollowerLog.findMany({
      where: {
        projectId: p.id,
        ...(fromStr || toStr ? { date: { ...(fromStr ? { gte: fromStr } : {}), ...(toStr ? { lte: toStr } : {}) } } : {}),
      },
      orderBy: { date: 'asc' },
    })

    if (logs.length < 2) {
      subjects.push({ subjectId: String(p.id), label: p.name, score: 0, detail: { startFollowers: logs[0]?.followersCount ?? null, endFollowers: logs[0]?.followersCount ?? null, insufficientData: true } })
      warnings.push(`${p.name}: sin datos suficientes de Instagram en el período`)
      continue
    }

    const start = logs[0].followersCount
    const end = logs[logs.length - 1].followersCount
    subjects.push({
      subjectId: String(p.id),
      label: p.name,
      score: end - start,
      detail: { startFollowers: start, endFollowers: end, startDate: logs[0].date, endDate: logs[logs.length - 1].date },
    })
  }

  subjects.sort((a, b) => b.score - a.score)
  return { subjects, warnings }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function workspaceTz(workspaceId) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } })
  return ws?.timezone || 'America/Argentina/Buenos_Aires'
}

/** Resuelve etiquetas (nombres) para una lista de subjectId según el subjectType del juego. */
async function resolveSubjectLabels(game, subjectIds) {
  const map = new Map()
  if (!subjectIds.length) return map
  const ids = subjectIds.map(Number).filter(Number.isFinite)

  if (game.subjectType === 'project') {
    const rows = await prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    rows.forEach((r) => map.set(String(r.id), r.name))
  } else if (game.subjectType === 'person') {
    const rows = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    rows.forEach((r) => map.set(String(r.id), r.name))
  } else if (game.subjectType === 'team') {
    const rows = await prisma.gameTeam.findMany({ where: { gameId: game.id } })
    rows.forEach((r) => map.set(r.id, r.name))
  }
  return map
}

/**
 * Resuelve el ganador de un juego a partir de su leaderboard.
 * Devuelve { subjectId, label, score } o null si no hay puntaje > 0.
 */
async function resolveWinner(game) {
  const { subjects } = await computeLeaderboard(game)
  const top = subjects[0]
  if (!top || top.score <= 0) return null
  return { subjectId: top.subjectId, label: top.label, score: top.score }
}

module.exports = {
  // visibilidad (puro)
  isGameVisible, isInRecurringWindow, localParts, daysInMonth, ymdString,
  // leaderboards (DB)
  computeLeaderboard, resolveWinner, resolveSubjectLabels,
}
