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

const RETENTION_KEYS = [
  'notificationReadRetentionDays',
  'notificationUnreadRetentionDays',
  'aiTokenLogsRetentionDays',
  'loginHistoryRetentionDays',
  'dailyInsightRetentionDays',
  'emailLogRetentionDays',
]

function daysAgo(d) {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000)
}

/**
 * Cuenta cuántas filas se borrarían con los retention actuales (preview).
 * @param {string[]} tables — subset de ['notifications', 'aiTokenLog', 'userLogin', 'dailyInsight', 'emailLog']
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

  return result
}

module.exports = { previewWeeklyCleanup, runWeeklyCleanup, RETENTION_KEYS }
