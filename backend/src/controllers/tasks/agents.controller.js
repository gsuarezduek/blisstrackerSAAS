const prisma = require('../../lib/prisma')
const { todayString, isYMD } = require('../../utils/dates')
const { materializeForUser } = require('../../services/recurrence.service')
const { taskInclude, requestAgentId, requestAgentName, assertOwnAgent } = require('./_shared')
const { agentTasksQuery } = require('../workdays.controller')
const { taskMins, zonedTimeToUtc } = require('../../lib/timeMetrics')
const { getOrCreateWorkDay } = require('../../lib/workDay')
const { createdNewsWhere, inboxNewsWhere } = require('../../lib/agentNews')

// Agentes IA (MCP) — ver concepto "Agentes IA" en backend/CLAUDE.md.
// Una tarea de agente (Task.isAgentTask) la EJECUTA un agente; userId sigue siendo la
// persona responsable. agentId = qué agente (McpToken); null = "cualquiera de mis
// agentes" (la toma el primero que la inicia, ver startTask).

const OPEN_STATUSES = ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED']

// WorkDay de hoy de la persona, creándolo si falta. A diferencia de getOrCreateToday
// NO reabre una jornada cerrada: que el agente consulte su lista no debe "re-loguear"
// a su dueño.
function ensureTodayWorkDay(userId, workspaceId, date) {
  return getOrCreateWorkDay(prisma, { userId, workspaceId, date })
}

// ─── GET /api/tasks/agent-queue ─────────────────────────────────────────────
// Lista de trabajo de los agentes de la persona: tareas de agente abiertas (no
// programadas a futuro, de proyectos activos). Desde MCP, solo las de ESE agente +
// las delegadas a "cualquiera" (agentId null); desde la UI, las de todos sus agentes.
// Materializa antes las recurrentes/futuras que vencieron, así una serie diaria del
// agente aparece aunque su dueño no haya abierto el dashboard hoy.
//
// Dos filtros opcionales, para que un agente no tenga que leer la cola entera:
//  - ?mine=true — solo las que llevan SU nombre declarado (`agentName`) + las que
//    todavía no tiene nadie. Varios agentes pueden compartir un token (ver
//    requestAgentName), y en ese caso el filtro por `agentId` no los separa. El
//    nombre sale de la identidad de la request, no de un query param: así no hay
//    dos fuentes de verdad sobre quién es quien llama.
//  - ?from / ?to — ventana de fechas. La fecha efectiva de un ítem es su
//    `scheduledFor` (si está programado) o el día de la jornada donde vive
//    (`workDay.date`). `to` default = hoy, que es el tope de siempre: subirlo es
//    la única forma de ver lo programado a futuro, que la cola esconde.
async function agentQueue(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const today = todayString(req.workspace.timezone)

    // ?view=dashboard: refresco liviano de la pestaña Agentes / franja "Tus agentes
    // trabajando" del Dashboard (lo pide cada ~30s) — mismo shape que `agentTasks` de
    // /workdays/today (abiertas + completadas hoy), sin materializar nada.
    if (req.query.view === 'dashboard') {
      return res.json(await agentTasksQuery(userId, workspaceId, today, req.workspace.timezone))
    }

    // Solo lo del agente (agentOnly) y sin abrir un WorkDay si no hace falta: un WorkDay
    // vacío creado acá contaría como "la persona estuvo" en Asistencia (ver
    // lib/agentTasks.js PRESENCE_WORKDAY_WHERE). Con algo que materializar, el WorkDay
    // queda solo con tareas de agente y no cuenta como presencia.
    try {
      const [dueAgentTasks, agentRecurrences] = await Promise.all([
        prisma.task.count({ where: { userId, isAgentTask: true, scheduledFor: { not: null, lte: today }, status: { not: 'COMPLETED' }, workDay: { workspaceId } } }),
        prisma.taskRecurrence.count({ where: { userId, workspaceId, active: true, isAgentTask: true } }),
      ])
      if (dueAgentTasks > 0 || agentRecurrences > 0) {
        const workDay = await ensureTodayWorkDay(userId, workspaceId, today)
        if (workDay) await materializeForUser(prisma, { userId, workspaceId, todayWorkDayId: workDay.id, today, agentOnly: true })
      }
    } catch (matErr) {
      console.error('[agent-queue] Error materializando tareas:', matErr.message)
    }

    const agentId = requestAgentId(req)

    // Ventana de fechas. Al tope de `scheduledFor` (hoy, salvo que pidan más
    // adelante) se le suma el mismo recorte sobre `workDay.date` de las tareas ya
    // activas — pero solo si vino algún borde: sin parámetros la cola tiene que
    // devolver exactamente lo de siempre (todo lo abierto, venga del día que venga).
    const until = isYMD(req.query.to) ? req.query.to : today
    const since = isYMD(req.query.from) ? req.query.from : null
    const windowed = Boolean(since || isYMD(req.query.to))
    const dateWindow = { lte: until, ...(since ? { gte: since } : {}) }

    const filters = [{
      OR: [
        { scheduledFor: { not: null, ...dateWindow } },
        { scheduledFor: null, ...(windowed ? { workDay: { date: dateWindow } } : {}) },
      ],
    }]
    if (agentId) filters.push({ OR: [{ agentId }, { agentId: null }] })
    // ?mine sin nombre declarado no filtra nada: no hay con qué distinguirlo de
    // los demás agentes del token, y devolver una cola vacía ocultaría trabajo real.
    const declaredName = requestAgentName(req)
    if (req.query.mine === 'true' && declaredName) {
      filters.push({ OR: [{ agentName: declaredName }, { agentName: null }] })
    }

    const tasks = await prisma.task.findMany({
      where: {
        userId,
        isAgentTask: true,
        status: { in: OPEN_STATUSES },
        workDay: { workspaceId },
        project: { active: true },
        AND: filters,
      },
      include: { ...taskInclude, agent: { select: { id: true, label: true } } },
      orderBy: { createdAt: 'asc' },
    })
    res.json(tasks)
  } catch (err) { next(err) }
}

