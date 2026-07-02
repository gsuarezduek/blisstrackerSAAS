// Cálculo de las métricas AUTOMÁTICAS del Scorecard EOS, bucketeadas por semana ISO
// (semanales) o por mes calendario (mensuales). Reutiliza los mismos criterios que la
// sección de Productividad / Asistencia:
//   - Tardanza = primer login del día > workStartTime + tolerancia (TZ del workspace), y solo
//     si la llegada cae en la ventana de ±2h (lib/attendance.inArrivalWindow).
//   - Día laborable = día donde >50% del equipo activo se logueó (lib/attendance.laborableDays).
//     Reemplaza la base "lunes a viernes": excluye fines de semana y feriados.
//   - Horas disponibles = días laborables esperados (sin licencia) × jornada (workEnd − workStart).
//   - Horas trabajadas = tiempo activo de tareas completadas (taskMins, tope 8h, descuenta pausas).
//   - Ocupación = Σ horas trabajadas ÷ Σ horas disponibles (solo quienes tienen horario) — ya
//     ponderada por horas, así normaliza jornadas de 4h vs 8h.
// Las mensuales se calculan "a mes vencido": solo meses cerrados (el mes en curso queda vacío).
// No persiste nada: se recalcula desde los datos crudos en cada request.
// Devuelve, por métrica pedida, un mapa { period: { value, top3? } } (period = 'YYYY-Www' | 'YYYY-MM').

const prisma = require('../lib/prisma')
const { tzOffsetStr, addDays, taskMins } = require('../lib/timeMetrics')
const { todayString } = require('../utils/dates')
const { monthBounds, prevMonthStr } = require('../lib/monthUtils')
const { EOS_AUTO_METRICS } = require('../lib/eosAutoMetricCatalog')
const { computeObjectives } = require('./marketingObjectives.service')
const { inArrivalWindow, laborableDays } = require('../lib/attendance')

// Filtro de informes "generados" (no placeholders vacíos) — espejo de GENERATED_WHERE.
const GENERATED_REPORT_OR = [
  { enabledSections: { not: null } },
  { dataCache:       { not: null } },
  { analysis:        { not: null } },
]

// "YYYY-Www" (ISO 8601) de una fecha YYYY-MM-DD, interpretada como UTC.
function isoWeekPeriodOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

const monthOf = dateStr => dateStr.slice(0, 7)

function loginMinsFromMidnight(iso, tz) {
  const d = new Date(iso)
  const h = Number(d.toLocaleString('en-CA', { hour: 'numeric', hour12: false, timeZone: tz }))
  const m = Number(d.toLocaleString('en-CA', { minute: 'numeric', timeZone: tz }))
  return h * 60 + m
}

const round1 = n => Math.round(n * 10) / 10
const localDate = (iso, tz) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz })

// Carga horarios del equipo: { attendanceEnabled, tolerance, info: Map<uid,{name,avatar,startMins,dayMins}> }.
async function loadMemberInfo(workspaceId) {
  const [ws, members] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { attendanceTrackingEnabled: true, lateToleranceMins: true },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId, active: true },
      select: { userId: true, workStartTime: true, workEndTime: true, user: { select: { name: true, avatar: true } } },
    }),
  ])
  const attendanceEnabled = ws?.attendanceTrackingEnabled !== false
  const tolerance = ws?.lateToleranceMins ?? 0
  const info = new Map()
  for (const m of members) {
    let startMins = null, dayMins = null
    if (attendanceEnabled && m.workStartTime) {
      const [h, mm] = m.workStartTime.split(':').map(Number)
      startMins = h * 60 + mm
      if (m.workEndTime) {
        const [eh, em] = m.workEndTime.split(':').map(Number)
        const mins = (eh * 60 + em) - startMins
        if (mins > 0) dayMins = mins
      }
    }
    info.set(m.userId, { name: m.user.name, avatar: m.user.avatar, startMins, dayMins })
  }
  return { attendanceEnabled, tolerance, info }
}

