const {
  getDatabaseSize,
  getSocialImageStats,
  cleanupOrphanImages,
} = require('../services/storageStats.service')
const { computeAllWorkspacesStorageUsage, computeGlobalR2Totals } = require('../services/workspaceStorage.service')
const { upsertCurrentMonthSnapshot, getStorageHistory: getHistory } = require('../services/platformStorageSnapshot.service')
const { getSetting } = require('../lib/platformSettings')
const prisma = require('../lib/prisma')

const GB = 1024 ** 3

/**
 * GET /api/superadmin/storage
 * Tamaño total de la DB + top tablas + desglose de SocialImage (en uso vs
 * huérfanas) + total/desglose/costo estimado en object storage (R2).
 */
async function getStorage(req, res, next) {
  try {
    const [database, socialImages, r2Totals, r2CostPerGbMonth] = await Promise.all([
      getDatabaseSize(12),
      getSocialImageStats(),
      computeGlobalR2Totals(),
      getSetting('r2CostPerGbMonth'),
    ])
    // Mantiene vivo el snapshot del mes en curso cada vez que se visita la
    // página — fire-and-forget, nunca debe demorar ni romper la respuesta.
    upsertCurrentMonthSnapshot().catch(() => {})

    res.json({
      database,
      socialImages,
      r2: {
        totalBytes: r2Totals.totalBytes,
        breakdown: r2Totals.breakdown,
        estimatedCostUsd: (r2Totals.totalBytes / GB) * r2CostPerGbMonth,
      },
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/superadmin/storage/history
 * Tendencia mensual del total de R2 de la plataforma (para graficar).
 */
async function getStorageHistoryHandler(req, res, next) {
  try {
    const months = Math.min(24, Math.max(1, Number(req.query.months) || 12))
    const snapshots = await getHistory(months)
    res.json({ snapshots })
  } catch (err) { next(err) }
}

/**
 * POST /api/superadmin/storage/cleanup-orphan-images
 * Body: { olderThanDays?: number } — borra imágenes sociales huérfanas + VACUUM FULL.
 * Default olderThanDays = 1 (guard contra imágenes recién cacheadas en vuelo).
 */
async function cleanupOrphanImagesHandler(req, res, next) {
  try {
    const raw = Number(req.body?.olderThanDays)
    const olderThanDays = Number.isFinite(raw) && raw >= 0 ? raw : 1
    const result = await cleanupOrphanImages({ olderThanDays, vacuum: true })
    console.log(`[StorageCleanup] Disparado por user #${req.user.userId}:`, result)
    res.json(result)
  } catch (err) { next(err) }
}

/**
 * GET /api/superadmin/storage/by-workspace
 * Ranking de almacenamiento por workspace (Archivos/Contenido/Imágenes RRSS/
 * WhatsApp), para complementar la vista global de arriba con "quién ocupa
 * qué". Incluye workspaces sin ningún uso (todo en 0) para que el ranking
 * refleje la lista completa, no solo los que tienen datos.
 */
async function getStorageByWorkspace(req, res, next) {
  try {
    const [usage, workspaces, r2CostPerGbMonth] = await Promise.all([
      computeAllWorkspacesStorageUsage(),
      prisma.workspace.findMany({
        select: { id: true, name: true, slug: true, status: true, storageLimitMb: true },
      }),
      getSetting('r2CostPerGbMonth'),
    ])
    const usageByWs = new Map(usage.map(u => [u.workspaceId, u]))
    const empty = { archivos: 0, contenido: 0, imagenesSociales: 0, whatsapp: 0, chat: 0, total: 0 }
    const rows = workspaces
      .map(w => {
        const u = usageByWs.get(w.id) ?? empty
        return {
          workspaceId: w.id,
          name: w.name,
          slug: w.slug,
          status: w.status,
          storageLimitMb: w.storageLimitMb,
          ...u,
          estimatedCostUsd: (u.total / GB) * r2CostPerGbMonth,
        }
      })
      .sort((a, b) => b.total - a.total)
    res.json({ workspaces: rows })
  } catch (err) { next(err) }
}

module.exports = { getStorage, getStorageByWorkspace, getStorageHistoryHandler, cleanupOrphanImagesHandler }
