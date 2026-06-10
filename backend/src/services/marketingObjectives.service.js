const prisma = require('../lib/prisma')
const { periodMonths, periodLabel, prevMonthStr } = require('../lib/monthUtils')
const { metricDef } = require('../lib/objectiveCatalog')

// ─── Helpers de cumplimiento ───────────────────────────────────────────────────

function computePct(direction, actual, target) {
  if (actual == null || target == null || target === 0) return null
  if (direction === 'lower') {
    if (actual === 0) return null
    return Math.round((target / actual) * 100)   // posición: estar mejor que el target da >100%
  }
  return Math.round((actual / target) * 100)
}

function statusFromPct(pct) {
  if (pct == null) return 'no_data'
  if (pct >= 100) return 'ok'
  if (pct >= 70)  return 'partial'
  return 'fail'
}

const PLATFORM_LABEL = { meta_ads: 'Meta Ads', google_ads: 'Google Ads' }
const NETWORK_LABEL  = { instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn' }
const RRSS_NETWORKS  = ['instagram', 'tiktok', 'linkedin']

// Modelo de snapshot por red (para seguidores nuevos).
function snapshotModel(network) {
  if (network === 'instagram') return prisma.instagramSnapshot
  if (network === 'tiktok')    return prisma.tikTokSnapshot
  return prisma.linkedinSnapshot
}

// ─── Fuentes ───────────────────────────────────────────────────────────────────

// Seguidores nuevos en el período para una red: followers(fin) − followers(base),
// donde base = mes anterior al inicio del período. Si falta la base, usa el primer
// mes del período como base aproximada. Devuelve null si no se puede calcular.
async function netNewFollowers(model, projectId, workspaceId, months, network) {
  const baseMonth = prevMonthStr(months[0])
  const rows = await model.findMany({
    where:  { projectId, workspaceId, month: { in: [baseMonth, ...months] } },
    select: { month: true, followersCount: true },
  })
  if (rows.length === 0) return { network, value: null }
  const byMonth = new Map(rows.map(r => [r.month, r.followersCount]))

  let end = null
  for (const m of months) if (byMonth.has(m)) end = byMonth.get(m)   // último disponible dentro del período
  if (end == null) return { network, value: null }

  let base = byMonth.get(baseMonth)
  let approxBase = false
  if (base == null) {
    let first = null
    for (const m of months) { if (byMonth.has(m)) { first = byMonth.get(m); break } }
    if (first == null || first === end) return { network, value: null, end }
    base = first
    approxBase = true
  }
  return { network, value: end - base, base, end, approxBase }
}

// Interacciones totales del período para una red (sumando meses).
async function interactionsForNetwork(network, projectId, workspaceId, months) {
  if (network === 'instagram') {
    const rows = await prisma.instagramSnapshot.findMany({
      where: { projectId, workspaceId, month: { in: months } },
      select: { avgLikes: true, avgComments: true, postsCount: true },
    })
    if (rows.length === 0) return { network, value: null, approx: true }
    const value = rows.reduce((s, r) => s + ((r.avgLikes ?? 0) + (r.avgComments ?? 0)) * (r.postsCount ?? 0), 0)
    return { network, value: Math.round(value), approx: true }
  }
  if (network === 'tiktok') {
    const rows = await prisma.tikTokSnapshot.findMany({
      where: { projectId, workspaceId, month: { in: months } },
      select: { avgLikes: true, avgComments: true, avgShares: true, postsThisMonth: true },
    })
    if (rows.length === 0) return { network, value: null, approx: true }
    const value = rows.reduce((s, r) => s + ((r.avgLikes ?? 0) + (r.avgComments ?? 0) + (r.avgShares ?? 0)) * (r.postsThisMonth ?? 0), 0)
    return { network, value: Math.round(value), approx: true }
  }
  // linkedin (exacto)
  const rows = await prisma.linkedinSnapshot.findMany({
    where: { projectId, workspaceId, month: { in: months } },
    select: { totalLikes: true, totalComments: true, totalShares: true },
  })
  if (rows.length === 0) return { network, value: null, approx: false }
  const value = rows.reduce((s, r) => s + (r.totalLikes ?? 0) + (r.totalComments ?? 0) + (r.totalShares ?? 0), 0)
  return { network, value, approx: false }
}

// ─── Cómputo por objetivo ──────────────────────────────────────────────────────

async function computeOne(obj, ctx) {
  const { projectId, workspaceId, dataMonth, googleAds, metaAds } = ctx
  const def = metricDef(obj.metric)
  if (!def) return null

  const months = periodMonths(dataMonth, obj.periodicity)
  const base = {
    id:          obj.id,
    category:    obj.category,
    metric:      obj.metric,
    periodicity: obj.periodicity,
    periodLabel: periodLabel(dataMonth, obj.periodicity),
    unit:        def.unit,
    direction:   def.direction,
    target:      obj.target,
    label:       def.label,
    actual:      null,
    pct:         null,
    status:      'no_data',
    detail:      {},
  }

  // ── WEB: leads / visitas (flujo desde AnalyticsSnapshot) ──
  if (obj.metric === 'leads' || obj.metric === 'visitas') {
    const field = obj.metric === 'leads' ? 'conversions' : 'sessions'
    const snaps = await prisma.analyticsSnapshot.findMany({
      where:  { projectId, workspaceId, month: { in: months } },
      select: { month: true, sessions: true, conversions: true },
    })
    const actual = snaps.length ? snaps.reduce((s, x) => s + (x[field] ?? 0), 0) : null
    return finalize(base, def, actual, { monthsWithData: snaps.length, monthsExpected: months.length })
  }

  // ── WEB: performance (stock, PageSpeed desktop más reciente) ──
  if (obj.metric === 'performance') {
    const ps = await prisma.pageSpeedResult.findFirst({
      where:   { projectId, workspaceId, strategy: 'desktop', status: 'done' },
      orderBy: { createdAt: 'desc' },
      select:  { performanceScore: true, createdAt: true },
    })
    base.label = 'Performance web (desktop)'
    return finalize(base, def, ps?.performanceScore ?? null, { strategy: 'desktop', date: ps?.createdAt ?? null, latestGlobal: true })
  }

  // ── SEO: posicionamiento (stock, menor es mejor) ──
  if (obj.metric === 'posicionamiento') {
    if (!obj.trackedKeywordId) {
      base.status = 'orphaned'
      base.detail = { keyword: null }
      return base
    }
    const r = await prisma.keywordRanking.findFirst({
      where:   { trackedKeywordId: obj.trackedKeywordId, month: { in: months } },
      orderBy: { month: 'desc' },
      select:  { position: true, month: true },
    })
    base.label = `Posición: "${obj.trackedKeyword?.query ?? ''}"`
    const actual = r && r.position > 0 ? parseFloat(Number(r.position).toFixed(1)) : null
    return finalize(base, def, actual, { keyword: obj.trackedKeyword?.query ?? null, month: r?.month ?? null })
  }

  // ── RRSS: seguidores nuevos (flujo). Por red si hay platform, si no suma todas. ──
  if (obj.metric === 'seguidores') {
    const networks = RRSS_NETWORKS.includes(obj.platform) ? [obj.platform] : RRSS_NETWORKS
    const nets = await Promise.all(
      networks.map(net => netNewFollowers(snapshotModel(net), projectId, workspaceId, months, net)),
    )
    const withData = nets.filter(n => n.value != null)
    const actual = withData.length ? withData.reduce((s, n) => s + n.value, 0) : null
    base.label = obj.platform
      ? `Seguidores nuevos · ${NETWORK_LABEL[obj.platform]}`
      : 'Seguidores nuevos (todas las redes)'
    base.detail.platform = obj.platform || null
    return finalize(base, def, actual, { breakdown: nets })
  }

  // ── RRSS: interacción (flujo). Por red si hay platform, si no suma todas. ──
  if (obj.metric === 'interaccion') {
    const networks = RRSS_NETWORKS.includes(obj.platform) ? [obj.platform] : RRSS_NETWORKS
    const nets = await Promise.all(
      networks.map(net => interactionsForNetwork(net, projectId, workspaceId, months)),
    )
    const withData = nets.filter(n => n.value != null)
    const actual = withData.length ? withData.reduce((s, n) => s + n.value, 0) : null
    base.label = obj.platform
      ? `Interacciones · ${NETWORK_LABEL[obj.platform]}`
      : 'Interacciones (todas las redes)'
    base.detail.platform = obj.platform || null
    return finalize(base, def, actual, { breakdown: nets })
  }

  // ── RRSS: competidores (head-to-head SIEMPRE visible) ──
  if (obj.metric === 'competidores') {
    if (!obj.competitorId) {
      base.status = 'orphaned'
      base.detail = { competitor: null }
      return base
    }
    return computeCompetitor(obj, base, ctx)
  }

  // ── ADS: inversion / clicks / ctr ──
  if (obj.category === 'ads') {
    return computeAds(obj, base, def, ctx, months)
  }

  return base
}

// Cierra un resultado de métrica numérica estándar (pct + status según dirección).
function finalize(base, def, actual, detail) {
  base.actual = actual
  base.detail = { ...base.detail, ...detail }
  if (def.direction === 'info') {
    base.status = actual == null ? 'no_data' : 'info'
    base.pct = null
    base.detail.delta = actual == null ? null : parseFloat((actual - base.target).toFixed(2))
  } else {
    base.pct = computePct(def.direction, actual, base.target)
    base.status = statusFromPct(base.pct)
  }
  return base
}

// Head-to-head propio vs un competidor (engagement / crecimiento / avg likes). Siempre devuelve datos.
async function computeCompetitor(obj, base, ctx) {
  const { projectId, workspaceId, dataMonth } = ctx
  const prev = prevMonthStr(dataMonth)
  const [ownSnaps, compSnaps] = await Promise.all([
    prisma.instagramSnapshot.findMany({
      where:  { projectId, workspaceId, month: { in: [dataMonth, prev] } },
      select: { month: true, followersCount: true, engagementRate: true, avgLikes: true },
    }),
    prisma.competitorSnapshot.findMany({
      where:  { competitorId: obj.competitorId, month: { in: [dataMonth, prev] } },
      select: { month: true, followersCount: true, engagementRate: true, avgLikes: true },
    }),
  ])
  const compLabel = obj.competitor?.displayName || `@${obj.competitor?.username ?? ''}`
  base.label = `Superar a ${compLabel}`

  const ownCur  = ownSnaps.find(s => s.month === dataMonth)
  const ownPrev = ownSnaps.find(s => s.month === prev)
  const cmpCur  = compSnaps.find(s => s.month === dataMonth)
  const cmpPrev = compSnaps.find(s => s.month === prev)

  if (!ownCur || !cmpCur) {
    base.status = 'no_data'
    base.detail = { competitor: compLabel }
    return base
  }

  const growth = (cur, prv) => (prv && prv.followersCount > 0 ? parseFloat(((cur.followersCount - prv.followersCount) / prv.followersCount * 100).toFixed(1)) : null)
  const METRICS = [
    { key: 'engagement', label: 'Engagement',                unit: '%', own: ownCur.engagementRate ?? null,        competitor: cmpCur.engagementRate ?? null },
    { key: 'growth',     label: 'Crecimiento de seguidores', unit: '%', own: growth(ownCur, ownPrev),              competitor: growth(cmpCur, cmpPrev) },
    { key: 'avgLikes',   label: 'Promedio de likes',         unit: '',  own: ownCur.avgLikes ?? null,              competitor: cmpCur.avgLikes ?? null },
  ].map(m => ({ ...m, won: m.own != null && m.competitor != null ? m.own > m.competitor : null }))

  const primary = METRICS[0]   // engagement = métrica principal
  base.actual = primary.own
  base.pct    = primary.own != null && primary.competitor != null && primary.competitor !== 0
    ? Math.round((primary.own / primary.competitor) * 100) : null
  base.unit   = '%'
  base.status = primary.won == null ? 'no_data' : (primary.won ? 'ok' : 'fail')
  base.detail = {
    competitor: compLabel,
    headToHead: { ownLabel: 'Tu cuenta', competitorLabel: compLabel, metrics: METRICS },
  }
  return base
}

// Inversión / clicks / CTR de Ads (snapshots del período + live para el mes en curso).
async function computeAds(obj, base, def, ctx, months) {
  const { projectId, workspaceId, dataMonth, googleAds, metaAds } = ctx
  const platform = obj.platform
  base.label = `${def.label} ${PLATFORM_LABEL[platform] ?? ''}`.trim()
  base.detail.platform = platform

  const snaps = await prisma.adsSnapshot.findMany({
    where:  { projectId, workspaceId, type: platform, month: { in: months } },
    select: { month: true, spend: true, clicks: true, ctr: true, impressions: true },
  })
  const byMonth = new Map(snaps.map(s => [s.month, s]))
  const live = platform === 'google_ads' ? googleAds : metaAds

  // valor por mes: snapshot, o live solo para el mes en curso (dataMonth)
  function monthRow(m) {
    if (byMonth.has(m)) return byMonth.get(m)
    if (m === dataMonth && live) {
      return {
        spend:       platform === 'google_ads' ? (live.cost ?? null) : (live.spend ?? null),
        clicks:      live.clicks ?? null,
        ctr:         live.ctr ?? null,
        impressions: live.impressions ?? null,
      }
    }
    return null
  }

  const rows = months.map(monthRow).filter(Boolean)
  if (rows.length === 0) {
    base.status = 'disconnected'
    base.detail.monthsWithData = 0
    base.detail.monthsExpected = months.length
    return base
  }
  base.detail.monthsWithData = rows.length
  base.detail.monthsExpected = months.length

  let actual
  if (obj.metric === 'inversion') {
    actual = parseFloat(rows.reduce((s, r) => s + (r.spend ?? 0), 0).toFixed(2))
  } else if (obj.metric === 'clicks') {
    actual = rows.reduce((s, r) => s + (r.clicks ?? 0), 0)
  } else { // ctr → promedio ponderado por impresiones (fallback: promedio simple)
    const totImp = rows.reduce((s, r) => s + (r.impressions ?? 0), 0)
    const totClk = rows.reduce((s, r) => s + (r.clicks ?? 0), 0)
    if (totImp > 0)      actual = parseFloat((totClk / totImp * 100).toFixed(2))
    else {
      const ctrs = rows.map(r => r.ctr).filter(v => v != null)
      actual = ctrs.length ? parseFloat((ctrs.reduce((s, v) => s + v, 0) / ctrs.length).toFixed(2)) : null
    }
  }
  return finalize(base, def, actual, {})
}

// ─── Entrada principal ─────────────────────────────────────────────────────────

/**
 * Calcula el progreso de todos los objetivos de un proyecto contra los datos reales.
 * @returns {Promise<Array>} un resultado por objetivo (ver shape en computeOne).
 */
async function computeObjectives({ projectId, workspaceId, dataMonth, googleAds = null, metaAds = null }) {
  const objectives = await prisma.marketingObjective.findMany({
    where:   { projectId, workspaceId },
    include: {
      trackedKeyword: { select: { id: true, query: true } },
      competitor:     { select: { id: true, username: true, displayName: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  if (objectives.length === 0) return []

  const ctx = { projectId, workspaceId, dataMonth, googleAds, metaAds }
  const results = []
  for (const obj of objectives) {
    try {
      const r = await computeOne(obj, ctx)
      if (r) results.push(r)
    } catch (err) {
      console.error(`[MarketingObjectives] Error computando objetivo ${obj.id} (${obj.metric}):`, err.message)
    }
  }
  return results
}

module.exports = { computeObjectives }