// Ocupación por bucket (semana ISO o mes). Comparte la lógica entre la métrica semanal
// `ocupacion` y la mensual `delta_horas`; solo cambian el rango y `periodOf`.
async function occupancyByBucket(workspaceId, tz, offset, rangeStart, rangeEnd, periodOf, info) {
  const out = {}
  const scheduled = [...info.entries()].filter(([, v]) => v.dayMins != null)
  if (!scheduled.length) return out
  const scheduledIds = new Set(scheduled.map(([uid]) => uid))

  const [leaves, tasks, logins] = await Promise.all([
    prisma.vacationRequest.findMany({
      where: { workspaceId, status: 'approved', startDate: { lte: rangeEnd }, endDate: { gte: rangeStart } },
      select: { userId: true, startDate: true, endDate: true },
    }),
    prisma.task.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: { gte: new Date(rangeStart + 'T00:00:00' + offset), lte: new Date(rangeEnd + 'T23:59:59' + offset) },
        workDay: { workspaceId },
      },
      select: { userId: true, completedAt: true, pausedMinutes: true, minutesOverride: true, startedAt: true },
    }),
    prisma.userLogin.findMany({
      where: { workspaceId, loginAt: { gte: new Date(rangeStart + 'T00:00:00' + offset), lte: new Date(rangeEnd + 'T23:59:59' + offset) } },
      select: { userId: true, loginAt: true },
    }),
  ])

  // Días laborables del rango: días donde >50% del equipo activo se logueó (excluye fines de
  // semana y feriados). Las horas disponibles se asignan solo en esos días.
  const activeIds = new Set(info.keys())
  const laborSet = laborableDays(logins.filter(l => activeIds.has(l.userId)), info.size, tz)

  // Días laborables de licencia (set) por usuario, recortados al rango.
  const leaveDays = new Map()
  for (const lv of leaves) {
    if (!scheduledIds.has(lv.userId)) continue
    const start = lv.startDate > rangeStart ? lv.startDate : rangeStart
    const end   = lv.endDate   < rangeEnd   ? lv.endDate   : rangeEnd
    if (!leaveDays.has(lv.userId)) leaveDays.set(lv.userId, new Set())
    const set = leaveDays.get(lv.userId)
    for (const d of laborSet) if (d >= start && d <= end) set.add(d)
  }

  // Horas disponibles por (bucket, usuario): días laborables sin licencia × jornada.
  const availByBucket = new Map()
  for (const day of laborSet) {
    const period = periodOf(day)
    if (!availByBucket.has(period)) availByBucket.set(period, new Map())
    const wm = availByBucket.get(period)
    for (const [uid, v] of scheduled) {
      if (leaveDays.get(uid)?.has(day)) continue
      wm.set(uid, (wm.get(uid) || 0) + v.dayMins)
    }
  }

  // Horas trabajadas por (bucket, usuario) — solo quienes tienen horario.
  const regByBucket = new Map()
  for (const t of tasks) {
    if (!scheduledIds.has(t.userId)) continue
    const date = localDate(t.completedAt, tz)
    if (date < rangeStart || date > rangeEnd) continue
    const period = periodOf(date)
    if (!regByBucket.has(period)) regByBucket.set(period, new Map())
    const wm = regByBucket.get(period)
    wm.set(t.userId, (wm.get(t.userId) || 0) + taskMins(t))
  }

  for (const [period, availMap] of availByBucket) {
    const regMap = regByBucket.get(period) || new Map()
    let sumAvail = 0, sumReg = 0
    const people = []
    for (const [uid, availMins] of availMap) {
      if (availMins <= 0) continue
      const regMins = regMap.get(uid) || 0
      sumAvail += availMins
      sumReg   += regMins
      const pInfo = info.get(uid)
      people.push({
        userId: uid,
        name:   pInfo?.name || '—',
        avatar: pInfo?.avatar || null,
        util:   Math.round(regMins / availMins * 100),
        registeredHours: round1(regMins / 60),
        availableHours:  round1(availMins / 60),
      })
    }
    if (sumAvail <= 0) continue
    people.sort((a, b) => a.util - b.util) // los que menos aprovecharon, primero
    out[period] = { value: Math.round(sumReg / sumAvail * 100), top3: people.slice(0, 3) }
  }
  return out
}

