const prisma = require('./prisma')

/**
 * Persiste un llamado a Apify en ApifyUsageLog (no bloqueante — nunca lanza).
 * Se llama sin `await` desde `runApifyActor` (socialScrape.service.js), el único
 * punto central por el que pasan todas las vías de scraping.
 * @param {object} params
 * @param {number|null} params.workspaceId
 * @param {number|null} params.projectId
 * @param {string} params.platform    'instagram' | 'linkedin' | 'facebook'
 * @param {string} params.action      'connect' | 'refresh' | 'monthly_snapshot' | 'diagnostic' | 'collab_merge' | 'competitor_add' | 'competitor_refresh' | 'competitor_monthly_snapshot'
 * @param {number|null} params.tokenId
 * @param {string} params.tokenLabel
 * @param {boolean} params.success
 * @param {number|null} [params.itemCount]
 * @param {string|null} [params.errorMsg]
 */
async function logApifyUsage({ workspaceId, projectId, platform, action, tokenId, tokenLabel, success, itemCount = null, errorMsg = null }) {
  try {
    await prisma.apifyUsageLog.create({
      data: {
        workspaceId: workspaceId ?? null,
        projectId:   projectId   ?? null,
        platform,
        action,
        tokenId:     tokenId ?? null,
        tokenLabel,
        success,
        itemCount,
        errorMsg:    errorMsg ? String(errorMsg).slice(0, 1000) : null,
      },
    })
  } catch (err) {
    console.error('[logApifyUsage] Error al guardar uso de Apify:', err.message)
  }
}

module.exports = { logApifyUsage }
