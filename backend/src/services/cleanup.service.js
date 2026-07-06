/**
 * Limpieza semanal de tablas de crecimiento ilimitado.
 *
 * Lee los umbrales desde PlatformSetting (gestionado desde SuperAdmin →
 * Configuración). Se ejecuta automáticamente cada domingo a las 03:00 ART,
 * y también puede dispararse manualmente desde el panel SuperAdmin cuando
 * se baja un retention setting y se quiere aplicar de inmediato.
 */
const prisma = require('../lib/prisma')
const { getSettings } = require('../lib/platformSettings')
const { findOrphanImageIds, cleanupOrphanImages } = require('./storageStats.service')

const RETENTION_KEYS = [
  'notificationReadRetentionDays',
  'notificationUnreadRetentionDays',
  'aiTokenLogsRetentionDays',
  'loginHistoryRetentionDays',
  'dailyInsightRetentionDays',
  'emailLogRetentionDays',
  'socialImageOrphanRetentionDays',
  'serpSnapshotRetentionDays',
  'followerLogRetentionDays',
  'conversionEventRetentionDays',
  'accessLogRetentionDays',
]

// Los 6 logs DIARIOS de seguidores comparten un solo retention (followerLogRetentionDays).
const FOLLOWER_LOG_MODELS = [
  'instagramFollowerLog',
  'tikTokFollowerLog',
  'linkedinFollowerLog',
  'facebookFollowerLog',
  'youTubeFollowerLog',
  'competitorFollowerLog',
]

function daysAgo(d) {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000)
}

/**
 * Cuenta cuántas filas se borrarían con los retention actuales (preview).
 * @param {string[]} tables — subset de ['notifications', 'aiTokenLog', 'userLogin',
 *   'dailyInsight', 'emailLog', 'socialImages', 'serpSnapshots', 'followerLogs',
 *   'conversionEvents', 'accessLogs']
 */
async function previewWeeklyCleanup(tables = null) {
  const s = await getSettings(RETENTION_KEYS)
  const result = {}

  if (!tables || tables.includes('notifications')) {
    result.notifications = await prisma.notification.count({
      where: {
        OR: [
          { read: true,  createdAt: { lt: daysAgo(s.notificationReadRetentionDays)   } },
          { read: false, createdAt: { lt: daysAgo(s.notificationUnreadRetentionDays) } },
        ],
      },
    })
  }
  if (!tables || tables.includes('aiTokenLog')) {
    result.aiTokenLog = await prisma.aiTokenLog.count({
      where: { createdAt: { lt: daysAgo(s.aiTokenLogsRetentionDays) } },
    })
  }
  if (!tables || tables.includes('userLogin')) {
    result.userLogin = await prisma.userLogin.count({
      where: { loginAt: { lt: daysAgo(s.loginHistoryRetentionDays) } },
    })
  }
  if (!tables || tables.includes('dailyInsight')) {
    result.dailyInsight = await prisma.dailyInsight.count({
      where: { createdAt: { lt: daysAgo(s.dailyInsightRetentionDays) } },
    })
  }
  if (!tables || tables.includes('emailLog')) {
    result.emailLog = await prisma.emailLog.count({
      where: { createdAt: { lt: daysAgo(s.emailLogRetentionDays) } },
    })
  }
  if (!tables || tables.includes('socialImages')) {
    const ids = await findOrphanImageIds({ olderThanDays: s.socialImageOrphanRetentionDays })
    result.socialImages = ids.length
  }
  if ((!tables || tables.includes('serpSnapshots')) && s.serpSnapshotRetentionDays > 0) {
    result.serpSnapshots = await prisma.serpSnapshot.count({
      where: { capturedAt: { lt: daysAgo(s.serpSnapshotRetentionDays) } },
    })
  }
  if ((!tables || tables.includes('followerLogs')) && s.followerLogRetentionDays > 0) {
    const cutoff = daysAgo(s.followerLogRetentionDays)
    const counts = await Promise.all(
      FOLLOWER_LOG_MODELS.map(m => prisma[m].count({ where: { createdAt: { lt: cutoff } } }))
    )
    result.followerLogs = counts.reduce((a, b) => a + b, 0)
  }
  if ((!tables || tables.includes('conversionEvents')) && s.conversionEventRetentionDays > 0) {
    result.conversionEvents = await prisma.conversionEvent.count({
      where: { createdAt: { lt: daysAgo(s.conversionEventRetentionDays) } },
    })
  }
  if ((!tables || tables.includes('accessLogs')) && s.accessLogRetentionDays > 0) {
    result.accessLogs = await prisma.projectAccessLog.count({
      where: { createdAt: { lt: daysAgo(s.accessLogRetentionDays) } },
    })
  }
  return result
}

