const prisma = require('../../lib/prisma')

// ─── Detección de secciones disponibles ───────────────────────────────────────
// Determina, por sección, si hay datos/fuente disponible y el estado de su
// integración (para avisar en el modal de "Generar Informe" si algo está
// desconectado y conviene reconectarlo antes de generar). Solo queries livianas
// a la DB — sin APIs externas ni IA.
//
// Devuelve { sectionKey: { available: bool, integration: 'active'|'expired'|'missing'|null } }
//   - integration null    → la sección no depende de una integración (GEO, performance, competidores, tareas)
//   - integration 'active' → integración conectada y vigente
//   - integration 'expired' → existe la integración pero su token se cayó (hay que reconectar)
//   - integration 'missing' → no hay integración, solo datos históricos guardados
async function getAvailableSections(projectId, workspaceId) {
  const [
    integrations, project, analyticsSnap, pageSpeed, geoAudit, seoSnap,
    keyword, igSnap, tkSnap, ytSnap, liSnap, fbSnap, metaAdsSnap, googleAdsSnap, competitor, objective,
  ] = await Promise.all([
    prisma.projectIntegration.findMany({ where: { projectId }, select: { type: true, status: true } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { websiteUrl: true, reportSections: true } }),
    prisma.analyticsSnapshot.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.pageSpeedResult.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.geoAudit.findFirst({ where: { projectId, workspaceId, status: 'completed' }, select: { id: true } }),
    prisma.searchConsoleSnapshot.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.trackedKeyword.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.instagramSnapshot.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.tikTokSnapshot.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.youTubeSnapshot.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.linkedinSnapshot.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.facebookSnapshot.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.adsSnapshot.findFirst({ where: { projectId, workspaceId, type: 'meta_ads' }, select: { id: true } }),
    prisma.adsSnapshot.findFirst({ where: { projectId, workspaceId, type: 'google_ads' }, select: { id: true } }),
    prisma.competitorAccount.findFirst({ where: { projectId, platform: 'instagram' }, select: { id: true } }),
    prisma.marketingObjective.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
  ])

  const intgByType = new Map(integrations.map(i => [i.type, i.status]))

  // Arma el objeto de estado de una sección. `type` = tipo de integración del que depende (o null).
  function build(available, type) {
    if (!available) return { available: false, integration: null }
    if (!type)      return { available: true,  integration: null }
    if (!intgByType.has(type)) return { available: true, integration: 'missing' }
    return { available: true, integration: intgByType.get(type) === 'active' ? 'active' : 'expired' }
  }

  const has = (type) => intgByType.has(type)
  const sections = {
    analytics:       build(has('google_analytics')      || !!analyticsSnap, 'google_analytics'),
    performance:     build(!!project?.websiteUrl        || !!pageSpeed,     null),
    geo:             build(!!project?.websiteUrl        || !!geoAudit,      null),
    seo:             build(has('google_search_console') || !!seoSnap,       'google_search_console'),
    keywords:        build(has('google_search_console') || !!keyword,       'google_search_console'),
    instagram:       build(has('instagram')             || !!igSnap,        'instagram'),
    tiktok:          build(has('tiktok')                || !!tkSnap,        'tiktok'),
    youtube:         build(has('google_youtube')        || !!ytSnap,        'google_youtube'),
    linkedin:        build(has('linkedin')              || !!liSnap,        'linkedin'),
    facebook:        build(has('facebook')              || !!fbSnap,        'facebook'),
    metaAds:         build(has('meta_ads')              || !!metaAdsSnap,   'meta_ads'),
    googleAds:       build(has('google_ads')            || !!googleAdsSnap, 'google_ads'),
    competitors:     build(!!competitor, null),
    objectives:      build(!!objective, null),
    tasks:           build(true, null),
  }

  // Config manual por proyecto (rueda "⚙️" en Informes): una sección desmarcada ahí
  // deja de ofrecerse en el modal de generar informe, aunque tenga datos/integración.
  // null = sin restricción (no configurado todavía) → no se toca nada.
  if (project?.reportSections) {
    let enabledKeys = null
    try { enabledKeys = JSON.parse(project.reportSections) } catch { enabledKeys = null }
    if (Array.isArray(enabledKeys)) {
      const enabledSet = new Set(enabledKeys)
      for (const key of Object.keys(sections)) {
        if (!enabledSet.has(key)) sections[key] = { available: false, integration: null }
      }
    }
  }

  return sections
}

module.exports = { getAvailableSections }