// ── Semanales ───────────────────────────────────────────────────────────────────

async function computeTardanzasWeekly(workspaceId, tz, offset, rangeStart, rangeEnd, ctx) {
  const out = {}
  if (!ctx.attendanceEnabled) return out

  const logins = await prisma.userLogin.findMany({
    where: { workspaceId, loginAt: { gte: new Date(rangeStart + 'T00:00:00' + offset), lte: new Date(rangeEnd + 'T23:59:59' + offset) } },
    select: { userId: true, loginAt: true },
    orderBy: { loginAt: 'asc' },
  })

  // Días laborables del rango (>50% del equipo activo logueado): una tardanza solo cuenta en
  // un día laborable (un domingo con una conexión suelta no es un día de trabajo).
  const activeIds = new Set(ctx.info.keys())
  const laborSet = laborableDays(logins.filter(l => activeIds.has(l.userId)), ctx.info.size, tz)

  // Primer login por (usuario, día local).
  const firstByUserDay = new Map()
  for (const l of logins) {
    const date = localDate(l.loginAt, tz)
    if (date < rangeStart || date > rangeEnd) continue
    const key = `${l.userId}::${date}`
    if (!firstByUserDay.has(key)) firstByUserDay.set(key, loginMinsFromMidnight(l.loginAt, tz))
  }

  const byWeek = new Map() // period -> Map<uid, {lateDays, lateMins}>
  for (const [key, mins] of firstByUserDay) {
    const [uidStr, date] = key.split('::')
    const uid = Number(uidStr)
    const startMins = ctx.info.get(uid)?.startMins
    if (startMins == null) continue
    if (!laborSet.has(date)) continue
    // Fuera de la ventana de ±2h no es una llegada → no es tardanza (descarta domingo a la tarde, etc.).
    if (!inArrivalWindow(mins, startMins)) continue
    const lateBy = mins - startMins - ctx.tolerance
    if (lateBy <= 0) continue
    const period = isoWeekPeriodOf(date)
    if (!byWeek.has(period)) byWeek.set(period, new Map())
    const wm = byWeek.get(period)
    const cur = wm.get(uid) || { lateDays: 0, lateMins: 0 }
    cur.lateDays += 1
    cur.lateMins += lateBy
    wm.set(uid, cur)
  }

  for (const [period, wm] of byWeek) {
    let total = 0
    const people = []
    for (const [uid, v] of wm) {
      total += v.lateDays
      const pInfo = ctx.info.get(uid)
      people.push({ userId: uid, name: pInfo?.name || '—', avatar: pInfo?.avatar || null, lateDays: v.lateDays, lateMins: v.lateMins })
    }
    people.sort((a, b) => (b.lateDays - a.lateDays) || (b.lateMins - a.lateMins))
    out[period] = { value: total, top3: people.slice(0, 3) }
  }
  return out
}

// Tareas completadas por semana (todas las del equipo, por fecha de completado).
// La tarjeta rankea a quienes más completaron. No depende del horario; usa `info`
// solo para nombres/avatares del top 3.
async function computeTareasCompletadasWeekly(workspaceId, tz, offset, rangeStart, rangeEnd, info) {
  const out = {}
  const tasks = await prisma.task.findMany({
    where: {
      status: 'COMPLETED',
      completedAt: { gte: new Date(rangeStart + 'T00:00:00' + offset), lte: new Date(rangeEnd + 'T23:59:59' + offset) },
      workDay: { workspaceId },
    },
    select: { userId: true, completedAt: true },
  })

  const byWeek = new Map() // period -> Map<uid, count>
  for (const t of tasks) {
    const date = localDate(t.completedAt, tz)
    if (date < rangeStart || date > rangeEnd) continue
    const period = isoWeekPeriodOf(date)
    if (!byWeek.has(period)) byWeek.set(period, new Map())
    const wm = byWeek.get(period)
    wm.set(t.userId, (wm.get(t.userId) || 0) + 1)
  }

  for (const [period, wm] of byWeek) {
    let total = 0
    const people = []
    for (const [uid, count] of wm) {
      total += count
      const pInfo = info?.get(uid)
      people.push({ userId: uid, name: pInfo?.name || '—', avatar: pInfo?.avatar || null, count })
    }
    people.sort((a, b) => b.count - a.count)
    out[period] = { value: total, top3: people.slice(0, 3) }
  }
  return out
}

