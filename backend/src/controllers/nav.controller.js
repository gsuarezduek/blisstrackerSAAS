const prisma = require('../lib/prisma')
const { hasModuleAccess } = require('../lib/moduleAccess')
const { isFlagEnabledForWorkspace } = require('../lib/featureFlags')
const { isSalesUser } = require('../middleware/workspace')
const { CONTENIDO_PROJECT_WHERE } = require('../lib/projectModules')
const { CONTENT_STATUSES } = require('../lib/contentCatalog')
const { openFinanceTasksWhere } = require('./finanzas/_shared')
const vacationController = require('./vacation.controller')
const benefitsController = require('./benefits.controller')

// Contadores para los avisos de la barra lateral: una sola llamada en vez de que
// cada módulo pollee lo suyo desde cada página.
//
// CRITERIO DE QUÉ SE MUESTRA: número donde hay mensajes de gente esperando respuesta
// (WhatsApp), punto donde hay algo para resolver (Finanzas, RRHH, Contenido). El punto
// evita la falsa precisión y la presión de "llegar a cero" en colas que no son
// conversaciones.
//
// ESTE ENDPOINT CORRE EN CADA NAVEGACIÓN de cada persona (con caché en el cliente,
// ver hooks/useNavCounts.js). Está PROHIBIDO llamar desde acá a:
//   - `syncGeneratedTasks` (finanzas): el GET /finanzas/tasks la corre como efecto de
//     escritura — 7 reglas + una transacción. Acá solo se LEE lo ya materializado, así
//     que el punto puede quedar atrasado hasta que alguien abra Finanzas. Para un punto
//     alcanza; si hiciera falta frescura real, el lugar es un cron, no este endpoint.
//   - `computeWorkspacePendingSummary` (marketing), `computeLeaderboard` (gamification),
//     `materializeChannels` (chat): todos recorren datos o pegan contra APIs externas.
// Todas las queries de acá son `count` sobre `workspaceId` indexado, sin `include`.
//
// SOBRE LOS PERMISOS: una clave AUSENTE significa "este módulo no aplica para vos"
// (ausente ≠ `{ dot: false }`). Así el front nunca pinta un aviso de algo que la
// persona no puede abrir, y el backend nunca corre esa query. El gating usa los mismos
// helpers que los guards de cada módulo (`hasModuleAccess`, `isSalesUser`,
// `isFlagEnabledForWorkspace`): si se desincronizaran, alguien sin acceso a RRHH se
// enteraría de que hay solicitudes pendientes.

const AWAITING_CLIENT_STATUSES = CONTENT_STATUSES.filter(s => s.awaitingClient).map(s => s.key)

/** admin/owner del workspace — mismo criterio que `workspaceAdminOnly`, evaluado acá. */
function isAdminMember(req) {
  return req.workspaceMember?.role === 'admin' || req.workspaceMember?.role === 'owner'
}

/** ¿El flag está activo para este workspace? Mismo criterio que `requireFeatureFlag`. */
async function flagOn(req, key) {
  if (req.user?.isSuperAdmin) return true
  const flag = await prisma.featureFlag.findUnique({ where: { key } })
  const disabledKeys = JSON.parse(req.workspace?.disabledFeatureKeys ?? '[]')
  return isFlagEnabledForWorkspace(flag, req.workspace?.id, disabledKeys)
}

/**
 * Mensajes de WhatsApp entrantes sin leer, en una sola query.
 *
 * `WhatsappConversation` no guarda `lastMessageId` (solo `lastMessageAt`), así que el
 * patrón de `listChannels` del chat — un `count` por fila — sería N+1 sobre todas las
 * conversaciones del workspace. Acá va un join contra `WhatsappConversationRead`, que
 * es el mismo mecanismo de no-leídos que usa el chat interno (`lastReadMessageId`).
 *
 * Dos diferencias a propósito con el `unread` booleano de `listConversations`:
 *  - `direction = 'in'`: si no, mandar un mensaje deja la conversación "no leída"
 *    hasta volver a abrirla, y lo que se cuenta acá es "me escribieron".
 *  - sin reacciones (`reactionEmoji`): mismo criterio que `awaitingReply`.
 */
async function countWhatsappUnread(workspaceId, userId) {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n
    FROM "WhatsappMessage" m
    JOIN "WhatsappConversation" c ON c.id = m."conversationId"
    LEFT JOIN "WhatsappConversationRead" r
           ON r."conversationId" = c.id AND r."userId" = ${userId}
    WHERE c."workspaceId" = ${workspaceId}
      AND c."isBlocked" = false
      AND m.direction = 'in'
      AND m."reactionEmoji" IS NULL
      AND m.id > COALESCE(r."lastReadMessageId", 0)
  `
  return rows?.[0]?.n ?? 0
}

/**
 * Piezas de Contenido esperando respuesta del cliente, en todo el workspace. Es la
 * versión cross-proyecto del `awaitingClient` que `getSummary` ya calcula por proyecto
 * (content/history.controller.js). El estado sale del catálogo, no hardcodeado, y los
 * proyectos con Contenido apagado quedan afuera por `CONTENIDO_PROJECT_WHERE`.
 */
function countContentAwaitingClient(workspaceId, req) {
  const userId = req.user?.userId
  return prisma.contentPiece.count({
    where: {
      workspaceId,
      deletedAt: null,
      status: { in: AWAITING_CLIENT_STATUSES },
      project: {
        ...CONTENIDO_PROJECT_WHERE,
        // Proyectos privados: mismo criterio que el resto de las lecturas del workspace.
        ...(isAdminMember(req) ? {} : {
          OR: [{ isPrivate: false }, { isPrivate: true, members: { some: { userId } } }],
        }),
      },
    },
  })
}

// GET /api/nav/counts
async function getCounts(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const modules = {}

    // Qué módulos aplican. Se resuelven primero los flags (una query cada uno) y
    // recién después se arma el Promise.all: alguien sin ningún módulo no corre
    // ninguna de las queries de conteo.
    const [whatsappFlag, rrhhFlag, contenidoFlag, finanzasFlag] = await Promise.all([
      isSalesUser(req) ? flagOn(req, 'whatsapp') : false,
      hasModuleAccess(req, 'rrhh') ? flagOn(req, 'rrhh') : false,
      hasModuleAccess(req, 'contenido') ? flagOn(req, 'contenido') : false,
      hasModuleAccess(req, 'finanzas') ? flagOn(req, 'finanzas') : false,
    ])

    const jobs = []
    if (whatsappFlag) {
      jobs.push(countWhatsappUnread(workspaceId, userId).then(n => {
        modules.ventas = { subs: { whatsapp: { n } } }
      }))
    }
    if (rrhhFlag) {
      jobs.push(Promise.all([
        vacationController.countPendingRequests(workspaceId),
        benefitsController.countPendingRequests(workspaceId),
      ]).then(([licencias, beneficios]) => {
        modules.rrhh = { dot: licencias + beneficios > 0 }
      }))
    }
    if (contenidoFlag) {
      jobs.push(countContentAwaitingClient(workspaceId, req).then(n => {
        modules.contenido = { dot: n > 0 }
      }))
    }
    if (finanzasFlag) {
      jobs.push(prisma.financeTask.count({ where: openFinanceTasksWhere(workspaceId) }).then(n => {
        modules.finanzas = { dot: n > 0 }
      }))
    }

    await Promise.all(jobs)

    res.set('Cache-Control', 'no-store')
    res.json({ modules, at: new Date().toISOString() })
  } catch (err) { next(err) }
}

module.exports = { getCounts }
