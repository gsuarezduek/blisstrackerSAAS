const {
  getDatabaseSize,
  getSocialImageStats,
  cleanupOrphanImages,
} = require('../services/storageStats.service')

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

module.exports = { getStorage, cleanupOrphanImagesHandler }