// Personas con una o más faltas (strikes), acumuladas al cierre de cada semana ISO.
// Las faltas son un "stock": una persona las acumula en el tiempo (no es un evento de la
// semana). Por eso el valor de cada semana es la cantidad de personas distintas que, al
// cierre de esa semana (domingo), tenían ≥1 falta registrada (por `createdAt`). Solo se
// emiten semanas desde la primera falta en adelante (antes quedan vacías). No depende del
// horario del equipo — usa la relación `user` de cada strike para nombres/avatares.
async function computeFaltasWeekly(workspaceId, tz, offset, rangeStart, rangeEnd) {
  const out = {}
  const strikes = await prisma.eOSStrike.findMany({
    where:   { workspaceId },
    select:  { userId: true, createdAt: true, user: { select: { name: true, avatar: true } } },
    orderBy: { createdAt: 'asc' },
  })
  if (!strikes.length) return out

  // Lunes de la semana ISO que contiene rangeStart; iteramos de a 7 días hasta rangeEnd.
  const d0  = new Date(rangeStart + 'T00:00:00Z')
  const dow = d0.getUTCDay() || 7 // 1=Lun … 7=Dom
  let monday = addDays(rangeStart, -(dow - 1))

  while (monday <= rangeEnd) {
    const weekEnd = addDays(monday, 6)                       // domingo de la semana
    const cutoff  = new Date(weekEnd + 'T23:59:59' + offset) // fin del domingo local
    const perUser = new Map()
    for (const s of strikes) {
      if (s.createdAt > cutoff) break // ordenadas asc → el resto es futuro
      const cur = perUser.get(s.userId) || {
        userId: s.userId, name: s.user?.name || '—', avatar: s.user?.avatar || null, strikes: 0,
      }
      cur.strikes += 1
      perUser.set(s.userId, cur)
    }
    if (perUser.size) {
      const people = [...perUser.values()].sort((a, b) => b.strikes - a.strikes)
      out[isoWeekPeriodOf(monday)] = { value: people.length, top3: people.slice(0, 3) }
    }
    monday = addDays(monday, 7)
  }
  return out
}

// To-Dos de L10 completados por semana ISO. Cada EOSTodo ya está asignado a su
// semana (`week`, formato "YYYY-Www"); contamos los `done` de las semanas del año.
async function computeTodosCompletadosWeekly(workspaceId, year, info) {
  const out = {}
  const todos = await prisma.eOSTodo.findMany({
    where:  { workspaceId, done: true },
    select: { week: true, ownerId: true },
  })

  const byWeek = new Map() // week -> { total, owners: Map<uid, count> }
  for (const t of todos) {
    if (!t.week || t.week.slice(0, 4) !== String(year)) continue
    if (!byWeek.has(t.week)) byWeek.set(t.week, { total: 0, owners: new Map() })
    const w = byWeek.get(t.week)
    w.total += 1
    if (t.ownerId != null) w.owners.set(t.ownerId, (w.owners.get(t.ownerId) || 0) + 1)
  }

  for (const [week, w] of byWeek) {
    const people = []
    for (const [uid, count] of w.owners) {
      const pInfo = info?.get(uid)
      people.push({ userId: uid, name: pInfo?.name || '—', avatar: pInfo?.avatar || null, done: count })
    }
    people.sort((a, b) => b.done - a.done)
    out[week] = { value: w.total, top3: people.slice(0, 3) }
  }
  return out
}

