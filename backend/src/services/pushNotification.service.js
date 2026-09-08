const prisma = require('../lib/prisma')

// Servicio de Expo Push (no Firebase/APNs directo): un solo tipo de token
// (`ExponentPushToken[...]`) sirve tanto para Android como iOS, sin necesidad
// de credenciales propias ni de "prebuild" para salir del managed workflow de
// Expo — es justo lo que Expo simplifica. No requiere configuración para
// funcionar (a diferencia de Stripe/Apify no hay env var "no configurado" acá).
//
// `expo-server-sdk` (7.x) es un paquete ESM-only ("type": "module") — el resto
// del backend es CommonJS, así que se carga con `import()` dinámico en vez de
// `require()` (que fallaría con "Cannot use import statement outside a
// module"), cacheando la instancia entre llamadas.
let modulePromise = null
function loadExpoModule() {
  if (!modulePromise) modulePromise = import('expo-server-sdk')
  return modulePromise
}

// Validación de formato, usada también por devices.controller.js al registrar
// un token nuevo — no vale la pena guardar algo que no es un token de Expo.
async function isValidPushToken(token) {
  const { Expo } = await loadExpoModule()
  return Expo.isExpoPushToken(token)
}

const PUSH_TITLE = {
  TASK_MENTION: 'Te mencionaron',
  TASK_COMMENT: 'Nuevo comentario',
  COMPLETED:    'Tarea completada',
  BLOCKED:      'Tarea bloqueada',
  UNBLOCKED:    'Tarea desbloqueada',
  CHAT_MENTION: 'Chat',
}

// Envía un push a todos los dispositivos registrados de un usuario en un
// workspace. Best-effort: nunca lanza — se llama fire-and-forget desde los
// controllers justo después de crear la Notification correspondiente, nunca
// bloquea la respuesta HTTP. `type`/`taskId`/`channelId` viajan en `data` para
// que la app pueda deep-linkear al tocar la notificación (a una tarea o a un
// canal de chat, según cuál venga).
async function sendPushToUser({ userId, workspaceId, type, message, taskId, channelId }) {
  try {
    const tokens = await prisma.deviceToken.findMany({
      where: { userId, workspaceId },
      select: { id: true, token: true },
    })
    if (!tokens.length) return

    const { Expo } = await loadExpoModule()
    const valid = tokens.filter(t => Expo.isExpoPushToken(t.token))
    if (!valid.length) return

    const messages = valid.map(t => ({
      to: t.token,
      title: PUSH_TITLE[type] || 'BlissTracker',
      body: message,
      data: {
        type,
        ...(taskId != null ? { taskId } : {}),
        ...(channelId != null ? { channelId } : {}),
      },
    }))

    const expo = new Expo()
    const chunks = expo.chunkPushNotifications(messages)
    const tickets = []
    for (const chunk of chunks) {
      const result = await expo.sendPushNotificationsAsync(chunk)
      tickets.push(...result)
    }

    // Tokens de dispositivos que desinstalaron la app o expiraron — se limpian
    // para no seguir intentando enviarles en cada notificación futura.
    const staleIds = tickets
      .map((ticket, i) => (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' ? valid[i].id : null))
      .filter(Boolean)
    if (staleIds.length) {
      await prisma.deviceToken.deleteMany({ where: { id: { in: staleIds } } }).catch(() => {})
    }
  } catch (err) {
    console.error('[Push] Error enviando notificación:', err.message)
  }
}

module.exports = { sendPushToUser, isValidPushToken }