// ─── GET /api/tasks/agent-updates ───────────────────────────────────────────
// Bandeja de novedades del agente. Un agente MCP no recibe avisos push (solo actúa
// cuando lo invocan), así que TODO lo que pasó mientras no estaba se entera revisando
// esto al empezar. Dos fuentes, un solo array ordenado por fecha del evento:
//  - `kind: 'completed'` — tareas que ESTE agente creó y que alguien completó. Si
//    declaró su nombre (agentName), solo las que creó con ese nombre (varios agentes
//    pueden compartir un token); se excluyen las que ejecutó él mismo (ya lo sabe).
//    Marcadas como vistas con Task.createdByAgentSeenAt.
//  - `kind: 'unblocked' | 'comment'` — lo que la persona le dejó en SUS tareas de
//    agente desde la app: la destrabó o le comentó algo (una indicación, una
//    aprobación). Marcadas con Task.agentUpdateAt/agentUpdateKind, que se limpian al
//    devolverlas. Mismo scope que `agent-queue` (las suyas + las delegadas a
//    "cualquiera de mis agentes"), sin filtrar por nombre declarado: es su lista de
//    trabajo, y una tarea destrabada tiene que llegarle igual.
// Por default marca vistas las novedades que devuelve; ?markSeen=false solo lee.
// Solo vía MCP: desde la app no hay "agente que pregunta".
const UPDATES_LIMIT = 50