// ── Mensuales ─────────────────────────────────────────────────────────────────

async function computeProyectosNuevosMonthly(workspaceId, tz, offset, rangeStart, rangeEnd, closedMonths) {
  const out = {}
  const closed = new Set(closedMonths)
  const projects = await prisma.project.findMany({
    where: { workspaceId, createdAt: { gte: new Date(rangeStart + 'T00:00:00' + offset), lte: new Date(rangeEnd + 'T23:59:59' + offset) } },
    select: { id: true, name: true, createdAt: true },
  })
  const byMonth = new Map()
  for (const p of projects) {
    const m = monthOf(localDate(p.createdAt, tz))
    if (!closed.has(m)) continue
    if (!byMonth.has(m)) byMonth.set(m, [])
    byMonth.get(m).push({ name: p.name })
  }
  for (const [m, items] of byMonth) out[m] = { value: items.length, top3: items.slice(0, 5) }
  // Conteo de eventos: un mes cerrado sin altas es "0", no "sin datos".
  for (const m of closedMonths) if (!out[m]) out[m] = { value: 0, top3: [] }
  return out
}

async function computeProyectosPerdidosMonthly(workspaceId, tz, offset, rangeStart, rangeEnd, closedMonths) {
  const out = {}
  const closed = new Set(closedMonths)
  const projects = await prisma.project.findMany({
    where: { workspaceId, lostAt: { gte: new Date(rangeStart + 'T00:00:00' + offset), lte: new Date(rangeEnd + 'T23:59:59' + offset) } },
    select: { id: true, name: true, lostAt: true },
  })
  const byMonth = new Map()
  for (const p of projects) {
    if (!p.lostAt) continue
    const m = monthOf(localDate(p.lostAt, tz))
    if (!closed.has(m)) continue
    if (!byMonth.has(m)) byMonth.set(m, [])
    byMonth.get(m).push({ name: p.name })
  }
  for (const [m, items] of byMonth) out[m] = { value: items.length, top3: items.slice(0, 5) }
  // Conteo de eventos: un mes cerrado sin bajas es "0", no "sin datos".
  for (const m of closedMonths) if (!out[m]) out[m] = { value: 0, top3: [] }
  return out
}

// Lee una métrica del histórico de RRHH (RrhhMetricSnapshot) por mes cerrado.
// `decimals` redondea el valor (0 = entero para `equipo`, 1 = un decimal para
// antigüedad y proyectos/persona).
async function computeRrhhSnapshotMonthly(workspaceId, closedMonths, metric, decimals = 0) {
  const out = {}
  if (!closedMonths.length) return out
  const snaps = await prisma.rrhhMetricSnapshot.findMany({
    where: { workspaceId, metric, month: { in: closedMonths } },
    select: { month: true, value: true },
  })
  const factor = Math.pow(10, decimals)
  for (const s of snaps) out[s.month] = { value: Math.round(s.value * factor) / factor }
  return out
}

// Informes mensuales de marketing generados, por mes (del informe, no de creación).
// La tarjeta lista los proyectos.
async function computeInformesEntregadosMonthly(workspaceId, closedMonths) {
  const out = {}
  if (!closedMonths.length) return out
  const reports = await prisma.monthlyReport.findMany({
    where:  { workspaceId, month: { in: closedMonths }, OR: GENERATED_REPORT_OR },
    select: { month: true, project: { select: { name: true } } },
  })
  const byMonth = new Map()
  for (const r of reports) {
    if (!byMonth.has(r.month)) byMonth.set(r.month, [])
    byMonth.get(r.month).push({ name: r.project?.name || '—' })
  }
  for (const [m, items] of byMonth) out[m] = { value: items.length, top3: items.slice(0, 5) }
  return out
}

