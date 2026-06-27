const prisma = require('../lib/prisma')
const { inArrivalWindow } = require('../lib/attendance')

// Texto por defecto del email de tardanza. Placeholders: [Nombre] y [workspace].
const DEFAULT_LATE_TEMPLATE = `Hola [Nombre],

Esperamos que estés bien. Te escribimos porque en los últimos días registramos varias instancias de conexión fuera del horario establecido, y queremos aprovechar este mensaje no para señalarte, sino para abrir un espacio de reflexión.

En [workspace], la puntualidad es mucho más que un dato en un sistema: es una forma de respeto. Respeto hacia tus compañeros y compañeras que sí están listos a tiempo, hacia los procesos que dependen de que el equipo esté completo, y también hacia vos mismo y tu compromiso con el trabajo que hacés. La cultura que queremos construir juntos se sostiene en esos pequeños gestos cotidianos.

Si estás teniendo alguna dificultad técnica o personal con el horario, sabés que podés acercarte a nosotros para charlarlo. De lo contrario, te pedimos especial atención para regularizar esta situación el resto de la semana.

¡Muchas gracias por tu compromiso y por cuidar la energía de todo el equipo!`

function loginMinsFromMidnight(iso, tz) {
  const d = new Date(iso)
  const h = Number(d.toLocaleString('en-CA', { hour: 'numeric', hour12: false, timeZone: tz }))
  const m = Number(d.toLocaleString('en-CA', { minute: 'numeric', timeZone: tz }))
  return h * 60 + m
}

// Minutos de tardanza de una llegada por encima del límite tolerado (workStartTime + tolerancia).
// > 0 = tarde. Es la fuente única de la regla de tardanza para la notificación.
function lateMinutes(iso, tz, startMins, tolerance = 0) {
  return loginMinsFromMidnight(iso, tz) - startMins - tolerance
}

/**
 * Evalúa si un usuario acumuló suficientes tardanzas (en los últimos 30 días) como para
 * enviarle el email de notificación, y lo envía. Se llama fire-and-forget tras cada login.
 * Nunca lanza. Sólo dispara en una llegada tardía (la de hoy) y deduplica a 1 envío / 30 días.
 */
async function checkAndNotifyLate(userId, workspaceId) {
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.attendanceTrackingEnabled === false || !workspace.lateNotifyEnabled) return

    const tz = workspace.timezone
    const tolerance = workspace.lateToleranceMins ?? 0
    const threshold = Math.max(1, Math.min(10, workspace.lateNotifyThreshold ?? 3))

    const [member, user] = await Promise.all([
      prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { workStartTime: true, active: true },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    ])
    if (!member?.active || !member.workStartTime || !user?.email) return

    const [sh, sm] = member.workStartTime.split(':').map(Number)
    const startMins = sh * 60 + sm
    // Tarde = llegada dentro de la ventana de ±2h Y por encima del horario + tolerancia.
    // Un ingreso fuera de la ventana (domingo a la tarde) no es una llegada → no es tardanza.
    const isLate = iso => inArrivalWindow(loginMinsFromMidnight(iso, tz), startMins) && lateMinutes(iso, tz, startMins, tolerance) > 0

    const since = new Date(); since.setDate(since.getDate() - 30)
    const logins = await prisma.userLogin.findMany({
      where: { userId, workspaceId, loginAt: { gte: since } },
      select: { loginAt: true },
      orderBy: { loginAt: 'asc' },
    })
    if (!logins.length) return

    // Primer ingreso de cada día (la "llegada")
    const firstByDay = {}
    for (const l of logins) {
      const day = new Date(l.loginAt).toLocaleDateString('en-CA', { timeZone: tz })
      if (!firstByDay[day]) firstByDay[day] = l.loginAt
    }

    // Sólo notificamos cuando la llegada de HOY fue tardía (el email acompaña una tardanza real).
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })
    if (!firstByDay[today] || !isLate(firstByDay[today])) return

    const lateDays = Object.values(firstByDay).filter(isLate).length
    if (lateDays < threshold) return

    // Dedup: no reenviar si ya se notificó a esta persona en los últimos 30 días.
    const already = await prisma.emailLog.findFirst({
      where: { workspaceId, to: user.email, type: 'lateNotification', status: 'sent', createdAt: { gte: since } },
      select: { id: true },
    })
    if (already) return

    const { sendLateNotificationEmail } = require('./email.service')
    await sendLateNotificationEmail(
      user.email, user.name, workspace.name,
      workspace.lateNotifyTemplate || DEFAULT_LATE_TEMPLATE,
      workspaceId,
    )
  } catch (err) {
    console.error('[lateNotification]', err.message)
  }
}

// Dispara el chequeo sin bloquear ni propagar errores (para usar en el flujo de login).
function triggerLateCheck(userId, workspaceId) {
  setImmediate(() => { checkAndNotifyLate(userId, workspaceId) })
}

module.exports = { DEFAULT_LATE_TEMPLATE, checkAndNotifyLate, triggerLateCheck, lateMinutes }
