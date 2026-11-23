const prisma = require('../lib/prisma')
const { taskMins } = require('../lib/timeMetrics')
const { isAdmin, filterVisibleTasks } = require('../lib/projectAccess')
const { generateToken } = require('../lib/mcpTokens')
const { hashPrefixOf, fingerprintOfPrefix } = require('../services/mcpAuthFailure.service')
const { utcRange, mondayOf, periodBounds, readPeriodQuery, todayIn } = require('../lib/profilePeriods')

// Agentes IA como ENTIDAD del producto, separada de la credencial.
//
// La fila `McpToken` es el agente (su `label` es su nombre, su `tokenHash` la credencial
// con la que se conecta). Este controller expone la mitad "entidad": quién es, de quién
// es, en qué proyectos trabaja y qué hizo. La mitad "credencial" (canales de salida,
// recordatorio, revocar, el valor del token) sigue en mcpTokens.controller.js.
//
// Por qué están separados y no es un `select` más del mismo endpoint: `/api/agents` lo
// lee CUALQUIER miembro del workspace (es un roster, como el de personas), mientras que
// `/api/mcp-tokens` devuelve `webhookSecret` y solo se lo sirve a su dueño. Mezclarlos
// sería a un `select` de distancia de filtrar un secreto a todo el workspace.

// Paleta de colores de identidad del agente. Espejo de frontend/src/utils/agentColor.js
// (mantener los dos en sync, mismo criterio que connectionCatalog.js).
const AGENT_COLORS = ['sky', 'violet', 'emerald', 'amber', 'rose', 'cyan', 'indigo', 'teal']

// Lo único que sale de un agente hacia el workspace. Sin `tokenHash`, sin `webhook*`,
// sin `wake*`, sin `authFailures`: nada de eso es identidad, todo eso es credencial.
const AGENT_PUBLIC_SELECT = {
  id: true, label: true, color: true, teamRole: true, description: true,
  createdAt: true, lastUsedAt: true,
  user: { select: { id: true, name: true, avatar: true } },
  projects: { select: { project: { select: { id: true, name: true } } } },
}

// Forma pública de un agente. `isMine` evita que el frontend tenga que conocer el id del
// usuario para decidir si muestra "Editar".
//
// Enumera los campos uno por uno en vez de hacer spread de la fila a propósito: los
// callers que necesitan campos internos (`webhookUrl`, `userId`, `revokedAt`) los piden
// en su `select` para decidir permisos, y con un spread esos campos salían en la
// respuesta sin que nadie lo notara — que es exactamente la fuga que esta separación
// entre entidad y credencial viene a evitar.
function shapeAgent(row, viewerUserId) {
  return {
    id: row.id,
    label: row.label,
    color: row.color,
    teamRole: row.teamRole,
    description: row.description,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    owner: row.user ?? null,
    projects: (row.projects ?? []).map(p => p.project),
    isMine: row.user?.id === viewerUserId,
  }
}

// Include para las tareas de la ficha. Espejo de `profileTaskInclude` de
// users.controller.js — `isAgentTask`/`agentName` son escalares y NO van acá (un
// `include` que los nombre es un error de validación de Prisma que tira 500).
const agentTaskInclude = {
  project: { select: { id: true, name: true, isPrivate: true } },
  createdBy: { select: { id: true, name: true, avatar: true } },
  user: { select: { id: true, name: true, avatar: true } },
  _count: { select: { comments: true } },
  agent: { select: { id: true, label: true, color: true } },
}

// Tareas que le tocan a este agente: las suyas + las delegadas a "cualquiera de los
// agentes de su dueño" (`agentId: null`), que es el mismo scope que usan agent-queue y
// la bandeja de novedades. Si acá fuera solo `agentId`, la ficha mostraría menos trabajo
// del que el agente realmente puede tomar.
function agentScopeWhere(agent) {
  return {
    isAgentTask: true,
    OR: [{ agentId: agent.id }, { agentId: null, userId: agent.userId }],
  }
}

// GET /api/agents?mine=true — roster de agentes del workspace. Cualquier miembro.
// Solo los no revocados: un agente dado de baja no es parte del equipo (su historial
// sigue vivo en las tareas, que es donde importa).
async function listAgents(req, res, next) {
  try {
    const where = { workspaceId: req.workspace.id, revokedAt: null }
    if (req.query.mine === 'true') where.userId = req.user.userId

    const rows = await prisma.mcpToken.findMany({
      where,
      select: AGENT_PUBLIC_SELECT,
      orderBy: [{ label: 'asc' }, { id: 'asc' }],
    })
    res.json(rows.map(r => shapeAgent(r, req.user.userId)))
  } catch (err) { next(err) }
}