// Seguidores netos ganados en el mes = followers(M) − followers(M−1), sumado sobre
// todos los proyectos de cada red (IG + TikTok + LinkedIn). La tarjeta muestra el
// desglose por red. Solo cuenta proyectos con snapshot en ambos meses.
async function computeSeguidoresNuevosMonthly(workspaceId, closedMonths) {
  const out = {}
  if (!closedMonths.length) return out
  const baseMonth = prevMonthStr(closedMonths[0])
  const allMonths = [baseMonth, ...closedMonths]
  const networks = [
    { label: 'Instagram', model: prisma.instagramSnapshot },
    { label: 'TikTok',    model: prisma.tikTokSnapshot },
    { label: 'LinkedIn',  model: prisma.linkedinSnapshot },
  ]

  const perMonth = new Map() // month -> Map<netLabel, netSum>
  for (const net of networks) {
    const rows = await net.model.findMany({
      where:  { workspaceId, month: { in: allMonths } },
      select: { projectId: true, month: true, followersCount: true },
    })
    const byProject = new Map() // projectId -> Map<month, followers>
    for (const r of rows) {
      if (r.followersCount == null) continue
      if (!byProject.has(r.projectId)) byProject.set(r.projectId, new Map())
      byProject.get(r.projectId).set(r.month, r.followersCount)
    }
    for (const m of closedMonths) {
      const prev = prevMonthStr(m)
      let sum = 0, hasData = false
      for (const months of byProject.values()) {
        const cur = months.get(m), pv = months.get(prev)
        if (cur != null && pv != null) { sum += (cur - pv); hasData = true }
      }
      if (!hasData) continue
      if (!perMonth.has(m)) perMonth.set(m, new Map())
      perMonth.get(m).set(net.label, (perMonth.get(m).get(net.label) || 0) + sum)
    }
  }

  for (const [m, netMap] of perMonth) {
    let total = 0
    const breakdown = []
    for (const [label, val] of netMap) { total += val; breakdown.push({ name: label, value: val }) }
    breakdown.sort((a, b) => b.value - a.value)
    out[m] = { value: total, top3: breakdown }
  }
  return out
}

// Porcentaje de objetivos de marketing cumplidos (status 'ok') sobre el total
// evaluable (ok/partial/fail) en el mes, agregando todos los proyectos con objetivos.
// La tarjeta lista los no cumplidos. Reutiliza el motor de objetivos de marketing.
async function computeObjetivosCumplidosMonthly(workspaceId, closedMonths) {
  const out = {}
  if (!closedMonths.length) return out
  const objs = await prisma.marketingObjective.findMany({
    where:  { workspaceId },
    select: { projectId: true },
  })
  const projectIds = [...new Set(objs.map(o => o.projectId))]
  if (!projectIds.length) return out

  const projects = await prisma.project.findMany({
    where:  { id: { in: projectIds } },
    select: { id: true, name: true },
  })
  const nameById = new Map(projects.map(p => [p.id, p.name]))

  for (const month of closedMonths) {
    let ok = 0, total = 0
    const unmet = []
    for (const pid of projectIds) {
      let results = []
      try {
        results = await computeObjectives({ projectId: pid, workspaceId, dataMonth: month })
      } catch (err) {
        console.error(`[EOSAutoScorecard] objetivos pid=${pid} ${month}:`, err.message)
      }
      for (const r of results) {
        if (r.status !== 'ok' && r.status !== 'partial' && r.status !== 'fail') continue
        total += 1
        if (r.status === 'ok') ok += 1
        else unmet.push({ name: `${nameById.get(pid) || '—'} · ${r.label}` })
      }
    }
    if (total > 0) out[month] = { value: Math.round(ok / total * 100), top3: unmet.slice(0, 5) }
  }
  return out
}

