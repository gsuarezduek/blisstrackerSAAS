// Sección "Email marketing" del informe mensual (Mailing). Se calcula en vivo
// desde las campañas lanzadas en el período; el informe ya congela lo que generó
// (dataCache), así que no hace falta un snapshot mensual aparte.
//
// Lo que se publica es lo que el cliente puede ver en su propia bandeja de
// resultados: cuántos mails, tasas y las campañas. NUNCA direcciones de email,
// nombres de contactos ni nombres de bases (pueden decir cosas internas: "leads
// fríos", "clientes que no pagan"). tests/unit/emailReportSection.test.js lo fija.
const prisma = require('../../../lib/prisma')

function rate(part, total) {
  return total ? Math.round((part / total) * 1000) / 10 : null // % con un decimal
}

function pctDelta(cur, prev) {
  if (cur == null || prev == null || prev === 0) return null
  return Math.round(((cur - prev) / prev) * 1000) / 10
}

function bounds(startYmd, endYmd) {
  return { gte: new Date(`${startYmd}T00:00:00.000Z`), lte: new Date(`${endYmd}T23:59:59.999Z`) }
}

/** El período inmediatamente anterior, del mismo largo (en días). */
function previousRange(startYmd, endYmd) {
  const start = new Date(`${startYmd}T00:00:00Z`)
  const end = new Date(`${endYmd}T00:00:00Z`)
  const days = Math.round((end - start) / 86400000) + 1
  const pEnd = new Date(start.getTime() - 86400000)
  const pStart = new Date(pEnd.getTime() - (days - 1) * 86400000)
  return { start: pStart.toISOString().slice(0, 10), end: pEnd.toISOString().slice(0, 10) }
}

function totals(campaigns) {
  const t = campaigns.reduce((a, c) => ({
    sent: a.sent + c.sentCount,
    delivered: a.delivered + c.deliveredCount,
    opens: a.opens + c.openCount,
    clicks: a.clicks + c.clickCount,
    unsubscribes: a.unsubscribes + c.unsubscribeCount,
    bounces: a.bounces + c.bounceCount,
  }), { sent: 0, delivered: 0, opens: 0, clicks: 0, unsubscribes: 0, bounces: 0 })
  return { ...t, openRate: rate(t.opens, t.sent), clickRate: rate(t.clicks, t.sent) }
}

const CAMPAIGN_SELECT = {
  name: true, subject: true, launchedAt: true, sentCount: true, deliveredCount: true, openCount: true,
  clickCount: true, unsubscribeCount: true, bounceCount: true, subjectB: true, abWinner: true,
}

/**
 * @returns {Promise<object|null>} null si en el período no salió ninguna campaña
 *   (una tarjeta en cero no es un resultado, es que no se usó).
 */
async function buildEmailSection({ projectId, period }) {
  const prev = previousRange(period.start, period.end)
  const [campaigns, prevCampaigns, subscribers, newSubscribers, unsubscribed] = await Promise.all([
    prisma.mailingCampaign.findMany({
      where: { projectId, launchedAt: bounds(period.start, period.end), status: { not: 'draft' } },
      select: CAMPAIGN_SELECT,
      orderBy: { launchedAt: 'asc' },
    }),
    prisma.mailingCampaign.findMany({
      where: { projectId, launchedAt: bounds(prev.start, prev.end), status: { not: 'draft' } },
      select: CAMPAIGN_SELECT,
    }),
    prisma.mailingContact.count({ where: { projectId, status: 'subscribed' } }),
    prisma.mailingContact.count({ where: { projectId, status: 'subscribed', consentAt: bounds(period.start, period.end) } }),
    prisma.mailingContact.count({ where: { projectId, unsubscribedAt: bounds(period.start, period.end) } }),
  ])
  if (!campaigns.length) return null

  const cur = totals(campaigns)
  const before = prevCampaigns.length ? totals(prevCampaigns) : null
  return {
    campaigns: campaigns.length,
    ...cur,
    subscribers,
    newSubscribers,
    unsubscribedInPeriod: unsubscribed,
    delta: before ? {
      sent: pctDelta(cur.sent, before.sent),
      // Las tasas cambian en PUNTOS porcentuales, no en %: un "+50%" sobre un 2%
      // de clics confunde. Se informa la diferencia directa.
      openRatePts: cur.openRate != null && before.openRate != null ? Math.round((cur.openRate - before.openRate) * 10) / 10 : null,
      clickRatePts: cur.clickRate != null && before.clickRate != null ? Math.round((cur.clickRate - before.clickRate) * 10) / 10 : null,
    } : null,
    // El nombre de la campaña es interno ("leads fríos", "reactivación morosos"):
    // al cliente se le muestra el asunto, que es lo que vio su audiencia.
    list: campaigns.map(c => ({
      subject: c.subjectB && c.abWinner === 'B' ? c.subjectB : c.subject,
      date: c.launchedAt.toISOString().slice(0, 10),
      sent: c.sentCount,
      openRate: rate(c.openCount, c.sentCount),
      clickRate: rate(c.clickCount, c.sentCount),
      abTest: !!c.subjectB,
    })),
  }
}

module.exports = { buildEmailSection, previousRange }
