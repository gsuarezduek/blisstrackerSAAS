const prisma = require('../lib/prisma')

// ─── Helpers de fecha puros (trabajan con strings "YYYY-MM-DD" en UTC) ────────
// Las fechas de recurrencia son fechas de calendario (sin hora), así que se parsean
// a mediodía UTC para evitar cualquier corrimiento por DST.

function parseYMD(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
}

function toYMD(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDaysYMD(s, n) {
  const d = parseYMD(s)
  d.setUTCDate(d.getUTCDate() + n)
  return toYMD(d)
}

function weekdayOf(s) {
  return parseYMD(s).getUTCDay() // 0=domingo … 6=sábado
}

function daysInMonth(year, month1to12) {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
}

// max cronológico de dos "YYYY-MM-DD" (comparación lexicográfica == cronológica)
function maxYMD(a, b) {
  if (!a) return b
  if (!b) return a
  return a >= b ? a : b
}

function parseWeekdays(rec) {
  try {
    const arr = JSON.parse(rec.weekdays || '[]')
    return Array.isArray(arr) ? arr.map(Number).filter(n => n >= 0 && n <= 6) : []
  } catch { return [] }
}

// ─── Próxima ocurrencia ───────────────────────────────────────────────────────
// Primera fecha >= `ymd` que cumple la regla de la recurrencia. Devuelve null si
// cae después de endDate.

function nextOccurrenceOnOrAfter(rec, ymd) {
  let candidate

  if (rec.frequency === 'daily') {
    candidate = ymd
  } else if (rec.frequency === 'weekly') {
    const days = parseWeekdays(rec)
    if (days.length === 0) return null
    candidate = null
    for (let i = 0; i < 7; i++) {
      const c = addDaysYMD(ymd, i)
      if (days.includes(weekdayOf(c))) { candidate = c; break }
    }
  } else if (rec.frequency === 'monthly') {
    const dom = rec.dayOfMonth || Number(ymd.slice(8, 10))
    const [y, m] = ymd.split('-').map(Number)
    const inMonth = (yy, mm) => {
      const day = Math.min(dom, daysInMonth(yy, mm))
      return `${yy}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
    candidate = inMonth(y, m)
    if (candidate < ymd) {
      const ny = m === 12 ? y + 1 : y
      const nm = m === 12 ? 1 : m + 1
      candidate = inMonth(ny, nm)
    }
  } else if (rec.frequency === 'annual') {
    const mm = rec.month || Number(ymd.slice(5, 7))
    const dom = rec.dayOfMonth || Number(ymd.slice(8, 10))
    const y = Number(ymd.slice(0, 4))
    const inYear = (yy) => {
      const day = Math.min(dom, daysInMonth(yy, mm))
      return `${yy}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
    candidate = inYear(y)
    if (candidate < ymd) candidate = inYear(y + 1)
  } else {
    return null
  }

  if (!candidate) return null
  if (rec.endDate && candidate > rec.endDate) return null
  return candidate
}

// Primera ocurrencia de la recurrencia (>= startDate).
function firstScheduledDate(rec) {
  return nextOccurrenceOnOrAfter(rec, rec.startDate)
}

// Deriva los params (weekdays/dayOfMonth/month) a partir de la frecuencia + startDate + input.
// monthly/annual: el día (y el mes en annual) los elige el usuario desde un calendario;
// si no vienen, se derivan de startDate como fallback.
function buildRecurrenceParams({ frequency, weekdays, startDate, dayOfMonth, month }) {
  const [y, m, d] = startDate.split('-').map(Number)
  if (frequency === 'weekly') {
    const days = Array.isArray(weekdays) ? weekdays.map(Number).filter(n => n >= 0 && n <= 6) : []
    // Si no eligieron días, usar el día de la semana de startDate
    const final = days.length > 0 ? [...new Set(days)].sort((a, b) => a - b) : [weekdayOf(startDate)]
    return { weekdays: JSON.stringify(final), dayOfMonth: null, month: null }
  }
  const dom = Number(dayOfMonth) || d
  if (frequency === 'monthly') return { weekdays: '[]', dayOfMonth: dom, month: null }
  if (frequency === 'annual') return { weekdays: '[]', dayOfMonth: dom, month: Number(month) || m }
  return { weekdays: '[]', dayOfMonth: null, month: null } // daily
}

// ─── Materialización (DB) ─────────────────────────────────────────────────────

// Crea una instancia Task de una recurrencia para la fecha `scheduledFor`.
async function spawnInstance(client, rec, scheduledFor, workDayId) {
  let task
  try {
    task = await client.task.create({
      data: {
        workDayId,
        userId:       rec.userId,
        createdById:  rec.createdById ?? null,
        projectId:    rec.projectId,
        description:  rec.description,
        status:       'PENDING',
        scheduledFor,
        recurrenceId: rec.id,
      },
    })
  } catch (err) {
    // Condición de carrera (dos requests concurrentes materializan la misma ocurrencia):
    // el @@unique([recurrenceId, scheduledFor]) la rechaza — devolvemos la que ya existe.
    if (err.code === 'P2002') {
      task = await client.task.findFirst({ where: { recurrenceId: rec.id, scheduledFor } })
      if (task) return task
    }
    throw err
  }
  await client.taskRecurrence.update({
    where: { id: rec.id },
    data:  { lastSpawnedDate: maxYMD(rec.lastSpawnedDate, scheduledFor) },
  })
  return task
}

// Activa las tareas programadas del usuario cuya fecha ya llegó: las engancha al workday
// de hoy y limpia scheduledFor (pasan a ser tareas normales del día).
async function activateDueTasks(client, { userId, workspaceId, todayWorkDayId, today }) {
  const { count } = await client.task.updateMany({
    where: {
      userId,
      scheduledFor: { not: null, lte: today },
      status:       { not: 'COMPLETED' },
      workDay:      { workspaceId },
    },
    data: { workDayId: todayWorkDayId, scheduledFor: null },
  })
  return count
}

// Asegura que cada recurrencia activa del usuario tenga su próxima instancia futura
// materializada (a lo sumo una por adelantado, sin backfill de ocurrencias perdidas).
async function topUpUserRecurrences(client, { userId, workspaceId, todayWorkDayId, today }) {
  const recurrences = await client.taskRecurrence.findMany({
    where: { userId, workspaceId, active: true },
  })

  for (const rec of recurrences) {
    // Recurrencia vencida → desactivar
    if (rec.endDate && today > rec.endDate) {
      await client.taskRecurrence.update({ where: { id: rec.id }, data: { active: false } })
      continue
    }

    // ¿Ya hay una instancia futura pendiente? Entonces no generar otra.
    const existingFuture = await client.task.count({
      where: {
        recurrenceId: rec.id,
        scheduledFor: { not: null, gt: today },
        status:       { not: 'COMPLETED' },
      },
    })
    if (existingFuture > 0) continue

    const base = rec.lastSpawnedDate
      ? maxYMD(addDaysYMD(rec.lastSpawnedDate, 1), today)
      : maxYMD(rec.startDate, today)
    const next = nextOccurrenceOnOrAfter(rec, base)

    if (!next) {
      await client.taskRecurrence.update({ where: { id: rec.id }, data: { active: false } })
      continue
    }
    await spawnInstance(client, rec, next, todayWorkDayId)
  }
}

// Rutina completa que corre al abrir el dashboard: primero activa lo vencido, luego rellena
// la próxima ocurrencia de cada recurrencia.
async function materializeForUser(client, ctx) {
  await activateDueTasks(client, ctx)
  await topUpUserRecurrences(client, ctx)
}

module.exports = {
  // date helpers (export para tests)
  parseYMD, toYMD, addDaysYMD, weekdayOf, maxYMD, parseWeekdays,
  nextOccurrenceOnOrAfter, firstScheduledDate, buildRecurrenceParams,
  // db
  spawnInstance, activateDueTasks, topUpUserRecurrences, materializeForUser,
}