// Busca un agente del workspace por id. Devuelve null si no existe o es de otro
// workspace (nunca 403 distinto de 404: no se confirma la existencia cross-workspace).
async function findAgent(req, select) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return null
  const row = await prisma.mcpToken.findUnique({ where: { id }, select })
  if (!row || row.workspaceId !== req.workspace.id) return null
  return row
}

// Editar la identidad: el dueño, o un admin/owner del workspace. Nunca `isSuperAdmin`
// (ver la regla en backend/CLAUDE.md: el flag global no eleva permisos dentro de un
// workspace).
function canEditAgent(req, agent) {
  return agent.userId === req.user.userId || isAdmin(req)
}

// GET /api/agents/:id — la ficha del agente. Espeja getUserProfile de users.controller.js.
async function getAgentProfile(req, res, next) {
  try {
    const agent = await findAgent(req, {
      ...AGENT_PUBLIC_SELECT,
      workspaceId: true, userId: true, revokedAt: true,
      webhookUrl: true, wakeEnabled: true,
      rotatedAt: true, prevTokenPrefix: true,
    })
    if (!agent) return res.status(404).json({ error: 'Agente no encontrado' })

    const workspaceId = req.workspace.id
    const TZ = req.workspace.timezone
    const todayStr = todayIn(TZ)
    const monthStart = `${todayStr.slice(0, 7)}-01`
    const weekStart = mondayOf(todayStr)
    const scope = agentScopeWhere(agent)

    const [completedMonth, openTasks] = await Promise.all([
      // Completadas del mes en curso (1 → hoy); se bucketea día/semana/mes en JS, igual
      // que la ficha de una persona.
      prisma.task.findMany({
        where: { ...scope, status: 'COMPLETED', workDay: { workspaceId }, completedAt: utcRange(monthStart, todayStr, TZ) },
        select: { completedAt: true, minutesOverride: true, startedAt: true, pausedMinutes: true },
      }),
      prisma.task.findMany({
        where: { ...scope, status: { not: 'COMPLETED' }, workDay: { workspaceId } },
        include: agentTaskInclude,
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const { gte: dayFrom } = utcRange(todayStr, todayStr, TZ)
    const { gte: weekFrom } = utcRange(weekStart, todayStr, TZ)
    // Un agente no tiene "mitad humana", así que el bucket es plano: `count`/`minutes`
    // son suyos. La convención totalMinutes/agentMinutes de lib/agentTasks.js es para
    // agregados MIXTOS (los de una persona o un proyecto), y acá no hay nada que partir.
    const emptyBucket = () => ({ count: 0, minutes: 0 })
    const add = (b, t) => { b.count++; b.minutes += taskMins(t) }
    const summary = { day: emptyBucket(), week: emptyBucket(), month: emptyBucket() }
    for (const t of completedMonth) {
      const at = new Date(t.completedAt)
      add(summary.month, t)
      if (at >= weekFrom) add(summary.week, t)
      if (at >= dayFrom) add(summary.day, t)
    }

    const [openVisible] = await filterVisibleTasks(req, [openTasks])
    const byStatus = { BLOCKED: [], IN_PROGRESS: [], PAUSED: [], PENDING: [] }
    for (const t of openVisible) if (byStatus[t.status]) byStatus[t.status].push(t)

    const shaped = shapeAgent(agent, req.user.userId)
    res.json({
      agent: shaped,
      summary,
      active: byStatus,
      // Salud de la credencial, solo para el dueño o un admin. Ver `agentHealth`.
      health: canEditAgent(req, agent) ? await agentHealth(agent) : null,
      // Los canales como booleanos y nada más: la URL del webhook y el estado de las
      // entregas son del dueño y viven en Preferencias. Acá solo se responde "¿está
      // enchufado?", que es lo que explica por qué un agente reacciona o no reacciona.
      channels: canEditAgent(req, agent)
        ? { hasWebhook: !!agent.webhookUrl, wakeEnabled: agent.wakeEnabled }
        : null,
      canEdit: canEditAgent(req, agent),
    })
  } catch (err) { next(err) }
}

// Salud de la credencial de un agente — la respuesta a "¿está conectado de verdad?".
//
// Existe porque `lastUsedAt` MIENTE por omisión: solo se actualiza cuando el token
// autentica bien, así que un agente que quedó con el valor viejo después de una rotación
// muestra "último uso: ayer" y todo verde mientras falla cada request. Rotar implica un
// paso manual (pegar el token nuevo en el cliente MCP) y es justo el que se olvida.
//
// Dos señales, las dos atribuibles a ESTE agente:
//   staleSinceRotation — se rotó el token y no se volvió a conectar desde entonces.
//   rejected           — intentos rechazados que son suyos: los del token revocado
//                        (tienen `tokenId`) y los del valor anterior a la rotación, que
//                        llegan anónimos y se recuperan por el prefijo que guardamos.
//
// Se devuelve solo al dueño o a un admin: es estado de la credencial, no identidad.
async function agentHealth(agent) {
  // Los rechazos del token revocado ya tienen dueño en la fila; los del token viejo solo
  // se pueden encontrar por su fingerprint. Una sola query con las dos condiciones.
  const prevFingerprint = fingerprintOfPrefix(agent.prevTokenPrefix)
  const or = [{ tokenId: agent.id }]
  if (prevFingerprint) or.push({ fingerprint: prevFingerprint })
  const failures = await prisma.mcpAuthFailure.findMany({
    where: { OR: or },
    select: { reason: true, attempts: true, firstAt: true, lastAt: true },
    orderBy: { lastAt: 'desc' },
  })

  // Solo lo que pasó DESPUÉS de la última conexión buena. Las filas de rechazo viven
  // hasta que las limpia el cron de retención, así que sin este corte el aviso quedaba
  // pegado para siempre después de cualquier tropiezo ya resuelto — y un aviso que
  // siempre está prendido no avisa nada.
  //
  // El corte es por fila y no por intento porque la fila está agregada (un conector
  // reintenta cada ~40s y se cuenta en `attempts`): si algunos intentos fueron antes y
  // otros después, se muestra la fila entera. Erra para el lado de mostrar el problema.
  const live = agent.lastUsedAt ? failures.filter(f => f.lastAt > agent.lastUsedAt) : failures

  const rejected = live.reduce((acc, f) => {
    acc.attempts += f.attempts
    if (!acc.lastAt || f.lastAt > acc.lastAt) acc.lastAt = f.lastAt
    if (!acc.reason) acc.reason = f.reason
    return acc
  }, { attempts: 0, lastAt: null, reason: null })

  return {
    rotatedAt: agent.rotatedAt,
    // `null` (nunca se conectó) también cuenta como "no se volvió a conectar".
    staleSinceRotation: !!agent.rotatedAt && (!agent.lastUsedAt || agent.lastUsedAt < agent.rotatedAt),
    rejected: rejected.attempts ? rejected : null,
  }
}

// GET /api/agents/:id/completed?period=day|week|month&date=YYYY-MM-DD
async function getAgentCompleted(req, res, next) {
  try {
    const agent = await findAgent(req, { id: true, workspaceId: true, userId: true })
    if (!agent) return res.status(404).json({ error: 'Agente no encontrado' })

    const workspaceId = req.workspace.id
    const TZ = req.workspace.timezone
    const todayStr = todayIn(TZ)
    const { period, date } = readPeriodQuery(req.query, todayStr)
    const { startStr, endStr } = periodBounds(period, date)

    const tasksRaw = await prisma.task.findMany({
      where: {
        ...agentScopeWhere(agent), status: 'COMPLETED', workDay: { workspaceId },
        completedAt: utcRange(startStr, endStr, TZ),
      },
      include: agentTaskInclude,
      orderBy: { completedAt: 'desc' },
    })
    const [tasks] = await filterVisibleTasks(req, [tasksRaw])

    const total = { count: 0, minutes: 0 }
    const items = tasks.map(t => {
      const minutes = taskMins(t)
      total.count++
      total.minutes += minutes
      return {
        id: t.id, description: t.description, project: t.project,
        createdAt: t.createdAt, completedAt: t.completedAt, minutes,
        user: t.user, createdBy: t.createdBy, _count: t._count,
        isAgentTask: t.isAgentTask, agent: t.agent, agentName: t.agentName,
      }
    })

    res.json({ period, startDate: startStr, endDate: endStr, items, total })
  } catch (err) { next(err) }
}

const MAX_LABEL = 120
const MAX_DESCRIPTION = 500

// PATCH /api/agents/:id — identidad del agente. Campos independientes: se manda solo
// el que cambia (mismo criterio que updateMine de mcpTokens.controller.js).
async function updateAgent(req, res, next) {
  try {
    const agent = await findAgent(req, { id: true, workspaceId: true, userId: true, revokedAt: true })
    if (!agent) return res.status(404).json({ error: 'Agente no encontrado' })
    if (!canEditAgent(req, agent)) return res.status(403).json({ error: 'Solo su dueño o un admin puede editar este agente' })

    const data = {}

    if (req.body?.label !== undefined) {
      // El nombre del agente se podía poner al crearlo y nunca más. Renombrarlo obligaba
      // a revocar y crear otro, lo que parte su historial en dos (todas las FKs apuntan a
      // la fila vieja) — por eso es editable.
      const label = typeof req.body.label === 'string' ? req.body.label.trim().slice(0, MAX_LABEL) : ''
      if (!label) return res.status(400).json({ error: 'El nombre del agente no puede quedar vacío' })
      data.label = label
    }

    if (req.body?.color !== undefined) {
      const raw = typeof req.body.color === 'string' ? req.body.color.trim() : ''
      // '' vuelve al color derivado del nombre. Se valida contra la paleta y no se acepta
      // hex libre: el color tiene que seguir funcionando en modo oscuro y contra los
      // fondos de las dos vistas que lo pintan.
      if (raw && !AGENT_COLORS.includes(raw)) {
        return res.status(400).json({ error: `color tiene que ser uno de: ${AGENT_COLORS.join(', ')}` })
      }
      data.color = raw || null
    }

    if (req.body?.teamRole !== undefined) {
      const raw = typeof req.body.teamRole === 'string' ? req.body.teamRole.trim() : ''
      if (raw) {
        // Mismo chequeo que updateMember para una persona: un rol que no existe en el
        // catálogo del workspace deja un badge sin label.
        const role = await prisma.userRole.findFirst({
          where: { workspaceId: req.workspace.id, name: raw },
          select: { id: true },
        })
        if (!role) return res.status(400).json({ error: `El rol "${raw}" no existe en este workspace` })
      }
      data.teamRole = raw
    }

    if (req.body?.description !== undefined) {
      const raw = typeof req.body.description === 'string' ? req.body.description.trim().slice(0, MAX_DESCRIPTION) : ''
      data.description = raw || null
    }

    if (!Object.keys(data).length) return res.status(400).json({ error: 'Nada que actualizar' })

    const updated = await prisma.mcpToken.update({
      where: { id: agent.id }, data, select: AGENT_PUBLIC_SELECT,
    })
    res.json(shapeAgent(updated, req.user.userId))
  } catch (err) { next(err) }
}

// POST /api/agents/:id/rotate — credencial nueva, MISMO agente.
//
// Es lo que hace sostenible que identidad y credencial compartan fila: sin esto, cambiar
// el token de un agente comprometido obliga a crear otra fila, y ahí el agente pierde su
// nombre, sus proyectos y su historial (las FKs siguen apuntando a la fila vieja).
// Solo el dueño: es él quien tiene que pegar el valor nuevo en su cliente MCP.
async function rotateAgentToken(req, res, next) {
  try {
    const agent = await findAgent(req, {
      id: true, workspaceId: true, userId: true, revokedAt: true, tokenHash: true,
    })
    if (!agent) return res.status(404).json({ error: 'Agente no encontrado' })
    if (agent.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Solo el dueño del agente puede rotar su token' })
    }
    if (agent.revokedAt) {
      return res.status(400).json({ error: 'Este agente está revocado. Generá uno nuevo desde Preferencias.' })
    }

    const { token, tokenHash } = generateToken()
    const updated = await prisma.mcpToken.update({
      where: { id: agent.id },
      data: {
        tokenHash,
        // `revokedNoticeAt` se limpia porque es el antiflood del mail de "tu agente sigue
        // intentando con un token revocado": el estado anterior ya no describe nada.
        revokedNoticeAt: null,
        // El rastro que hace visible el error más probable de esta operación: pegar el
        // valor nuevo en el cliente MCP es un paso MANUAL y, si no se hace, el agente
        // sigue mandando el viejo. Con esto la ficha puede decirlo (ver `health`), en vez
        // de mostrarlo sano porque `lastUsedAt` quedó congelado en el último éxito.
        rotatedAt: new Date(),
        prevTokenPrefix: hashPrefixOf(agent.tokenHash),
      },
      select: AGENT_PUBLIC_SELECT,
    })
    // El valor en claro se devuelve UNA sola vez, igual que al crear el token.
    res.json({ ...shapeAgent(updated, req.user.userId), token })
  } catch (err) { next(err) }
}

module.exports = {
  listAgents, getAgentProfile, getAgentCompleted, updateAgent, rotateAgentToken,
  AGENT_PUBLIC_SELECT, AGENT_COLORS, agentScopeWhere, shapeAgent,
}