/**
 * Ejecuta la limpieza con los retention settings actuales.
 * @param {string[]} tables — subset opcional (por defecto todas)
 * @returns {Promise<Record<string, number>>} — filas eliminadas por tabla
 */
async function runWeeklyCleanup(tables = null) {
  const s = await getSettings(RETENTION_KEYS)
  const result = {}

  if (!tables || tables.includes('notifications')) {
    const { count } = await prisma.notification.deleteMany({
      where: {
        OR: [
          { read: true,  createdAt: { lt: daysAgo(s.notificationReadRetentionDays)   } },
          { read: false, createdAt: { lt: daysAgo(s.notificationUnreadRetentionDays) } },
        ],
      },
    })
    result.notifications = count
  }
  if (!tables || tables.includes('aiTokenLog')) {
    const { count } = await prisma.aiTokenLog.deleteMany({
      where: { createdAt: { lt: daysAgo(s.aiTokenLogsRetentionDays) } },
    })
    result.aiTokenLog = count
  }
  if (!tables || tables.includes('userLogin')) {
    const { count } = await prisma.userLogin.deleteMany({
      where: { loginAt: { lt: daysAgo(s.loginHistoryRetentionDays) } },
    })
    result.userLogin = count
  }
  if (!tables || tables.includes('dailyInsight')) {
    const { count } = await prisma.dailyInsight.deleteMany({
      where: { createdAt: { lt: daysAgo(s.dailyInsightRetentionDays) } },
    })
    result.dailyInsight = count
  }
  if (!tables || tables.includes('emailLog')) {
    const { count } = await prisma.emailLog.deleteMany({
      where: { createdAt: { lt: daysAgo(s.emailLogRetentionDays) } },
    })
    result.emailLog = count
  }
  if (!tables || tables.includes('socialImages')) {
    // En el cron no corremos VACUUM FULL (toma lock); el hueco que deja el
    // DELETE se reutiliza con las próximas imágenes. El VACUUM manual está en
    // SuperAdmin → Almacenamiento para recuperar disco físico cuando haga falta.
    const { deleted } = await cleanupOrphanImages({
      olderThanDays: s.socialImageOrphanRetentionDays,
      vacuum: false,
    })
    result.socialImages = deleted
  }
  if ((!tables || tables.includes('serpSnapshots')) && s.serpSnapshotRetentionDays > 0) {
    const { count } = await prisma.serpSnapshot.deleteMany({
      where: { capturedAt: { lt: daysAgo(s.serpSnapshotRetentionDays) } },
    })
    result.serpSnapshots = count
  }
  if ((!tables || tables.includes('followerLogs')) && s.followerLogRetentionDays > 0) {
    const cutoff = daysAgo(s.followerLogRetentionDays)
    const counts = await Promise.all(
      FOLLOWER_LOG_MODELS.map(m => prisma[m].deleteMany({ where: { createdAt: { lt: cutoff } } }))
    )
    result.followerLogs = counts.reduce((a, r) => a + r.count, 0)
  }
  if ((!tables || tables.includes('conversionEvents')) && s.conversionEventRetentionDays > 0) {
    const { count } = await prisma.conversionEvent.deleteMany({
      where: { createdAt: { lt: daysAgo(s.conversionEventRetentionDays) } },
    })
    result.conversionEvents = count
  }
  if ((!tables || tables.includes('accessLogs')) && s.accessLogRetentionDays > 0) {
    const { count } = await prisma.projectAccessLog.deleteMany({
      where: { createdAt: { lt: daysAgo(s.accessLogRetentionDays) } },
    })
    result.accessLogs = count
  }

  return result
}

module.exports = { previewWeeklyCleanup, runWeeklyCleanup, RETENTION_KEYS }
