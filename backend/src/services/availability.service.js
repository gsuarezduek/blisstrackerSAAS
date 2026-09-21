const prisma = require('../lib/prisma')
const { addDaysYMD } = require('./recurrence.service')

// Minutos que ocupa en el calendario una Task con scheduledTime pero sin
// scheduledDurationMins explícito (ver Task.scheduledDurationMins en schema.prisma).
const DEFAULT_TASK_BLOCK_MINS = 30

function timeToMins(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function minsToTime(mins) {
  const clamped = Math.max(0, Math.min(24 * 60, mins))
  const h = String(Math.floor(clamped / 60)).padStart(2, '0')
  const m = String(clamped % 60).padStart(2, '0')
  return `${h}:${m}`
}

function emptyUserState() {
  return { workStart: null, workEnd: null, fullDayOff: new Set(), blocks: [] }
}

// ─── getBusyBlocks ────────────────────────────────────────────────────────────
// Bloques ocupados/tentativos por usuario en un rango de fechas ["YYYY-MM-DD", "YYYY-MM-DD"].
// Es la función base que usan tanto la vista semanal (renderiza cada bloque) como
// el buscador de huecos comunes (findCommonFreeSlots).
//
// Devuelve { [userId]: { workStart, workEnd, fullDayOff: Set<date>, blocks: [...] } }
// - workStart/workEnd: "HH:MM" de WorkspaceMember, o null si no tiene horario
//   configurado (tratado como "todo el día disponible", mismo criterio que el resto
//   del código: null = sin restricción).
// - fullDayOff: fechas con licencia aprobada (VacationRequest) — el día entero no
//   tiene huecos libres.
// - blocks: [{ date, start, end, kind: 'task'|'calendar_event', tentative, refId, title, projectId }]
//   `tentative: true` = invitación de CalendarEvent todavía no respondida (se pinta
//   en el calendario pero NO cuenta como ocupado para findCommonFreeSlots).
async function getBusyBlocks({ workspaceId, userIds, fromDate, toDate }) {
  const byUser = {}
  for (const id of userIds) byUser[id] = emptyUserState()
  if (!userIds.length) return byUser

  const [members, vacations, tasks, participations] = await Promise.all([
    prisma.workspaceMember.findMany({
      where:  { workspaceId, userId: { in: userIds } },
      select: { userId: true, workStartTime: true, workEndTime: true },
    }),
    prisma.vacationRequest.findMany({
      where: {
        workspaceId, userId: { in: userIds }, status: 'approved',
        startDate: { lte: toDate }, endDate: { gte: fromDate },
      },
      select: { userId: true, startDate: true, endDate: true },
    }),
    // scheduledFor puede ser null si la tarea ya "activó" (activateDueTasks la
    // enganchó al WorkDay de hoy y limpió scheduledFor) — la fecha efectiva en ese
    // caso es la del WorkDay, no la de scheduledFor.
    prisma.task.findMany({
      where: {
        userId:         { in: userIds },
        scheduledTime:  { not: null },
        status:         { not: 'COMPLETED' },
        OR: [
          { scheduledFor: { gte: fromDate, lte: toDate } },
          { scheduledFor: null, workDay: { workspaceId, date: { gte: fromDate, lte: toDate } } },
        ],
      },
      select: {
        id: true, userId: true, description: true, scheduledFor: true,
        scheduledTime: true, scheduledDurationMins: true,
        workDay: { select: { date: true } },
      },
    }),
    prisma.calendarEventParticipant.findMany({
      where: {
        userId: { in: userIds },
        status: { not: 'declined' },
        event:  { workspaceId, date: { gte: fromDate, lte: toDate } },
      },
      select: {
        userId: true, status: true, taskId: true,
        event: { select: { id: true, date: true, startTime: true, durationMins: true, title: true, projectId: true, recurrenceId: true } },
      },
    }),
  ])

  // Aceptar una invitación crea una Task "reserva" en el dashboard con el mismo
  // horario del evento (ver calendarEventTasks.js#createTaskForParticipant) — sin
  // excluirla acá, el bloque de esa Task y el del CalendarEvent quedarían
  // superpuestos exactamente en el mismo horario (mismo bug: texto "duplicado"
  // en la grilla semanal). El CalendarEvent ya la representa, así que se ignora.
  const reservationTaskIds = new Set(participations.map(p => p.taskId).filter(Boolean))

  for (const m of members) {
    const u = byUser[m.userId]
    if (!u) continue
    u.workStart = m.workStartTime || null
    u.workEnd   = m.workEndTime || null
  }

  for (const v of vacations) {
    const u = byUser[v.userId]
    if (!u) continue
    let d = v.startDate < fromDate ? fromDate : v.startDate
    const end = v.endDate > toDate ? toDate : v.endDate
    while (d <= end) {
      u.fullDayOff.add(d)
      d = addDaysYMD(d, 1)
    }
  }

  for (const t of tasks) {
    if (reservationTaskIds.has(t.id)) continue
    const u = byUser[t.userId]
    if (!u) continue
    const date = t.scheduledFor || t.workDay?.date
    if (!date || date < fromDate || date > toDate) continue
    const startMins = timeToMins(t.scheduledTime)
    u.blocks.push({
      date, start: t.scheduledTime,
      end: minsToTime(startMins + (t.scheduledDurationMins || DEFAULT_TASK_BLOCK_MINS)),
      kind: 'task', tentative: false, refId: t.id, title: t.description, projectId: null,
    })
  }

  for (const p of participations) {
    const u = byUser[p.userId]
    if (!u) continue
    const ev = p.event
    u.blocks.push({
      date: ev.date, start: ev.startTime,
      end: minsToTime(timeToMins(ev.startTime) + ev.durationMins),
      kind: 'calendar_event', tentative: p.status === 'pending',
      refId: ev.id, title: ev.title, projectId: ev.projectId, recurrenceId: ev.recurrenceId,
    })
  }

  return byUser
}

function windowMinutes(workStart, workEnd) {
  if (!workStart || !workEnd) return [0, 24 * 60]
  return [timeToMins(workStart), timeToMins(workEnd)]
}

// Intervalos libres [ [start,end], ... ] (minutos) de un usuario en un día puntual,
// restando sus bloques NO tentativos (los `tentative` no ocupan, ver getBusyBlocks).
function freeIntervalsForUser(userState, date) {
  if (userState.fullDayOff.has(date)) return []
  const [wStart, wEnd] = windowMinutes(userState.workStart, userState.workEnd)
  if (wEnd <= wStart) return []

  const busy = userState.blocks
    .filter(b => b.date === date && !b.tentative)
    .map(b => [timeToMins(b.start), timeToMins(b.end)])
    .sort((a, b) => a[0] - b[0])

  let free = [[wStart, wEnd]]
  for (const [bStart, bEnd] of busy) {
    const next = []
    for (const [fStart, fEnd] of free) {
      if (bEnd <= fStart || bStart >= fEnd) { next.push([fStart, fEnd]); continue }
      if (bStart > fStart) next.push([fStart, Math.min(bStart, fEnd)])
      if (bEnd < fEnd) next.push([Math.max(bEnd, fStart), fEnd])
    }
    free = next.filter(([s, e]) => e > s)
  }
  return free
}

function intersectIntervals(a, b) {
  const result = []
  for (const [aS, aE] of a) {
    for (const [bS, bE] of b) {
      const s = Math.max(aS, bS)
      const e = Math.min(aE, bE)
      if (e > s) result.push([s, e])
    }
  }
  return result
}

// ─── findCommonFreeSlots ────────────────────────────────────────────────────
// Huecos donde TODOS los userIds están libres simultáneamente, en un día puntual.
// Reusa getBusyBlocks; intersecta los intervalos libres de cada usuario entre sí.
// Devuelve [{ start: "HH:MM", end: "HH:MM" }, ...] ordenados, solo intervalos con
// largo >= durationMins.
async function findCommonFreeSlots({ workspaceId, userIds, date, durationMins = DEFAULT_TASK_BLOCK_MINS }) {
  if (!userIds.length) return []
  const busyByUser = await getBusyBlocks({ workspaceId, userIds, fromDate: date, toDate: date })

  let common = null
  for (const id of userIds) {
    const free = freeIntervalsForUser(busyByUser[id] || emptyUserState(), date)
    common = common === null ? free : intersectIntervals(common, free)
    if (!common.length) break
  }

  return (common || [])
    .filter(([s, e]) => e - s >= durationMins)
    .map(([s, e]) => ({ start: minsToTime(s), end: minsToTime(e) }))
}

module.exports = {
  DEFAULT_TASK_BLOCK_MINS,
  timeToMins, minsToTime,
  getBusyBlocks, findCommonFreeSlots,
}
