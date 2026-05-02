const prisma    = require('../lib/prisma')
const Anthropic = require('@anthropic-ai/sdk')
const { logTokens } = require('../lib/logTokens')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Helpers ──────────────────────────────────────────────────────────────────

function prevMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}

function prevMonthsArr(month, count) {
  const months = []
  let cur = month
  for (let i = 0; i < count; i++) {
    months.unshift(cur)
    cur = prevMonthStr(cur)
  }
  return months
}

function geoBand(score) {
  if (score >= 86) return 'Excelente'
  if (score >= 68) return 'Bueno'
  if (score >= 36) return 'Base'
  return 'Crítico'
}

function pct(curr, prev) {
  if (prev == null || prev === 0) return null
  return parseFloat(((curr - prev) / prev * 100).toFixed(1))
}

// Mes en el que cae una fecha UTC
function monthOfDate(d) {
  const date = new Date(d)
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

// ─── Agregador principal ──────────────────────────────────────────────────────

/**
 * Recopila todos los datos necesarios para el informe mensual de un proyecto.
 * Retorna un objeto estructurado con secciones condicionales.
 */
async function aggregateReportData(projectId, workspaceId, month, cachedAnalysis = null) {
  // El informe del mes X muestra datos del mes X-1.
  // Ej: "Informe de Mayo 2026" → período de datos: Abril 2026.
  const dataMonth = prevMonthStr(month)
  const prev      = prevMonthStr(dataMonth)   // mes anterior al período (para deltas)
  const last3     = prevMonthsArr(dataMonth, 3)

  // Rango de fechas del período de datos (para tasks)
  const [y, mo] = dataMonth.split('-').map(Number)
  const monthStart = new Date(Date.UTC(y, mo - 1, 1))
  const monthEnd   = new Date(Date.UTC(y, mo, 0, 23, 59, 59, 999))

  const [
    project,
    geoAudit,
    geoAuditHistory,
    analyticsSnap,
    analyticsPrev,
    analyticsEvolution,
    instagramSnap,
    instagramPrev,
    tiktokSnap,
    tiktokPrev,
    pageSpeedMobile,
    pageSpeedDesktop,
    allKeywords,
    completedTasks,
    integrations,
  ] = await Promise.all([
    // Proyecto
    prisma.project.findUnique({
      where:  { id: projectId },
      select: { id: true, name: true, websiteUrl: true, connections: true,
                services: { include: { service: { select: { name: true } } } } },
    }),

    // GEO audit más reciente completado
    prisma.geoAudit.findFirst({
      where:   { projectId, workspaceId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select:  { score: true, createdAt: true, citability: true, brandAuthority: true, eeat: true, technical: true, platforms: true, schema: true },
    }),

    // Historial de scores GEO (últimos 6 audits completados, para gráfico de evolución)
    prisma.geoAudit.findMany({
      where:   { projectId, workspaceId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      take:    6,
      select:  { score: true, createdAt: true },
    }),

    // GA4 snapshots — se usa dataMonth (mes anterior al del informe)
    prisma.analyticsSnapshot.findFirst({
      where:   { projectId, workspaceId, month: dataMonth },
      select:  { sessions: true, activeUsers: true, newUsers: true, pageviews: true,
                 bounceRate: true, avgDuration: true, conversions: true, topChannels: true,
                 aiTraffic: true },
    }),
    prisma.analyticsSnapshot.findFirst({
      where:   { projectId, workspaceId, month: prev },
      select:  { sessions: true, activeUsers: true, newUsers: true, pageviews: true,
                 bounceRate: true, avgDuration: true, conversions: true },
    }),
    // Últimos 3 snapshots GA4 (evolución)
    prisma.analyticsSnapshot.findMany({
      where:   { projectId, workspaceId, month: { in: last3 } },
      orderBy: { month: 'asc' },
      select:  { month: true, sessions: true, activeUsers: true, conversions: true },
    }),

    // Instagram snapshots
    prisma.instagramSnapshot.findFirst({
      where:   { projectId, workspaceId, month: dataMonth },
      select:  { followersCount: true, engagementRate: true, avgLikes: true,
                 avgComments: true, postsCount: true, mediaCount: true },
    }),
    prisma.instagramSnapshot.findFirst({
      where:   { projectId, workspaceId, month: prev },
      select:  { followersCount: true, engagementRate: true },
    }),

    // TikTok snapshots
    prisma.tikTokSnapshot.findFirst({
      where:   { projectId, workspaceId, month: dataMonth },
      select:  { followersCount: true, engagementRate: true, avgViews: true,
                 avgLikes: true, postsThisMonth: true, likesCount: true },
    }),
    prisma.tikTokSnapshot.findFirst({
      where:   { projectId, workspaceId, month: prev },
      select:  { followersCount: true, engagementRate: true },
    }),

    // PageSpeed
    prisma.pageSpeedResult.findFirst({
      where:   { projectId, workspaceId, strategy: 'mobile', status: 'done' },
      orderBy: { createdAt: 'desc' },
      select:  { performanceScore: true, metrics: true, createdAt: true },
    }),
    prisma.pageSpeedResult.findFirst({
      where:   { projectId, workspaceId, strategy: 'desktop', status: 'done' },
      orderBy: { createdAt: 'desc' },
      select:  { performanceScore: true, metrics: true, createdAt: true },
    }),

    // Keywords con rankings del período de datos y el anterior
    prisma.trackedKeyword.findMany({
      where:   { projectId, workspaceId },
      include: {
        rankings: {
          where:   { month: { in: [dataMonth, prev] } },
          orderBy: { month: 'desc' },
        },
      },
    }),

    // Tasks COMPLETED en el mes
    prisma.task.findMany({
      where: {
        projectId,
        status:      'COMPLETED',
        completedAt: { gte: monthStart, lte: monthEnd },
      },
      select: {
        id: true, description: true, completedAt: true,
        createdBy: { select: { name: true } },
      },
      orderBy: { completedAt: 'desc' },
    }),

    // Integraciones activas del proyecto
    prisma.projectIntegration.findMany({
      where:  { projectId, status: 'active' },
      select: { type: true, status: true },
    }),
  ])

  // ── Integrations map ─────────────────────────────────────────────────────────
  const connectedTypes = new Set(integrations.map(i => i.type))

  // ── GEO ──────────────────────────────────────────────────────────────────────
  const geo = geoAudit ? {
    score: geoAudit.score,
    band:  geoBand(geoAudit.score),
    date:  geoAudit.createdAt,
    components: {
      citability:     geoAudit.citability     ?? null,
      brandAuthority: geoAudit.brandAuthority ?? null,
      eeat:           geoAudit.eeat           ?? null,
      technical:      geoAudit.technical      ?? null,
      platforms:      geoAudit.platforms      ?? null,
      schema:         geoAudit.schema         ?? null,
    },
    // Historial de audits ordenado de más antiguo a más reciente (para gráfico de evolución)
    history: geoAuditHistory.length >= 2
      ? [...geoAuditHistory].reverse().map(a => ({
          score: a.score,
          date:  a.createdAt,
        }))
      : null,
  } : null

  // ── Analytics GA4 ────────────────────────────────────────────────────────────
  const analytics = analyticsSnap ? {
    sessions:    analyticsSnap.sessions    ?? 0,
    activeUsers: analyticsSnap.activeUsers ?? 0,
    newUsers:    analyticsSnap.newUsers    ?? 0,
    pageviews:   analyticsSnap.pageviews   ?? 0,
    bounceRate:  analyticsSnap.bounceRate  ?? 0,
    avgDuration: analyticsSnap.avgDuration ?? 0,
    conversions: analyticsSnap.conversions ?? 0,
    topChannels: (() => {
      try { return JSON.parse(analyticsSnap.topChannels || '[]') } catch { return [] }
    })(),
    aiTraffic: (() => {
      try {
        const raw = JSON.parse(analyticsSnap.aiTraffic || '{}')
        // Solo incluir fuentes con > 0 sesiones
        return Object.fromEntries(Object.entries(raw).filter(([, v]) => v > 0))
      } catch { return {} }
    })(),
    delta: analyticsPrev ? {
      sessions:    pct(analyticsSnap.sessions    ?? 0, analyticsPrev.sessions),
      activeUsers: pct(analyticsSnap.activeUsers ?? 0, analyticsPrev.activeUsers),
      newUsers:    pct(analyticsSnap.newUsers    ?? 0, analyticsPrev.newUsers),
      conversions: pct(analyticsSnap.conversions ?? 0, analyticsPrev.conversions),
    } : null,
  } : null

  // ── Evolution (últimos 3 meses GA4) ─────────────────────────────────────────
  const evolution = analyticsEvolution.length >= 2 ? analyticsEvolution : null

  // ── Instagram ────────────────────────────────────────────────────────────────
  const instagram = instagramSnap ? {
    followersCount: instagramSnap.followersCount,
    engagementRate: instagramSnap.engagementRate,
    avgLikes:       instagramSnap.avgLikes,
    avgComments:    instagramSnap.avgComments,
    postsCount:     instagramSnap.postsCount,
    deltaFollowers: instagramPrev ? pct(instagramSnap.followersCount, instagramPrev.followersCount) : null,
    deltaEngagement: instagramPrev ? pct(instagramSnap.engagementRate ?? 0, instagramPrev.engagementRate) : null,
  } : null

  // ── TikTok ───────────────────────────────────────────────────────────────────
  const tiktok = tiktokSnap ? {
    followersCount:  tiktokSnap.followersCount,
    engagementRate:  tiktokSnap.engagementRate,
    avgViews:        tiktokSnap.avgViews,
    avgLikes:        tiktokSnap.avgLikes,
    postsThisMonth:  tiktokSnap.postsThisMonth,
    likesCount:      tiktokSnap.likesCount,
    deltaFollowers:  tiktokPrev ? pct(tiktokSnap.followersCount, tiktokPrev.followersCount) : null,
    deltaEngagement: tiktokPrev ? pct(tiktokSnap.engagementRate ?? 0, tiktokPrev.engagementRate) : null,
  } : null

  // ── PageSpeed ─────────────────────────────────────────────────────────────────
  const performance = (pageSpeedMobile || pageSpeedDesktop) ? {
    mobile:  pageSpeedMobile  ? {
      score:   pageSpeedMobile.performanceScore,
      metrics: (() => { try { return JSON.parse(pageSpeedMobile.metrics  || '{}') } catch { return {} } })(),
    } : null,
    desktop: pageSpeedDesktop ? {
      score:   pageSpeedDesktop.performanceScore,
      metrics: (() => { try { return JSON.parse(pageSpeedDesktop.metrics || '{}') } catch { return {} } })(),
    } : null,
    date: (pageSpeedMobile || pageSpeedDesktop).createdAt,
  } : null

  // ── Keywords movers ──────────────────────────────────────────────────────────
  const kwMovers = allKeywords
    .map(kw => {
      const curr = kw.rankings.find(r => r.month === dataMonth)
      const prv  = kw.rankings.find(r => r.month === prev)
      if (!curr || !prv || prv.position <= 0 || curr.position <= 0) return null
      return { query: kw.query, delta: parseFloat((prv.position - curr.position).toFixed(1)), currPos: curr.position }
    })
    .filter(Boolean)

  const kwImproved = kwMovers.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5)
  const kwDeclined = kwMovers.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5)

  // Tabla completa de keywords del período de datos
  const kwTable = allKeywords
    .map(kw => {
      const curr = kw.rankings.find(r => r.month === dataMonth)
      const prv  = kw.rankings.find(r => r.month === prev)
      if (!curr || curr.position <= 0) return null
      return {
        query:    kw.query,
        position: curr.position,
        delta:    prv && prv.position > 0 ? parseFloat((prv.position - curr.position).toFixed(1)) : null,
        clicks:   curr.clicks,
        impressions: curr.impressions,
        ctr:      curr.ctr,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position)

  const keywords = kwTable.length > 0 ? {
    table:    kwTable,
    improved: kwImproved,
    declined: kwDeclined,
    avgPosition: parseFloat((kwTable.reduce((s, k) => s + k.position, 0) / kwTable.length).toFixed(1)),
    count:    kwTable.length,
  } : null

  // ── Tasks completadas ────────────────────────────────────────────────────────
  const tasks = completedTasks.length > 0 ? completedTasks : null

  // ── Servicios del proyecto ────────────────────────────────────────────────────
  const services = project?.services?.map(ps => ps.service.name) ?? []

  // ── Análisis IA ──────────────────────────────────────────────────────────────
  // Si ya existe un análisis cacheado, no se regenera
  const analysis = cachedAnalysis
    ? cachedAnalysis
    : await generateAnalysis({ project, month: dataMonth, geo, analytics, instagram, tiktok, keywords, performance, workspaceId })

  return {
    project: {
      id:         projectId,
      name:       project?.name ?? '',
      websiteUrl: project?.websiteUrl,
      services,
    },
    month,        // mes del informe (ej: "2026-05") — para identificación/navegación
    dataMonth,    // período de los datos (ej: "2026-04") — para mostrar al usuario
    connectedTypes: [...connectedTypes],
    sections: { geo, analytics, evolution, instagram, tiktok, keywords, performance, tasks },
    analysis,
    _analysisIsNew: !cachedAnalysis && !!analysis?.resumen,
  }
}

// ─── Análisis IA ──────────────────────────────────────────────────────────────

async function generateAnalysis({ project, month, geo, analytics, instagram, tiktok, keywords, performance, workspaceId }) {
  const dataCtx = JSON.stringify({
    proyecto: project?.name,
    mes:      month,
    geo:      geo      ? { score: geo.score, band: geo.band } : null,
    analytics: analytics ? {
      sesiones:    analytics.sessions,
      deltaSeisones: analytics.delta?.sessions,
      nuevosUsuarios: analytics.newUsers,
      tasaRebote: analytics.bounceRate,
    } : null,
    instagram: instagram ? {
      seguidores:  instagram.followersCount,
      deltaSeguidores: instagram.deltaFollowers,
      engagement:  instagram.engagementRate,
    } : null,
    tiktok: tiktok ? {
      seguidores:  tiktok.followersCount,
      deltaSeguidores: tiktok.deltaFollowers,
      engagement:  tiktok.engagementRate,
    } : null,
    posicionamiento: keywords ? {
      posPromedio: keywords.avgPosition,
      totalKeywords: keywords.count,
      mejoraronTop3: keywords.improved.slice(0, 3).map(k => k.query),
    } : null,
    performance: performance ? {
      mobile:  performance.mobile?.score,
      desktop: performance.desktop?.score,
    } : null,
  }, null, 2)

  const prompt = `Sos un analista de marketing digital experto en comunicación con clientes.
Redactá un análisis mensual en español para el informe del proyecto "${project?.name}" correspondiente al período ${month}.

DATOS DEL MES:
${dataCtx}

INSTRUCCIONES DE TONO (MUY IMPORTANTE):
- El informe tiene sesgo POSITIVO: destacá primero los logros y avances
- Si hay métricas negativas o por debajo del objetivo, mencionálas brevemente y siempre con una propuesta de mejora concreta
- Estilo motivador, profesional y constructivo — como un partner estratégico, no como un auditor
- Si no hay datos de una área, mencionalo brevemente sin dramatizar

Respondé SOLO con un JSON con esta estructura exacta:
{
  "resumen": "2-3 párrafos: primero los logros del mes, luego oportunidades de mejora con propuestas concretas",
  "highlights": ["logro 1 concreto", "logro 2 concreto", "logro 3 concreto"],
  "alertas": ["solo si hay algo importante que mejorar, máximo 2, siempre con propuesta de solución"],
  "nextSteps": ["acción concreta 1", "acción concreta 2", "acción concreta 3"]
}`

  try {
    const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages:   [{ role: 'user', content: prompt }],
    })

    logTokens('monthly_report', null, message.usage, workspaceId ?? null)
      .catch(err => console.error('[MonthlyReport] Error al registrar tokens de IA:', err.message))

    const raw       = message.content[0].text.trim()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) return JSON.parse(jsonMatch[0])
  } catch (err) {
    console.error('[MonthlyReport] Error generando análisis IA:', err.message)
  }

  return {
    resumen:    '',
    highlights: [],
    alertas:    [],
    nextSteps:  [],
  }
}

module.exports = { aggregateReportData }