// Estado de captura del MES EN CURSO para las métricas mensuales pedidas.
// Sirve para explicar una tarjeta vacía: un mes cerrado sin valor puede deberse a que
// los datos recién se están empezando a registrar (`collecting` → aparecerán en el
// próximo cierre) o a que directamente no se están guardando (`not_saving` → falta
// configurar la fuente). Solo tiene sentido para el año/mes actual.
// Devuelve { [autoKey]: 'collecting' | 'not_saving' }.
async function computeCurrentMonthStatus(workspaceId, tz, autoKeys = []) {
  const status = {}
  const monthlyKeys = autoKeys.filter(k => EOS_AUTO_METRICS[k]?.frequency === 'monthly')
  if (!monthlyKeys.length) return status
  const curMonth = todayString(tz).slice(0, 7)

  // RRHH: los snapshots del mes en curso se upsertean en vivo (al visitar RRHH/Dashboard).
  // Que exista el snapshot de este mes = los datos se están registrando.
  const rrhhMap = { equipo: 'activeMembers', antiguedad: 'tenure', proyectos_por_persona: 'projectsPerPerson' }
  const rrhhKeys = monthlyKeys.filter(k => rrhhMap[k])
  if (rrhhKeys.length) {
    const snaps = await prisma.rrhhMetricSnapshot.findMany({
      where:  { workspaceId, month: curMonth, metric: { in: rrhhKeys.map(k => rrhhMap[k]) } },
      select: { metric: true },
    })
    const present = new Set(snaps.map(s => s.metric))
    for (const k of rrhhKeys) status[k] = present.has(rrhhMap[k]) ? 'collecting' : 'not_saving'
  }

  // Δ horas: se acumula en vivo si al menos alguien tiene horario completo cargado.
  if (monthlyKeys.includes('delta_horas')) {
    const m = await prisma.workspaceMember.findFirst({
      where:  { workspaceId, active: true, workStartTime: { not: null }, workEndTime: { not: null } },
      select: { userId: true },
    })
    status.delta_horas = m ? 'collecting' : 'not_saving'
  }

  // Eventos siempre trackeados por el sistema (no dependen de configurar nada).
  for (const k of ['proyectos_nuevos', 'proyectos_perdidos']) {
    if (monthlyKeys.includes(k)) status[k] = 'collecting'
  }

  // Marketing: la fuente está "viva" si ya existe al menos un dato de ese tipo en el
  // workspace (snapshot de red / informe / objetivo). Robusto al timing de fin de mes.
  if (monthlyKeys.includes('seguidores_nuevos')) {
    const [ig, tk, li] = await Promise.all([
      prisma.instagramSnapshot.findFirst({ where: { workspaceId }, select: { id: true } }),
      prisma.tikTokSnapshot.findFirst({   where: { workspaceId }, select: { id: true } }),
      prisma.linkedinSnapshot.findFirst({ where: { workspaceId }, select: { id: true } }),
    ])
    status.seguidores_nuevos = (ig || tk || li) ? 'collecting' : 'not_saving'
  }
  if (monthlyKeys.includes('informes_entregados')) {
    const r = await prisma.monthlyReport.findFirst({
      where: { workspaceId, OR: GENERATED_REPORT_OR }, select: { id: true },
    })
    status.informes_entregados = r ? 'collecting' : 'not_saving'
  }
  if (monthlyKeys.includes('objetivos_cumplidos')) {
    const o = await prisma.marketingObjective.findFirst({ where: { workspaceId }, select: { id: true } })
    status.objetivos_cumplidos = o ? 'collecting' : 'not_saving'
  }

  return status
}

