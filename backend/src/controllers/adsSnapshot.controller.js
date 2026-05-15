const prisma                                      = require('../lib/prisma')
const { saveMetaAdsSnapshot, saveGoogleAdsSnapshot } = require('../services/adsSnapshot.service')

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function safeParseArr(v) {
  try { return JSON.parse(v) } catch { return [] }
}

/**
 * POST /api/marketing/projects/:id/ads-snapshots
 * Guarda un snapshot de ads (Meta o Google) del mes indicado.
 * Body: { month: "YYYY-MM", type: "meta_ads" | "google_ads" }
 */
async function saveSnapshot(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month = currentMonthStr(), type } = req.body

    if (!['meta_ads', 'google_ads'].includes(type)) {
      return res.status(400).json({ error: 'type debe ser "meta_ads" o "google_ads"' })
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    let result
    if (type === 'meta_ads') {
      result = await saveMetaAdsSnapshot(projectId, workspaceId, month)
    } else {
      result = await saveGoogleAdsSnapshot(projectId, workspaceId, month)
    }

    const snapshot = await prisma.adsSnapshot.findUnique({
      where: { projectId_month_type: { projectId, month, type } },
    })

    res.json({
      ...snapshot,
      topCampaigns: safeParseArr(snapshot.topCampaigns),
    })
  } catch (err) {
    if (err.message?.includes('sin integración') || err.message?.includes('activa')) {
      return res.status(400).json({ error: err.message, code: 'NOT_CONNECTED' })
    }
    next(err)
  }
}

/**
 * GET /api/marketing/projects/:id/ads-snapshots
 * Lista snapshots de ads del proyecto.
 * Query: ?type=meta_ads|google_ads&months=6
 */
async function listSnapshots(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { type, months = '6' } = req.query

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const where = { projectId, workspaceId }
    if (type) where.type = type

    const snapshots = await prisma.adsSnapshot.findMany({
      where,
      orderBy: { month: 'desc' },
      take:    Math.min(parseInt(months) || 6, 24),
    })

    res.json(snapshots.map(s => ({ ...s, topCampaigns: safeParseArr(s.topCampaigns) })))
  } catch (err) {
    next(err)
  }
}

module.exports = { saveSnapshot, listSnapshots }
