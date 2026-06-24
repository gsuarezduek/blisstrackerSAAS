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
const { marketingMetricDef } = require('../lib/gameCatalog')

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

/**
 * Auto por métrica (tipo marketing_project_competition). La métrica concreta sale
 * de `game.config.metric` (catálogo MARKETING_METRICS). Compatibilidad: un juego
 * legacy del tipo viejo `instagram_followers_competition` se mapea a seguidores IG.
 */
async function leaderboardAutoMetric(game) {
  const metricKey = game.config?.metric
    || (game.type === 'instagram_followers_competition' ? 'followers_instagram' : null)
  const metric = marketingMetricDef(metricKey)
  if (!metric) return { subjects: [], warnings: ['La competencia no tiene una métrica configurada'] }

  const tz = await workspaceTz(game.workspaceId)
  const cfg = game.config || {}
  const projectIds = Array.isArray(cfg.projectIds) ? cfg.projectIds.map(Number) : null
  const projects = await prisma.project.findMany({
    where: { workspaceId: game.workspaceId, active: true, ...(projectIds?.length ? { id: { in: projectIds } } : {}) },
    select: { id: true, name: true, domainRating: true },
  })
  const months = monthsBetween(game.startDate, game.endDate, tz)

  const warnings = []
  const subjects = []
  for (const p of projects) {
    let r
    try { r = await marketingMetricValue(metric, p, game, months, tz) }
    catch { r = { value: null, detail: { error: true } } }

    if (r.value == null) {
      subjects.push({ subjectId: String(p.id), label: p.name, score: 0, detail: { ...r.detail, noData: true } })
      warnings.push(`${p.name}: sin datos para esta métrica en el período`)
      continue
    }
    subjects.push({ subjectId: String(p.id), label: p.name, score: r.value, detail: r.detail })
  }

  subjects.sort((a, b) => b.score - a.score)
  return { subjects, warnings, metric: { key: metricKey, label: metric.label, unit: metric.unit, growth: !!metric.growth } }
}

// Tabla de modelos de log diario de seguidores por red (nombres del client Prisma).
const FOLLOWER_LOG = {
  instagram: 'instagramFollowerLog',
  tiktok:    'tikTokFollowerLog',
  linkedin:  'linkedinFollowerLog',
  facebook:  'facebookFollowerLog',
}

// Calcula el valor de la métrica de marketing para un proyecto.
// Devuelve { value, detail }; value=null cuando no hay datos.
async function marketingMetricValue(metric, project, game, months, tz) {
  switch (metric.kind) {
    case 'followers':     return followerDelta(metric.network, project.id, game, tz)
    case 'interaction':   return interactionSum(metric.network, project.id, game.workspaceId, months)
    case 'web_visits':    return webVisits(project.id, game.workspaceId, months)
    case 'geo_score':     return geoScore(project.id, game.workspaceId)
    case 'domain_rating': return { value: project.domainRating ?? null, detail: {} }
    case 'ads_ctr':       return adsMetric('ctr', project.id, game.workspaceId, game.config?.adsPlatform, months)
    case 'ads_spend':     return adsMetric('spend', project.id, game.workspaceId, game.config?.adsPlatform, months)
    default:              return { value: null, detail: {} }
  }
}

// Delta de seguidores en el período (logs diarios, exacto por rango de fechas).
async function followerDelta(network, projectId, game, tz) {
  const model = prisma[FOLLOWER_LOG[network]]
  if (!model) return { value: null, detail: {} }
  const fromStr = game.startDate ? ymdString(game.startDate, tz) : null
  const toStr   = game.endDate ? ymdString(game.endDate, tz) : null
  const logs = await model.findMany({
    where: { projectId, ...(fromStr || toStr ? { date: { ...(fromStr ? { gte: fromStr } : {}), ...(toStr ? { lte: toStr } : {}) } } : {}) },
    orderBy: { date: 'asc' },
  })
  if (logs.length < 2) return { value: null, detail: { insufficientData: true, endFollowers: logs[0]?.followersCount ?? null } }
  const start = logs[0].followersCount, end = logs[logs.length - 1].followersCount
  return { value: end - start, detail: { startFollowers: start, endFollowers: end } }
}

