/**
 * webSummary.controller.js
 * Vistas globales cross-proyecto de Analytics (GA4), Performance (PageSpeed) y SEO (Domain Rating).
 */

const prisma = require('../../lib/prisma')
const { saveMonthSnapshot } = require('../../services/analyticsSnapshot.service')
const { todayString } = require('../../utils/dates')

/**
 * GET /api/marketing/summary/analytics
 * Snapshot de Analytics más reciente por proyecto, ordenado por sesiones desc.
 * Solo proyectos activos: un proyecto desactivado desaparece de esta vista aunque
 * conserve snapshots/integraciones históricas (se filtra por la relación `project`).
 */
async function getAnalyticsSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    // Para cada proyecto, tomar el snapshot más reciente
    const snapshots = await prisma.analyticsSnapshot.findMany({
      where: { workspaceId, project: { active: true } },
      orderBy: { month: 'desc' },
      include: { project: { select: { id: true, name: true } } },
    })

    // Estado de la integración GA4 por proyecto: 'active' | 'expired' | 'missing'.
    // Permite pintar en rojo los proyectos cuya integración se desconectó (no refrescable).
    const integrations = await prisma.projectIntegration.findMany({
      where:  { workspaceId, type: 'google_analytics', project: { active: true } },
      select: { projectId: true, status: true, propertyId: true, project: { select: { id: true, name: true } } },
    })
    const integrationStatusOf = (projectId) => {
      const ig = integrations.find(i => i.projectId === projectId)
      if (!ig) return 'missing'
      return (ig.status === 'active' && ig.propertyId) ? 'active' : 'expired'
    }

    // Deduplicate: un registro por proyecto (el más reciente, que viene primero por orderBy)
    const seen = new Set()
    const result = []
    for (const s of snapshots) {
      if (seen.has(s.projectId)) continue
      seen.add(s.projectId)
      result.push({
        projectId:         s.projectId,
        projectName:       s.project.name,
        month:             s.month,
        updatedAt:         s.updatedAt,
        sessions:          s.sessions,
        activeUsers:       s.activeUsers,
        newUsers:          s.newUsers,
        pageviews:         s.pageviews,
        bounceRate:        s.bounceRate,
        avgDuration:       s.avgDuration,
        conversions:       s.conversions,
        hasData:           true,
        integrationStatus: integrationStatusOf(s.projectId),
      })
    }

    // Proyectos con GA4 configurado pero todavía sin ningún snapshot: aparecen sin datos
    // (y en rojo si están desconectados) para que la alerta de "no refrescable" sea completa.
    for (const ig of integrations) {
      if (seen.has(ig.projectId)) continue
      seen.add(ig.projectId)
      result.push({
        projectId:         ig.projectId,
        projectName:       ig.project.name,
        month:             null,
        updatedAt:         null,
        sessions:          0,
        activeUsers:       0,
        newUsers:          0,
        pageviews:         0,
        bounceRate:        0,
        avgDuration:       0,
        conversions:       0,
        hasData:           false,
        integrationStatus: integrationStatusOf(ig.projectId),
      })
    }

    result.sort((a, b) => b.sessions - a.sessions)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/marketing/summary/analytics/refresh
 * Refresca el snapshot del mes en curso de todos los proyectos con GA4 activo.
 * No consume tokens de IA (solo pega a la API de GA4). Secuencial para no saturar la cuota.
 * Devuelve por proyecto: { projectId, projectName, status: 'ok'|'disconnected'|'error', error? }.
 */
async function refreshAnalyticsSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const month = todayString(req.workspace.timezone).slice(0, 7) // "YYYY-MM" del mes en curso

    const integrations = await prisma.projectIntegration.findMany({
      where:  { workspaceId, type: 'google_analytics', project: { active: true } },
      select: { projectId: true, status: true, propertyId: true, project: { select: { name: true } } },
    })

    const results = []
    for (const ig of integrations) {
      const base = { projectId: ig.projectId, projectName: ig.project.name }
      if (ig.status !== 'active' || !ig.propertyId) {
        results.push({ ...base, status: 'disconnected' })
        continue
      }
      try {
        const snap = await saveMonthSnapshot(ig.projectId, workspaceId, month)
        results.push({ ...base, status: snap ? 'ok' : 'disconnected' })
      } catch (err) {
        console.error(`[AnalyticsSummary] refresh proyecto ${ig.projectId}:`, err.message)
        results.push({ ...base, status: 'error', error: err.message })
      }
    }

    res.json({
      month,
      refreshed: results.filter(r => r.status === 'ok').length,
      total:     results.length,
      results,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/summary/performance
 * Resultado de PageSpeed más reciente por proyecto para una estrategia dada, ordenado por score desc.
 * ?strategy=mobile|desktop (default: mobile)
 */
async function getPerformanceSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const strategy = req.query.strategy === 'desktop' ? 'desktop' : 'mobile'

    const results = await prisma.pageSpeedResult.findMany({
      where:   { workspaceId, status: 'done', strategy, project: { active: true } },
      orderBy: [
        { createdAt: 'desc' },
      ],
      include: { project: { select: { id: true, name: true } } },
    })

    // Un registro por proyecto: el más reciente de la estrategia pedida
    const byProject = new Map()
    for (const r of results) {
      if (!byProject.has(r.projectId)) {
        byProject.set(r.projectId, r)
      }
    }

    const result = Array.from(byProject.values()).map(r => {
      let metrics = {}
      try { metrics = JSON.parse(r.metrics) } catch {}
      return {
        projectId:        r.projectId,
        projectName:      r.project.name,
        strategy:         r.strategy,
        performanceScore: r.performanceScore ?? 0,
        lcp:              metrics.lcp?.displayValue ?? null,
        cls:              metrics.cls?.displayValue ?? null,
        fcp:              metrics.fcp?.displayValue ?? null,
        createdAt:        r.createdAt,
      }
    })

    result.sort((a, b) => b.performanceScore - a.performanceScore)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/summary/seo
 * Todos los sitios web del workspace (proyectos con websiteUrl) ordenados por
 * Domain Rating de mayor a menor. Los que aún no tienen DR van al final.
 */
async function getSeoSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    const projects = await prisma.project.findMany({
      where:  { workspaceId, active: true, websiteUrl: { not: null } },
      select: { id: true, name: true, websiteUrl: true, domainRating: true, domainRatingAt: true },
    })

    const result = projects.map(p => ({
      projectId:      p.id,
      projectName:    p.name,
      websiteUrl:     p.websiteUrl,
      domainRating:   p.domainRating,
      domainRatingAt: p.domainRatingAt,
    }))

    // DR desc; null al final
    result.sort((a, b) => (b.domainRating ?? -1) - (a.domainRating ?? -1))
    res.json(result)
  } catch (err) {
    next(err)
  }
}

module.exports = { getAnalyticsSummary, refreshAnalyticsSummary, getPerformanceSummary, getSeoSummary }
