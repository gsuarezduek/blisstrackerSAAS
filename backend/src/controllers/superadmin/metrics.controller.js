const prisma = require('../../lib/prisma')
const { DEFAULT_TZ } = require('../../utils/dates')

/**
 * GET /api/superadmin/stats
 * Stats globales del SaaS.
 */
async function getStats(req, res, next) {
  try {
    const [
      totalWorkspaces,
      byStatus,
      totalUsers,
      totalTasks,
    ] = await Promise.all([
      prisma.workspace.count(),
      prisma.workspace.groupBy({ by: ['status'], _count: true }),
      prisma.user.count(),
      prisma.task.count(),
    ])

    res.json({
      totalWorkspaces,
      byStatus: Object.fromEntries(byStatus.map(r => [r.status, r._count])),
      totalUsers,
      totalTasks,
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/superadmin/conversion-funnel
 * Agregados de los últimos 30 días: signups, trials activos, conversiones a paid.
 * Lee de ConversionEvent (eventos instrumentados desde frontend) + Workspace/Subscription.
 */
async function getConversionFunnel(req, res, next) {
  try {
    const days = Math.max(1, Math.min(Number(req.query.days) || 30, 365))
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const [
      ctaClicks,
      pricingViews,
      signupStarted,
      signupCompleted,
      workspacesNew,
      workspacesActive,
      workspacesTrialing,
      checkoutStarted,
      subscriptionActive,
    ] = await Promise.all([
      prisma.conversionEvent.count({ where: { name: 'landing_cta_click', createdAt: { gte: since } } }),
      prisma.conversionEvent.count({ where: { name: 'pricing_page_viewed', createdAt: { gte: since } } }),
      prisma.conversionEvent.count({ where: { name: 'signup_started', createdAt: { gte: since } } }),
      prisma.conversionEvent.count({ where: { name: 'signup_completed', createdAt: { gte: since } } }),
      prisma.workspace.count({ where: { createdAt: { gte: since } } }),
      prisma.workspace.count({ where: { status: 'active',   createdAt: { gte: since } } }),
      prisma.workspace.count({ where: { status: 'trialing', createdAt: { gte: since } } }),
      prisma.conversionEvent.count({ where: { name: 'checkout_started', createdAt: { gte: since } } }),
      prisma.conversionEvent.count({ where: { name: 'subscription_active', createdAt: { gte: since } } }),
    ])

    // Eventos top de los últimos N días (para diagnosticar qué se está clickeando)
    const topEvents = await prisma.conversionEvent.groupBy({
      by:    ['name'],
      where: { createdAt: { gte: since } },
      _count: { name: true },
      orderBy: { _count: { name: 'desc' } },
      take:    20,
    })

    res.json({
      windowDays: days,
      since,
      funnel: {
        ctaClicks,
        pricingViews,
        signupStarted,
        signupCompleted,
        workspacesNew,
        workspacesTrialing,
        workspacesActive,
        checkoutStarted,
        subscriptionActive,
      },
      // Conversion rates (cuando hay denominador)
      rates: {
        ctaToSignupStarted:  ctaClicks       > 0 ? Math.round((signupStarted   / ctaClicks)       * 1000) / 10 : null,
        signupStartedToDone: signupStarted   > 0 ? Math.round((signupCompleted / signupStarted)   * 1000) / 10 : null,
        trialingToActive:    workspacesNew   > 0 ? Math.round((workspacesActive / workspacesNew)  * 1000) / 10 : null,
      },
      topEvents: topEvents.map(e => ({ name: e.name, count: e._count.name })),
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/superadmin/metrics?days=N
 * Métricas de uso de la plataforma: series diarias (DAU, workspaces activos,
 * tareas, signups, tokens IA), KPIs (WAU/MAU/stickiness) y retención por
 * cohortes semanales. Todo agrupado por día calendario en ART (UTC-3).
 */
const METRICS_TZ = DEFAULT_TZ
const num = v => Number(v ?? 0)

async function getMetrics(req, res, next) {
  try {
    const days = Math.max(7, Math.min(Number(req.query.days) || 30, 365))

    // Eje de días en ART (sin DST en Argentina → paso de 24h estable).
    const artDay = d => new Intl.DateTimeFormat('en-CA', { timeZone: METRICS_TZ }).format(d)
    const axis = []
    for (let i = days - 1; i >= 0; i--) axis.push(artDay(new Date(Date.now() - i * 86400000)))
    const since = new Date(`${axis[0]}T00:00:00-03:00`)
    const cohortSince = new Date(Date.now() - 8 * 7 * 86400000) // 8 semanas

    // Helper: convierte filas [{ day, ... }] en un array alineado al eje.
    const toSeries = (rows, key = 'n') => {
      const map = Object.fromEntries(rows.map(r => [r.day, num(r[key])]))
      return axis.map(d => map[d] ?? 0)
    }

    const [
      activity, tasksCreated, tasksCompleted, signups, newUsers, tokens,
      mauRow, wauRow, cohortRows,
    ] = await Promise.all([
      prisma.$queryRaw`
        SELECT (("loginAt" AT TIME ZONE 'UTC' AT TIME ZONE ${METRICS_TZ})::date)::text AS day,
               COUNT(DISTINCT "userId") AS users, COUNT(DISTINCT "workspaceId") AS workspaces
        FROM "UserLogin" WHERE "loginAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw`
        SELECT (("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${METRICS_TZ})::date)::text AS day, COUNT(*) AS n
        FROM "Task" WHERE "createdAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw`
        SELECT (("completedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${METRICS_TZ})::date)::text AS day, COUNT(*) AS n
        FROM "Task" WHERE "completedAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw`
        SELECT (("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${METRICS_TZ})::date)::text AS day, COUNT(*) AS n
        FROM "Workspace" WHERE "createdAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw`
        SELECT (("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${METRICS_TZ})::date)::text AS day, COUNT(*) AS n
        FROM "User" WHERE "createdAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw`
        SELECT (("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${METRICS_TZ})::date)::text AS day,
               COALESCE(SUM("inputTokens" + "outputTokens"), 0) AS n
        FROM "AiTokenLog" WHERE "createdAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw`SELECT COUNT(DISTINCT "userId") AS n FROM "UserLogin" WHERE "loginAt" >= now() - interval '30 days'`,
      prisma.$queryRaw`SELECT COUNT(DISTINCT "userId") AS n FROM "UserLogin" WHERE "loginAt" >= now() - interval '7 days'`,
      // Cohortes semanales: workspaces por semana de alta + cuántos siguen activos (login en últimos 14d)
      prisma.$queryRaw`
        WITH cohort AS (
          SELECT id, to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${METRICS_TZ}), 'IYYY-"W"IW') AS week
          FROM "Workspace" WHERE "createdAt" >= ${cohortSince}
        ),
        act AS (
          SELECT DISTINCT "workspaceId" AS id FROM "UserLogin"
          WHERE "loginAt" >= now() - interval '14 days' AND "workspaceId" IS NOT NULL
        )
        SELECT c.week AS week, COUNT(*) AS size, COUNT(a.id) AS active
        FROM cohort c LEFT JOIN act a ON a.id = c.id
        GROUP BY c.week ORDER BY c.week`,
    ])

    const activeUsers      = toSeries(activity, 'users')
    const activeWorkspaces = toSeries(activity, 'workspaces')
    const sum = arr => arr.reduce((a, b) => a + b, 0)
    const dauAvg = activeUsers.length ? Math.round(sum(activeUsers) / activeUsers.length) : 0
    const mau = num(mauRow[0]?.n)

    res.json({
      range: { days, since },
      axis,
      series: {
        activeUsers,
        activeWorkspaces,
        tasksCreated:   toSeries(tasksCreated),
        tasksCompleted: toSeries(tasksCompleted),
        newWorkspaces:  toSeries(signups),
        newUsers:       toSeries(newUsers),
        aiTokens:       toSeries(tokens),
      },
      summary: {
        dauAvg,
        dauToday:   activeUsers[activeUsers.length - 1] ?? 0,
        wau:        num(wauRow[0]?.n),
        mau,
        stickiness: mau > 0 ? Math.round((dauAvg / mau) * 1000) / 10 : null, // %
        newWorkspaces:  sum(toSeries(signups)),
        newUsers:       sum(toSeries(newUsers)),
        tasksCreated:   sum(toSeries(tasksCreated)),
        tasksCompleted: sum(toSeries(tasksCompleted)),
      },
      cohorts: cohortRows.map(c => {
        const size = num(c.size), active = num(c.active)
        return { week: c.week, size, active, rate: size > 0 ? Math.round((active / size) * 1000) / 10 : 0 }
      }),
    })
  } catch (err) { next(err) }
}

module.exports = { getStats, getConversionFunnel, getMetrics }
