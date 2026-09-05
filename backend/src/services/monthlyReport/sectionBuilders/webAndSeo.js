const { geoBand, pct } = require('../_shared')

// ── GEO ──────────────────────────────────────────────────────────────────────
function buildGeoSection(geoAudit, geoAuditHistory) {
  if (!geoAudit) return null
  return {
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
  }
}

// ── Analytics GA4 + Evolution (últimos 6 meses) ──────────────────────────────
function buildAnalyticsSection(analyticsSnap, analyticsPrev, flow) {
  if (!analyticsSnap) return null
  return {
    sessions:    flow ? flow.ga4.sessions    : (analyticsSnap.sessions    ?? 0),
    activeUsers: flow ? flow.ga4.activeUsers : (analyticsSnap.activeUsers ?? 0),
    newUsers:    flow ? flow.ga4.newUsers    : (analyticsSnap.newUsers    ?? 0),
    pageviews:   flow ? flow.ga4.pageviews   : (analyticsSnap.pageviews   ?? 0),
    bounceRate:  analyticsSnap.bounceRate  ?? 0,
    avgDuration: analyticsSnap.avgDuration ?? 0,
    conversions: flow ? flow.ga4.conversions : (analyticsSnap.conversions ?? 0),
    topChannels: (() => {
      try { return JSON.parse(analyticsSnap.topChannels || '[]') } catch { return [] }
    })(),
    topPages: (() => {
      try { return JSON.parse(analyticsSnap.topPages || '[]') } catch { return [] }
    })(),
    topSources: (() => {
      try { return JSON.parse(analyticsSnap.topSources || '[]') } catch { return [] }
    })(),
    aiTraffic: (() => {
      try {
        const raw = JSON.parse(analyticsSnap.aiTraffic || '{}')
        // Solo incluir fuentes con > 0 sesiones
        return Object.fromEntries(Object.entries(raw).filter(([, v]) => v > 0))
      } catch { return {} }
    })(),
    // Deltas mes-a-mes solo tienen sentido en informes de un mes; en multi-mes se omiten.
    delta: (!flow && analyticsPrev) ? {
      sessions:    pct(analyticsSnap.sessions    ?? 0, analyticsPrev.sessions),
      activeUsers: pct(analyticsSnap.activeUsers ?? 0, analyticsPrev.activeUsers),
      newUsers:    pct(analyticsSnap.newUsers    ?? 0, analyticsPrev.newUsers),
      pageviews:   pct(analyticsSnap.pageviews   ?? 0, analyticsPrev.pageviews),
      conversions: pct(analyticsSnap.conversions ?? 0, analyticsPrev.conversions),
    } : null,
  }
}

function buildEvolutionSection(analyticsEvolution) {
  return analyticsEvolution.length >= 2 ? analyticsEvolution : null
}

// ── PageSpeed ─────────────────────────────────────────────────────────────────
function buildPerformanceSection(pageSpeedMobile, pageSpeedDesktop) {
  if (!pageSpeedMobile && !pageSpeedDesktop) return null
  return {
    mobile:  pageSpeedMobile  ? {
      score:   pageSpeedMobile.performanceScore,
      metrics: (() => { try { return JSON.parse(pageSpeedMobile.metrics  || '{}') } catch { return {} } })(),
    } : null,
    desktop: pageSpeedDesktop ? {
      score:   pageSpeedDesktop.performanceScore,
      metrics: (() => { try { return JSON.parse(pageSpeedDesktop.metrics || '{}') } catch { return {} } })(),
    } : null,
    date: (pageSpeedMobile || pageSpeedDesktop).createdAt,
  }
}

// ── Search Console (SEO) ────────────────────────────────────────────────────
function buildSeoSection(seoSnap, seoPrev, flow) {
  if (!seoSnap) return null
  return {
    clicks:      flow ? flow.seo.clicks      : (seoSnap.clicks      ?? 0),
    impressions: flow ? flow.seo.impressions : (seoSnap.impressions ?? 0),
    ctr:         flow ? (flow.seo.impressions > 0 ? flow.seo.clicks / flow.seo.impressions : 0) : (seoSnap.ctr ?? 0),
    avgPosition: seoSnap.avgPosition  != null ? parseFloat(Number(seoSnap.avgPosition).toFixed(1)) : null,
    topQueries: (() => {
      try { return (JSON.parse(seoSnap.topQueries || '[]')).slice(0, 10) } catch { return [] }
    })(),
    topPages: (() => {
      try { return (JSON.parse(seoSnap.topPages || '[]')).slice(0, 5) } catch { return [] }
    })(),
    delta: (!flow && seoPrev) ? {
      clicks:      pct(seoSnap.clicks      ?? 0, seoPrev.clicks),
      impressions: pct(seoSnap.impressions ?? 0, seoPrev.impressions),
      ctr:         pct(seoSnap.ctr         ?? 0, seoPrev.ctr),
      avgPosition: seoPrev.avgPosition > 0
        ? parseFloat(((seoPrev.avgPosition - (seoSnap.avgPosition ?? 0))).toFixed(1))
        : null,
    } : null,
  }
}

// ── Keywords — usa el ranking más reciente disponible como "actual"
// Preferencia: dataMonth → cualquier mes más reciente (fallback)
// Delta: solo si hay un ranking del mes anterior (prev) para comparar
function buildKeywordsSection(allKeywords, dataMonth, prev) {
  const kwTable = allKeywords
    .map(kw => {
      if (kw.rankings.length === 0) return null
      // Preferir el ranking de dataMonth; si no, el más reciente (ya vienen desc)
      const curr = kw.rankings.find(r => r.month === dataMonth) || kw.rankings[0]
      if (!curr || curr.position <= 0) return null
      // Comparación: solo si hay ranking del mes anterior exacto
      const prv = kw.rankings.find(r => r.month === prev)
      return {
        query:       kw.query,
        position:    curr.position,
        delta:       prv && prv.position > 0 ? parseFloat((prv.position - curr.position).toFixed(1)) : null,
        clicks:      curr.clicks,
        impressions: curr.impressions,
        ctr:         curr.ctr,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position)

  if (kwTable.length === 0) return null

  const kwMovers  = kwTable.filter(k => k.delta != null)
  const kwImproved = kwMovers.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5)
  const kwDeclined = kwMovers.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5)

  return {
    table:       kwTable,
    improved:    kwImproved,
    declined:    kwDeclined,
    avgPosition: parseFloat((kwTable.reduce((s, k) => s + k.position, 0) / kwTable.length).toFixed(1)),
    count:       kwTable.length,
  }
}

module.exports = {
  buildGeoSection,
  buildAnalyticsSection,
  buildEvolutionSection,
  buildPerformanceSection,
  buildSeoSection,
  buildKeywordsSection,
}