// Computa las métricas automáticas pedidas para un año calendario.
// year = número (ej 2026). autoKeys = subset de las claves del catálogo.
// Devuelve { [autoKey]: { period: { value, top3? } } } solo con las claves pedidas.
async function computeAutoScorecardYear(workspaceId, tz, year, autoKeys = []) {
  const out = {}
  for (const k of autoKeys) out[k] = {}
  if (!autoKeys.length) return out

  const todayStr = todayString(tz)
  const offset = tzOffsetStr(tz)

  const weeklyKeys  = autoKeys.filter(k => EOS_AUTO_METRICS[k]?.frequency === 'weekly')
  const monthlyKeys = autoKeys.filter(k => EOS_AUTO_METRICS[k]?.frequency === 'monthly')

  // Horarios del equipo: los necesitan tardanzas, ocupacion, tareas/todos (nombres) y
  // delta_horas. `faltas` es independiente (trae sus propios nombres/avatares).
  const needsSchedule = weeklyKeys.some(k => k !== 'faltas') || monthlyKeys.includes('delta_horas')
  const ctx = needsSchedule ? await loadMemberInfo(workspaceId) : null

  // ── Semanales: rango = año calendario con padding ±7 días, sin futuro.
  if (weeklyKeys.length) {
    let wStart = addDays(`${year}-01-01`, -7)
    let wEnd   = addDays(`${year}-12-31`, 7)
    if (wStart <= todayStr) {
      if (wEnd > todayStr) wEnd = todayStr
      if (weeklyKeys.includes('tardanzas'))         out.tardanzas         = await computeTardanzasWeekly(workspaceId, tz, offset, wStart, wEnd, ctx)
      if (weeklyKeys.includes('ocupacion'))         out.ocupacion         = await occupancyByBucket(workspaceId, tz, offset, wStart, wEnd, isoWeekPeriodOf, ctx.info)
      if (weeklyKeys.includes('tareas_completadas')) out.tareas_completadas = await computeTareasCompletadasWeekly(workspaceId, tz, offset, wStart, wEnd, ctx.info)
      if (weeklyKeys.includes('todos_completados'))  out.todos_completados  = await computeTodosCompletadosWeekly(workspaceId, year, ctx.info)
      if (weeklyKeys.includes('faltas'))             out.faltas             = await computeFaltasWeekly(workspaceId, tz, offset, wStart, wEnd)
    }
  }

  // ── Mensuales: solo meses cerrados (anteriores al mes en curso).
  if (monthlyKeys.length) {
    const curMonth = todayStr.slice(0, 7)
    const closedMonths = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
      .filter(m => m < curMonth)
    if (closedMonths.length) {
      const mStart = `${closedMonths[0]}-01`
      const mEnd   = monthBounds(closedMonths[closedMonths.length - 1]).endDate
      if (monthlyKeys.includes('delta_horas'))           out.delta_horas           = await occupancyByBucket(workspaceId, tz, offset, mStart, mEnd, monthOf, ctx.info)
      if (monthlyKeys.includes('proyectos_nuevos'))      out.proyectos_nuevos      = await computeProyectosNuevosMonthly(workspaceId, tz, offset, mStart, mEnd, closedMonths)
      if (monthlyKeys.includes('proyectos_perdidos'))    out.proyectos_perdidos    = await computeProyectosPerdidosMonthly(workspaceId, tz, offset, mStart, mEnd, closedMonths)
      if (monthlyKeys.includes('equipo'))                out.equipo                = await computeRrhhSnapshotMonthly(workspaceId, closedMonths, 'activeMembers', 0)
      if (monthlyKeys.includes('antiguedad'))            out.antiguedad            = await computeRrhhSnapshotMonthly(workspaceId, closedMonths, 'tenure', 1)
      if (monthlyKeys.includes('proyectos_por_persona')) out.proyectos_por_persona = await computeRrhhSnapshotMonthly(workspaceId, closedMonths, 'projectsPerPerson', 1)
      if (monthlyKeys.includes('informes_entregados'))   out.informes_entregados   = await computeInformesEntregadosMonthly(workspaceId, closedMonths)
      if (monthlyKeys.includes('seguidores_nuevos'))     out.seguidores_nuevos     = await computeSeguidoresNuevosMonthly(workspaceId, closedMonths)
      if (monthlyKeys.includes('objetivos_cumplidos'))   out.objetivos_cumplidos   = await computeObjetivosCumplidosMonthly(workspaceId, closedMonths)
    }
  }

  return out
}

module.exports = { computeAutoScorecardYear, computeCurrentMonthStatus, isoWeekPeriodOf }