async function agentUpdates(req, res, next) {
  try {
    const agentId = requestAgentId(req)
    if (!agentId) return res.status(400).json({ error: 'Solo disponible para agentes conectados por MCP' })
    const declaredName = requestAgentName(req)
    const workspaceId = req.workspace.id
    const markSeen = req.query.markSeen !== 'false'

    const createdWhere = createdNewsWhere({ agentId, declaredName, workspaceId })
    const inboxWhere = inboxNewsWhere({ agentId, userId: req.user.userId, workspaceId })

    const commentsInclude = {
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { content: true, createdAt: true, agentId: true, user: { select: { name: true } } },
    }
    const baseInclude = {
      project: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
      agent: { select: { id: true, label: true } },
      // Lo último que se dijo en la tarea: muchas veces el resultado (o la respuesta de
      // la persona) está ahí.
      comments: commentsInclude,
    }

    const [createdRows, inboxRows] = await Promise.all([
      prisma.task.findMany({
        where: createdWhere,
        orderBy: { completedAt: 'asc' },
        take: UPDATES_LIMIT + 1,
        include: baseInclude,
      }),
      prisma.task.findMany({
        where: inboxWhere,
        orderBy: { agentUpdateAt: 'asc' },
        take: UPDATES_LIMIT + 1,
        include: baseInclude,
      }),
    ])

    const hasMore = createdRows.length > UPDATES_LIMIT || inboxRows.length > UPDATES_LIMIT
    const created = createdRows.slice(0, UPDATES_LIMIT)
    const inbox = inboxRows.slice(0, UPDATES_LIMIT)

    const recentComments = t => t.comments.slice().reverse().map(c => ({
      author: c.user?.name ?? null,
      viaAgent: c.agentId != null,
      content: c.content,
      createdAt: c.createdAt,
    }))

    const updates = [
      ...created.map(t => ({
        kind: 'completed',
        at: t.completedAt,
        taskId: t.id,
        description: t.description,
        project: t.project,
        status: t.status,
        completedBy: t.isAgentTask
          ? { agent: t.agent ? { id: t.agent.id, label: t.agent.label, agentName: t.agentName } : null, ownerId: t.user.id, ownerName: t.user.name }
          : { id: t.user.id, name: t.user.name },
        executedByAgent: t.isAgentTask,
        completedAt: t.completedAt,
        workedMinutes: taskMins(t),
        recentComments: recentComments(t),
      })),
      ...inbox.map(t => ({
        kind: t.agentUpdateKind === 'comment' ? 'comment' : 'unblocked',
        at: t.agentUpdateAt,
        taskId: t.id,
        description: t.description,
        project: t.project,
        status: t.status,
        owner: { id: t.user.id, name: t.user.name },
        recentComments: recentComments(t),
      })),
    ].sort((a, b) => new Date(a.at ?? 0) - new Date(b.at ?? 0))

    if (markSeen) {
      const now = new Date()
      await Promise.all([
        created.length
          ? prisma.task.updateMany({
              where: { id: { in: created.map(t => t.id) }, createdByAgentSeenAt: null },
              data: { createdByAgentSeenAt: now },
            })
          : null,
        inbox.length
          ? prisma.task.updateMany({
              where: { id: { in: inbox.map(t => t.id) } },
              data: { agentUpdateAt: null, agentUpdateKind: null },
            })
          : null,
      ])
    }

    res.json({ updates, hasMore })
  } catch (err) { next(err) }
}


// ─── PATCH /api/tasks/:id/working-on ────────────────────────────────────────
// Primer paso de la tool MCP `task_working_on` con taskId ("estoy trabajando en
// esta tarea planificada"): deja la tarea lista para arrancar, y la tool hace
// después el paso que corresponde (start/resume/unblock) contra los endpoints de
// siempre — así no se duplica la lógica de iniciar (sesiones, to-dos vinculados,
// avisos). Solo vía MCP, sobre tareas de la persona dueña del agente:
// - Planificada para otro día (scheduledFor futuro) o en el Backlog → la trae a hoy.
// - Tarea de la persona → pasa a ser tarea de este agente (no se puede si ella la
//   tiene en curso: está trabajando en eso).
// - Delegada a "cualquiera de mis agentes" → queda para este agente.
// - Ya tomada por OTRO agente del mismo dueño → 409.
// Devuelve { task, next: 'start' | 'resume' | 'unblock' | 'none' }.
const NEXT_STEP = { PENDING: 'start', PAUSED: 'resume', BLOCKED: 'unblock', IN_PROGRESS: 'none' }