// Interacciones del período (snapshots mensuales). Fórmulas espejo del motor de objetivos.
async function interactionSum(network, projectId, workspaceId, months) {
  if (network === 'instagram') {
    const rows = await prisma.instagramSnapshot.findMany({ where: { projectId, workspaceId, month: { in: months } }, select: { avgLikes: true, avgComments: true, postsCount: true } })
    if (!rows.length) return { value: null, detail: {} }
    return { value: Math.round(rows.reduce((s, r) => s + ((r.avgLikes ?? 0) + (r.avgComments ?? 0)) * (r.postsCount ?? 0), 0)), detail: { approx: true } }
  }
  if (network === 'tiktok') {
    const rows = await prisma.tikTokSnapshot.findMany({ where: { projectId, workspaceId, month: { in: months } }, select: { avgLikes: true, avgComments: true, avgShares: true, postsThisMonth: true } })
    if (!rows.length) return { value: null, detail: {} }
    return { value: Math.round(rows.reduce((s, r) => s + ((r.avgLikes ?? 0) + (r.avgComments ?? 0) + (r.avgShares ?? 0)) * (r.postsThisMonth ?? 0), 0)), detail: { approx: true } }
  }
  const model = network === 'facebook' ? prisma.facebookSnapshot : prisma.linkedinSnapshot
  const rows = await model.findMany({ where: { projectId, workspaceId, month: { in: months } }, select: { totalLikes: true, totalComments: true, totalShares: true } })
  if (!rows.length) return { value: null, detail: {} }
  return { value: rows.reduce((s, r) => s + (r.totalLikes ?? 0) + (r.totalComments ?? 0) + (r.totalShares ?? 0), 0), detail: {} }
}

// Visitas web (suma de sesiones de AnalyticsSnapshot del período).
async function webVisits(projectId, workspaceId, months) {
  const rows = await prisma.analyticsSnapshot.findMany({ where: { projectId, workspaceId, month: { in: months } }, select: { sessions: true } })
  if (!rows.length) return { value: null, detail: {} }
  return { value: rows.reduce((s, r) => s + (r.sessions ?? 0), 0), detail: { monthsWithData: rows.length } }
}

// Score GEO más reciente (GeoAudit completado).
async function geoScore(projectId, workspaceId) {
  const a = await prisma.geoAudit.findFirst({
    where: { projectId, workspaceId, status: 'completed', score: { not: null } },
    orderBy: { updatedAt: 'desc' }, select: { score: true, updatedAt: true },
  })
  return { value: a?.score ?? null, detail: { date: a?.updatedAt ?? null } }
}

// Ads: CTR (ponderado por impresiones) o inversión (suma de spend) del período.
async function adsMetric(which, projectId, workspaceId, platform, months) {
  const type = platform === 'google_ads' ? 'google_ads' : 'meta_ads'
  const rows = await prisma.adsSnapshot.findMany({ where: { projectId, workspaceId, type, month: { in: months } }, select: { spend: true, clicks: true, impressions: true, ctr: true } })
  if (!rows.length) return { value: null, detail: { platform: type, disconnected: true } }
  if (which === 'spend') {
    return { value: parseFloat(rows.reduce((s, r) => s + (r.spend ?? 0), 0).toFixed(2)), detail: { platform: type } }
  }
  const totImp = rows.reduce((s, r) => s + (r.impressions ?? 0), 0)
  const totClk = rows.reduce((s, r) => s + (r.clicks ?? 0), 0)
  let ctr
  if (totImp > 0) ctr = parseFloat((totClk / totImp * 100).toFixed(2))
  else {
    const ctrs = rows.map((r) => r.ctr).filter((v) => v != null)
    ctr = ctrs.length ? parseFloat((ctrs.reduce((s, v) => s + v, 0) / ctrs.length).toFixed(2)) : null
  }
  return { value: ctr, detail: { platform: type } }
}

// Enumera los meses "YYYY-MM" cubiertos por [startDate, endDate] (en la TZ del workspace).
// Sin fechas, usa el mes actual.
function monthsBetween(startDate, endDate, tz) {
  const end = endDate ? ymdString(endDate, tz).slice(0, 7) : ymdString(new Date(), tz).slice(0, 7)
  const start = startDate ? ymdString(startDate, tz).slice(0, 7) : end
  const [ey, em] = end.split('-').map(Number)
  let [y, m] = start.split('-').map(Number)
  const out = []
  let guard = 0
  while ((y < ey || (y === ey && m <= em)) && guard < 120) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++; if (m > 12) { m = 1; y++ }
    guard++
  }
  return out.length ? out : [end]
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
  isGameVisible, isInRecurringWindow, localParts, daysInMonth, ymdString, monthsBetween,
  // leaderboards (DB)
  computeLeaderboard, resolveWinner, resolveSubjectLabels,
}
