const prisma                                      = require('../lib/prisma')
const { saveMetaAdsSnapshot, saveGoogleAdsSnapshot, saveChatgptAdsSnapshot } = require('../services/adsSnapshot.service')
const { DEFAULT_TZ } = require('../utils/dates')

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function safeParseArr(v) {
  try { return JSON.parse(v) } catch { return [] }
}

// Plataformas de anuncios que saben guardar un snapshot. Es además la whitelist de
// `type` del endpoint: agregar una plataforma es agregar una entrada acá.
const SAVERS = {
  meta_ads:    saveMetaAdsSnapshot,
  google_ads:  saveGoogleAdsSnapshot,
  chatgpt_ads: saveChatgptAdsSnapshot,
}

/**
 * POST /api/marketing/projects/:id/ads-snapshots
 * Guarda un snapshot de ads del mes indicado.
 * Body: { month: "YYYY-MM", type: "meta_ads" | "google_ads" | "chatgpt_ads" }
 */
async function saveSnapshot(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month = currentMonthStr(), type } = req.body

    if (!SAVERS[type]) {
      return res.status(400).json({ error: `type debe ser uno de: ${Object.keys(SAVERS).join(', ')}` })
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    await SAVERS[type](projectId, workspaceId, month)

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