async function prepareWorkingOn(req, res, next) {
  try {
    const agentId = requestAgentId(req)
    if (!agentId) return res.status(400).json({ error: 'Solo disponible para agentes conectados por MCP' })
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)

    const task = await prisma.task.findFirst({ where: { id, userId, workDay: { workspaceId } } })
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada: tiene que ser una tarea de la persona para la que trabajás' })
    if (task.status === 'COMPLETED') return res.status(400).json({ error: 'La tarea ya está completada' })
    if (!task.isAgentTask && task.status === 'IN_PROGRESS') {
      return res.status(409).json({ error: 'La persona está trabajando en esa tarea ahora: no la tomes, creá una tuya si es otra cosa' })
    }
    if (task.isAgentTask && task.agentId != null && task.agentId !== agentId) {
      return res.status(409).json({ error: 'Esa tarea la tiene otro agente de la persona' })
    }

    const data = {}
    const declaredName = requestAgentName(req)
    if (!task.isAgentTask || task.agentId == null) Object.assign(data, { isAgentTask: true, agentId })
    if (declaredName) data.agentName = declaredName

    const today = todayString(req.workspace.timezone)
    const planned = (task.scheduledFor && task.scheduledFor > today) || task.isBacklog
    if (planned) {
      const workDay = await ensureTodayWorkDay(userId, workspaceId, today)
      if (!workDay) return res.status(500).json({ error: 'No se pudo obtener la jornada de hoy' })
      Object.assign(data, { scheduledFor: null, isBacklog: false, workDayId: workDay.id })
    }

    const updated = Object.keys(data).length
      ? await prisma.task.update({ where: { id }, data, include: { ...taskInclude, agent: { select: { id: true, label: true } } } })
      : await prisma.task.findUnique({ where: { id }, include: { ...taskInclude, agent: { select: { id: true, label: true } } } })

    res.json({
      task: updated,
      next: NEXT_STEP[updated.status] ?? 'none',
      broughtToToday: Boolean(planned),
      tookOverFromPerson: !task.isAgentTask,
    })
  } catch (err) { next(err) }
}

// ─── PATCH /api/tasks/:id/logged-at ─────────────────────────────────────────
// "Esto lo hice el martes": reubica una tarea de agente YA COMPLETADA en la jornada
// de otro día. Es el último paso de la tool MCP `task_log_done` — crear/tomar,
// iniciar, completar y registrar los minutos pasan por los endpoints de siempre
// (con todos sus efectos: to-dos vinculados, piezas de Contenido, avisos), y acá
// sólo se corrige CUÁNDO.
//
// Hay que mover dos cosas porque el producto cuenta el tiempo por dos vías: el
// Dashboard y el historial filtran por `workDay.date` (ver lib/workDay.js) y
// Reportes/Productividad/el informe al cliente bucketean por `completedAt` (ver
// lib/timeMetrics.js `buildCompletedAtWhere`). Mover una sola dejaría la tarea
// contada en un día en una vista y en otro día en la otra.
//
// El resto de las marcas (startedAt, las sesiones) se corren por el MISMO delta en
// vez de recalcularse: así la tarea queda igual de larga que lo que realmente
// llevó, sólo desplazada. `pausedMinutes` y `minutesOverride` no se tocan.
//
// Solo vía MCP y solo sobre tareas de agente del dueño del token: el tiempo que
// registró una persona no se reescribe desde acá.
const BACKDATE_LIMIT_MSG = 'Solo se puede registrar dentro del mes en curso: un mes cerrado ya se le informó al cliente'

