const {
  getDatabaseSize,
  getSocialImageStats,
  cleanupOrphanImages,
} = require('../services/storageStats.service')
const { computeAllWorkspacesStorageUsage } = require('../services/workspaceStorage.service')
const prisma = require('../lib/prisma')

/**
 * GET /api/superadmin/storage
 * Tamaño total de la DB + top tablas + desglose de SocialImage (en uso vs huérfanas).
 */
async function getStorage(req, res, next) {
  try {
    const [database, socialImages] = await Promise.all([
      getDatabaseSize(12),
      getSocialImageStats(),
    ])
    res.json({ database, socialImages })
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
    const [usage, workspaces] = await Promise.all([
      computeAllWorkspacesStorageUsage(),
      prisma.workspace.findMany({
        select: { id: true, name: true, slug: true, status: true, storageLimitMb: true },
      }),
    ])
    const usageByWs = new Map(usage.map(u => [u.workspaceId, u]))
    const empty = { archivos: 0, contenido: 0, imagenesSociales: 0, whatsapp: 0, total: 0 }
    const rows = workspaces
      .map(w => ({
        workspaceId: w.id,
        name: w.name,
        slug: w.slug,
        status: w.status,
        storageLimitMb: w.storageLimitMb,
        ...(usageByWs.get(w.id) ?? empty),
      }))
      .sort((a, b) => b.total - a.total)
    res.json({ workspaces: rows })
  } catch (err) { next(err) }
}

module.exports = { getStorage, getStorageByWorkspace, cleanupOrphanImagesHandler }
