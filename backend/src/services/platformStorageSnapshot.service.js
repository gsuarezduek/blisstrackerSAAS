/**
 * Tendencia histórica del storage total de la plataforma (R2, todos los
 * workspaces sumados) — un `PlatformStorageSnapshot` por mes calendario.
 *
 * Doble escritura, mismo patrón que `rrhhMetricSnapshot.service.js`:
 *   - `upsertCurrentMonthSnapshot()` — se llama en cada carga de SuperAdmin →
 *     Almacenamiento (fire-and-forget), mantiene el mes EN CURSO actualizado
 *     con el valor de hoy. Si nadie visita la página en todo un mes, ese mes
 *     no queda registrado por esta vía.
 *   - `freezeLastMonthSnapshot()` — corre en la cadena mensual (1° del mes),
 *     usando el total EN ESE MOMENTO como mejor aproximación del cierre del
 *     mes anterior (no hay forma de calcular retroactivamente sobre tablas en
 *     vivo). Garantiza que todos los meses queden registrados sin depender de
 *     que alguien abra el panel. También dispara el aviso de umbral (ver
 *     abajo) — un solo lugar, una sola vez por mes.
 */
const prisma = require('../lib/prisma')
const { prevMonthStr } = require('../lib/monthUtils')
const { getSetting } = require('../lib/platformSettings')
const { computeGlobalR2Totals } = require('./workspaceStorage.service')
const { sendPlatformNotification, platformCard } = require('./email/_shared')

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7) // "YYYY-MM" en UTC — un mes de diferencia no importa para esta métrica
}

function fmtGb(bytes) {
  return (bytes / (1024 ** 3)).toFixed(1)
}

async function upsertSnapshot(month, { totalBytes, breakdown }) {
  await prisma.platformStorageSnapshot.upsert({
    where:  { month },
    create: { month, totalBytes, breakdown },
    update: { totalBytes, breakdown },
  })
}

/** Actualiza el snapshot del mes en curso con el total de HOY. Best-effort, nunca lanza. */
async function upsertCurrentMonthSnapshot() {
  try {
    const totals = await computeGlobalR2Totals()
    await upsertSnapshot(currentMonthStr(), totals)
  } catch (err) {
    console.error('[PlatformStorageSnapshot] Error en upsert del mes en curso:', err.message)
  }
}

/**
 * Congela el mes que acaba de terminar (llamar el 1° del mes) y evalúa el
 * aviso de umbral. Aislado en su propio try — un fallo acá no debe cortar la
 * cadena mensual.
 */
async function freezeLastMonthSnapshot() {
  const totals = await computeGlobalR2Totals()
  const month = prevMonthStr(currentMonthStr())
  await upsertSnapshot(month, totals)

  const thresholdGb = await getSetting('platformStorageAlertThresholdGb')
  const totalGb = totals.totalBytes / (1024 ** 3)
  if (totalGb >= thresholdGb) {
    await sendPlatformNotification('storageThreshold', {
      subject: `⚠️ Almacenamiento de la plataforma: ${fmtGb(totals.totalBytes)} GB (umbral: ${thresholdGb} GB)`,
      bodyHtml: platformCard(`Almacenamiento sobre el umbral — ${month}`, [
        ['Total en R2', `${fmtGb(totals.totalBytes)} GB`],
        ['Umbral configurado', `${thresholdGb} GB`],
        ['Archivos (Nube)', `${fmtGb(totals.breakdown.archivos)} GB`],
        ['Contenido', `${fmtGb(totals.breakdown.contenido)} GB`],
        ['Imágenes de RRSS', `${fmtGb(totals.breakdown.imagenesSociales)} GB`],
        ['WhatsApp', `${fmtGb(totals.breakdown.whatsapp)} GB`],
        ['Chat', `${fmtGb(totals.breakdown.chat)} GB`],
      ], '#DC2626'),
    })
  }
}

/**
 * Historial mensual para graficar la tendencia (SuperAdmin → Almacenamiento).
 * @param {number} months — cuántos meses hacia atrás, default 12
 */
async function getStorageHistory(months = 12) {
  const rows = await prisma.platformStorageSnapshot.findMany({
    orderBy: { month: 'desc' },
    take: months,
  })
  return rows.reverse() // ascendente, para graficar de izquierda a derecha
}

module.exports = {
  upsertCurrentMonthSnapshot,
  freezeLastMonthSnapshot,
  getStorageHistory,
  currentMonthStr,
}