async function setLoggedAt(req, res, next) {
  try {
    const agentId = requestAgentId(req)
    if (!agentId) return res.status(400).json({ error: 'Solo disponible para agentes conectados por MCP' })
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const id = Number(req.params.id)
    const { date } = req.body || {}

    if (!isYMD(date)) return res.status(400).json({ error: 'date inválida (formato YYYY-MM-DD)' })
    const today = todayString(tz)
    if (date > today) return res.status(400).json({ error: 'No se puede registrar trabajo en una fecha futura' })
    // Tope: el 1° del mes en curso. El tiempo de agente consume las horas
    // contratadas del proyecto y se le muestra al cliente, así que un mes ya
    // cerrado (informe generado, horas reportadas) no se reescribe.
    if (date < `${today.slice(0, 7)}-01`) return res.status(400).json({ error: BACKDATE_LIMIT_MSG })

    const task = await prisma.task.findFirst({
      where: { id, userId, workDay: { workspaceId } },
      include: { workDay: { select: { date: true } }, sessions: { select: { id: true, startedAt: true, endedAt: true } } },
    })
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada: tiene que ser una tarea de la persona para la que trabajás' })
    if (!task.isAgentTask) return res.status(403).json({ error: 'Solo se puede cambiar la fecha de tus tareas de agente, no de las de la persona' })
    if (task.status !== 'COMPLETED' || !task.completedAt) {
      return res.status(400).json({ error: 'Solo se puede cambiar la fecha de una tarea ya completada' })
    }

    // Hora de cierre: las 18:00 de ese día (un final de jornada plausible), nunca
    // en el futuro. La hora exacta no la declara el agente — lo que se registra es
    // el día y la duración, no un horario que nadie midió.
    const anchor = zonedTimeToUtc(date, tz, { h: 18 })
    const now = new Date()
    const completedAt = anchor > now ? now : anchor
    const delta = completedAt.getTime() - new Date(task.completedAt).getTime()
    const shift = d => (d ? new Date(new Date(d).getTime() + delta) : null)

    const workDay = task.workDay?.date === date
      ? null
      : await getOrCreateWorkDay(prisma, { userId, workspaceId, date })
    if (task.workDay?.date !== date && !workDay) {
      return res.status(500).json({ error: 'No se pudo obtener la jornada de ese día' })
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const session of task.sessions) {
        await tx.taskSession.update({
          where: { id: session.id },
          data: { startedAt: shift(session.startedAt), endedAt: shift(session.endedAt) },
        })
      }
      return tx.task.update({
        where: { id },
        data: {
          completedAt,
          startedAt: shift(task.startedAt),
          ...(workDay ? { workDayId: workDay.id } : {}),
        },
        include: { ...taskInclude, agent: { select: { id: true, label: true } } },
      })
    })

    res.json({ task: updated, date, workedMinutes: taskMins(updated) })
  } catch (err) { next(err) }
}

// ─── PATCH /api/tasks/:id/agent ─────────────────────────────────────────────
// "Delegar a mi agente" (executor:'agent') o devolverla a la persona (executor:'user').
// Solo sobre tareas propias, abiertas y que no estén en curso (cambiar quién la
// ejecuta en plena ejecución movería el lugar de "1 en curso" de la persona).
// agentId opcional: uno de MIS agentes; sin él, desde MCP queda para el agente que
// llama y desde la UI para "cualquiera de mis agentes".
// ?scope=series en una instancia recurrente: también la plantilla + las instancias
// abiertas que no estén en curso (mismo criterio que editar con scope=series).
async function setExecutor(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const { executor } = req.body
    if (!['agent', 'user'].includes(executor)) {
      return res.status(400).json({ error: "executor inválido ('agent' | 'user')" })
    }

    const task = await prisma.task.findFirst({ where: { id, userId, workDay: { workspaceId } } })
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (task.status === 'COMPLETED') return res.status(400).json({ error: 'La tarea ya está completada' })
    if (task.status === 'IN_PROGRESS') return res.status(409).json({ error: 'La tarea está en curso: pausala antes de cambiar quién la ejecuta' })

    let data
    if (executor === 'agent') {
      const agentId = req.body.agentId != null
        ? await assertOwnAgent(req.body.agentId, userId, workspaceId)
        : requestAgentId(req)
      // Si se la queda el mismo agente que hace la request, con su nombre declarado.
      data = { isAgentTask: true, agentId, agentName: agentId != null && agentId === requestAgentId(req) ? requestAgentName(req) : null }
    } else {
      data = { isAgentTask: false, agentId: null, agentName: null }
    }

    if (req.query.scope === 'series' && task.recurrenceId) {
      await prisma.$transaction([
        prisma.taskRecurrence.update({ where: { id: task.recurrenceId }, data }),
        prisma.task.updateMany({
          where: { recurrenceId: task.recurrenceId, status: { in: ['PENDING', 'PAUSED', 'BLOCKED'] } },
          data,
        }),
      ])
    } else {
      await prisma.task.update({ where: { id }, data })
    }

    const updated = await prisma.task.findUnique({
      where: { id },
      include: { ...taskInclude, agent: { select: { id: true, label: true } } },
    })
    res.json(updated)
  } catch (err) { next(err) }
}

module.exports = { agentQueue, agentUpdates, prepareWorkingOn, setExecutor, setLoggedAt, ensureTodayWorkDay }
