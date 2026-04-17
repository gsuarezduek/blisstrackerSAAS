const Anthropic = require('@anthropic-ai/sdk')
const prisma = require('../lib/prisma')
const { sendWeeklySummaryEmail } = require('./email.service')
const { parseAIJson } = require('../utils/parseAIJson')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const AI_TIMEOUT_MS = 30000
const { logTokens } = require('../lib/logTokens')

const TZ = 'America/Argentina/Buenos_Aires'

function toDateString(date) {
  return date.toLocaleDateString('en-CA', { timeZone: TZ })
}

function getWeekBounds(offsetWeeks = 0) {
  const now = new Date()
  const localDateStr = toDateString(now)
  const [y, m, d] = localDateStr.split('-').map(Number)
  const today = new Date(y, m - 1, d)

  // Day of week: 0=Sun, 1=Mon ... 6=Sat
  const dow = today.getDay()
  const daysToMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysToMonday - offsetWeeks * 7)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  return {
    from: monday.toISOString().slice(0, 10),
    to:   sunday.toISOString().slice(0, 10),
  }
}

function calcMins(t) {
  if (t.minutesOverride !== null && t.minutesOverride !== undefined) return t.minutesOverride
  if (!t.startedAt || !t.completedAt) return 0
  return Math.max(0, Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000) - (t.pausedMinutes || 0))
}

function fmtMins(mins) {
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
}

// Calcula minutos de una tarea atribuibles a un rango de fechas usando sesiones.
// Para tareas sin sesiones (creadas antes de la migración) usa el total completo como fallback.
function calcMinsForRange(t, from, to) {
  if (t.minutesOverride != null) return t.minutesOverride
  if (t.sessions && t.sessions.length > 0) {
    const rangeStart = new Date(from + 'T00:00:00-03:00')
    const rangeEnd   = new Date(to   + 'T23:59:59-03:00')
    let total = 0
    for (const s of t.sessions) {
      if (!s.endedAt) continue
      const sStart = new Date(s.startedAt) < rangeStart ? rangeStart : new Date(s.startedAt)
      const sEnd   = new Date(s.endedAt)   > rangeEnd   ? rangeEnd   : new Date(s.endedAt)
      if (sEnd > sStart) total += (sEnd - sStart) / 60000
    }
    return Math.round(total)
  }
  return calcMins(t)
}

async function getWeeklyData(userId) {
  const currentWeek = getWeekBounds(0)
  const prevWeek    = getWeekBounds(1)

  const [completedTasks, pendingTasks, prevTasks, workDays] = await Promise.all([
    // Tareas completadas esta semana (filtro por completedAt, no por workDay)
    prisma.task.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        startedAt:   { not: null },
        completedAt: {
          not: null,
          gte: new Date(currentWeek.from + 'T00:00:00-03:00'),
          lte: new Date(currentWeek.to   + 'T23:59:59-03:00'),
        },
      },
      include: {
        project:  { select: { id: true, name: true } },
        sessions: { select: { startedAt: true, endedAt: true }, where: { endedAt: { not: null } } },
      },
      orderBy: { completedAt: 'asc' },
    }),
    // Tareas pendientes actuales (cualquier semana)
    prisma.task.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'PAUSED', 'BLOCKED'] },
      },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    // Tareas completadas semana anterior (para comparación)
    prisma.task.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        startedAt:   { not: null },
        completedAt: {
          not: null,
          gte: new Date(prevWeek.from + 'T00:00:00-03:00'),
          lte: new Date(prevWeek.to   + 'T23:59:59-03:00'),
        },
      },
      select: {
        id: true, minutesOverride: true, pausedMinutes: true, startedAt: true, completedAt: true,
        sessions: { select: { startedAt: true, endedAt: true }, where: { endedAt: { not: null } } },
      },
    }),
    // Días trabajados esta semana
    prisma.workDay.findMany({
      where: {
        userId,
        date: { gte: currentWeek.from, lte: currentWeek.to },
      },
      select: { date: true, startedAt: true, endedAt: true },
    }),
  ])

  // Agrupar completadas por proyecto (solo tiempo que cayó dentro de esta semana)
  const byProject = {}
  let totalMinutes = 0
  for (const t of completedTasks) {
    const mins = calcMinsForRange(t, currentWeek.from, currentWeek.to)
    totalMinutes += mins
    const pid = t.project.id
    if (!byProject[pid]) byProject[pid] = { project: t.project, minutes: 0, tasks: [] }
    byProject[pid].minutes += mins
    byProject[pid].tasks.push({ description: t.description, minutes: mins })
  }

  // Semana anterior
  const prevTotalMinutes = prevTasks.reduce((s, t) => s + calcMinsForRange(t, prevWeek.from, prevWeek.to), 0)

  return {
    week: currentWeek,
    workDays,
    completedTasks,
    totalMinutes,
    byProject: Object.values(byProject).sort((a, b) => b.minutes - a.minutes),
    pendingTasks,
    prev: {
      completedCount: prevTasks.length,
      totalMinutes:   prevTotalMinutes,
      week:           prevWeek,
    },
  }
}

const FREQ_LABEL = {
  daily:      'diaria',
  weekly:     'semanal',
  monthly:    'mensual',
  first_week: 'primera semana del mes',
  monday:     'lunes (inicio de semana)',
  friday:     'viernes (cierre de semana)',
}

function buildRoleContext(roleExpectation) {
  if (!roleExpectation) return ''
  let ctx = ''

  if (roleExpectation.description) {
    ctx += `\nPROPÓSITO DEL ROL: ${roleExpectation.description}\n`
  }

  const results = Array.isArray(roleExpectation.expectedResults) ? roleExpectation.expectedResults : []
  if (results.length > 0) {
    ctx += `RESULTADOS ESPERADOS:\n`
    for (const r of results) ctx += `  - ${r}\n`
  }

  const resps = Array.isArray(roleExpectation.operationalResponsibilities) ? roleExpectation.operationalResponsibilities : []
  if (resps.length > 0) {
    ctx += `RESPONSABILIDADES OPERATIVAS:\n`
    for (const r of resps) {
      ctx += `  ${r.category}:\n`
      for (const item of (r.items || [])) ctx += `    - ${item}\n`
    }
  }

  const tasks = Array.isArray(roleExpectation.recurrentTasks) ? roleExpectation.recurrentTasks : []
  if (tasks.length > 0) {
    ctx += `TAREAS RECURRENTES DEL ROL:\n`
    for (const t of tasks) {
      const freq = FREQ_LABEL[t.frequency] || t.frequency
      const detail = t.detail ? ` (${t.detail})` : ''
      ctx += `  - ${t.task} [${freq}]${detail}\n`
    }
  }

  const deps = Array.isArray(roleExpectation.dependencies) ? roleExpectation.dependencies : []
  if (deps.length > 0) {
    ctx += `DEPENDENCIAS DEL ROL:\n`
    for (const d of deps) {
      const dir = d.direction === 'delivers' ? 'Entrega a' : 'Recibe de'
      ctx += `  - ${dir} ${d.roleName}: ${d.description}\n`
    }
  }

  return ctx
}

function buildMemoryContext(memories) {
  if (!memories || memories.length === 0) return ''
  const latest = memories[0]
  let ctx = '\nPERFIL DE PRODUCTIVIDAD HISTÓRICO:\n'
  if (latest.tendencias)      ctx += `Tendencias: ${latest.tendencias}\n`
  if (latest.fortalezas)      ctx += `Fortalezas: ${latest.fortalezas}\n`
  if (latest.areasDeAtencion) ctx += `Áreas de atención: ${latest.areasDeAtencion}\n`
  const s = latest.estadisticas || {}
  if (s.tasaCompletado !== undefined) {
    ctx += `Estadísticas: ${Math.round(s.tasaCompletado * 100)}% completado, ${s.promedioTareasPorDia} tareas/día en promedio`
    if (s.avgPauseMinutes > 0) ctx += `, ${s.avgPauseMinutes}m en pausa promedio`
    if (s.stuckTasksCount > 0) ctx += `, ${s.stuckTasksCount} tareas que quedaron atascadas`
    ctx += '\n'
  }
  if (s.medianMinutes > 0) {
    const parts = [`mediana ${s.medianMinutes}m/tarea`]
    if (s.quickWins > 0) parts.push(`${s.quickWins} quick wins (<30m)`)
    if (s.deepWork  > 0) parts.push(`${s.deepWork} trabajo profundo (≥90m)`)
    ctx += `Velocidad: ${parts.join(', ')}\n`
  }
  if (s.feedbackScore !== null && s.feedbackScore !== undefined) {
    ctx += `Receptividad al coaching: ${Math.round(s.feedbackScore * 100)}% de insights aceptados\n`
  }
  if (Array.isArray(s.porProyecto) && s.porProyecto.length > 0) {
    ctx += 'Por proyecto (historial):\n'
    for (const p of s.porProyecto) {
      const pct = p.creadas > 0 ? Math.round(p.completadas / p.creadas * 100) : 0
      const h = Math.floor(p.minutes / 60)
      const m = p.minutes % 60
      const timeStr = p.minutes > 0 ? ` (${h > 0 ? h + 'h' : ''}${m > 0 ? m + 'm' : ''})` : ''
      ctx += `  ${p.nombre}: ${p.completadas}/${p.creadas} completadas (${pct}%)${timeStr}\n`
    }
  }
  if (memories.length > 1) {
    ctx += 'Evolución por semana:\n'
    for (const mem of memories.slice(1)) {
      const ms = mem.estadisticas || {}
      if (ms.tasaCompletado !== undefined) {
        ctx += `  ${mem.weekStart}: ${Math.round(ms.tasaCompletado * 100)}% completado`
        if (ms.promedioTareasPorDia) ctx += `, ${ms.promedioTareasPorDia} tareas/día`
        if (ms.stuckTasksCount > 0)  ctx += `, ${ms.stuckTasksCount} atascadas`
        ctx += '\n'
      }
    }
  }
  return ctx
}

async function generateAnalysis(user, data, roleExpectation, memory) {
  const { week, completedTasks, totalMinutes, byProject, pendingTasks, prev, workDays } = data

  const projectSummary = byProject
    .map(p => `  - ${p.project.name}: ${fmtMins(p.minutes)} (${p.tasks.length} tareas)`)
    .join('\n') || '  (sin tiempo registrado por proyecto)'

  const completedList = completedTasks
    .slice(0, 20)
    .map(t => `  - [${t.project.name}] ${t.description} (${fmtMins(calcMins(t))})`)
    .join('\n') || '  (ninguna)'

  const pendingList = pendingTasks
    .slice(0, 15)
    .map(t => `  - [${t.status}] [${t.project.name}] ${t.description}`)
    .join('\n') || '  (ninguna)'

  const prevComparison = prev.completedCount > 0
    ? `Semana anterior (${fmtDate(prev.week.from)} – ${fmtDate(prev.week.to)}): ${prev.completedCount} tareas, ${fmtMins(prev.totalMinutes)} registrados`
    : 'Sin datos de la semana anterior para comparar'

  const roleCtx   = buildRoleContext(roleExpectation)
  const memoryCtx = buildMemoryContext(memory)

  const userPrompt = `
Analiza la semana laboral de ${user.name} y generá el JSON de análisis de productividad.

ROL: ${user.role}${roleCtx}${memoryCtx}
SEMANA: ${fmtDate(week.from)} al ${fmtDate(week.to)}
DÍAS TRABAJADOS: ${workDays.length} día${workDays.length !== 1 ? 's' : ''}

TAREAS COMPLETADAS (${completedTasks.length}):
${completedList}

TIEMPO POR PROYECTO:
${projectSummary}
TOTAL: ${fmtMins(totalMinutes)}

TAREAS PENDIENTES/PAUSADAS/BLOQUEADAS (${pendingTasks.length}):
${pendingList}

COMPARACIÓN:
${prevComparison}
Esta semana: ${completedTasks.length} tareas, ${fmtMins(totalMinutes)} registrados
`.trim()

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `Sos un coach de productividad que aplica la metodología GTD. Analizás datos reales de trabajo y devolvés ÚNICAMENTE un objeto JSON válido (sin markdown, sin bloques de código, sin texto extra antes o después) con exactamente estas claves:
- resumen: string (2-3 oraciones con lo más relevante de la semana)
- quePasoRealmente: string (análisis de patrones, foco, uso del tiempo, 3-5 oraciones; si hay PERFIL DE PRODUCTIVIDAD HISTÓRICO, usalo para contextualizar — por ejemplo si esta semana fue mejor o peor que el patrón habitual)
- insightPrincipal: string (UNA conclusión concreta y útil, 1-2 oraciones; personalizala con el historial si está disponible)
- riesgos: string (posibles problemas si este comportamiento continúa, 2-3 oraciones)
- recomendaciones: array de exactamente 3 strings (acciones concretas y específicas para la próxima semana)
- enfoqueProximaSemana: string (qué priorizar la próxima semana, 2-3 oraciones)
- omisionesRol: string o null — analizá el perfil completo del rol si está disponible:
  · TAREAS RECURRENTES: ¿hay tareas semanales o mensuales que no aparecen en las completadas esta semana?
  · RESULTADOS ESPERADOS: si los resultados son cuantitativos (ej: "6 Reels por cuenta mensualmente"), ¿el volumen completado esta semana es compatible con cumplirlos al cierre del mes?
  · RESPONSABILIDADES OPERATIVAS: ¿hay alguna categoría de responsabilidad del rol completamente ausente en las tareas de esta semana?
  Si encontrás omisiones concretas, mencionálas con datos específicos (ej: "Completaste 2 Reels esta semana, necesitás 4 más para llegar a las 6 del mes"). null si no hay perfil de rol configurado o no hay omisiones relevantes.

Escribís en español rioplatense, forma clara, directa y ligeramente crítica cuando aporta valor. Nunca inventás información que no esté en los datos. Si no hay suficiente información para una sección, lo decís brevemente. Escribís como un humano, no como un robot. Evitás frases genéricas.`,
      messages: [{ role: 'user', content: userPrompt }],
    }, { timeout: AI_TIMEOUT_MS })
    logTokens('weeklyReport', user.id, msg.usage)

    let parsed
    try { parsed = parseAIJson(msg.content[0].text) }
    catch { throw new Error('Respuesta de IA inválida') }
    return parsed
  } catch (err) {
    console.error('[WeeklyReport] Error generando análisis con Claude:', err.message)
    return {
      resumen: `Esta semana ${user.name} completó ${completedTasks.length} tarea${completedTasks.length !== 1 ? 's' : ''} y registró ${fmtMins(totalMinutes)} de trabajo.`,
      quePasoRealmente: 'No fue posible generar el análisis detallado esta semana.',
      insightPrincipal: 'Revisá los datos de tu semana en el tracker para obtener más contexto.',
      riesgos: 'Sin análisis disponible.',
      recomendaciones: ['Revisá tus tareas pendientes', 'Priorizá según impacto', 'Definí objetivos claros para la próxima semana'],
      enfoqueProximaSemana: 'Continuá con las tareas pendientes y definí prioridades claras.',
      omisionesRol: null,
    }
  }
}

function buildWeeklyEmailHtml(user, data, analysis) {
  const { week, completedTasks, totalMinutes, byProject, pendingTasks, prev, workDays } = data

  const completedDiff = completedTasks.length - prev.completedCount
  const minutesDiff   = totalMinutes - prev.totalMinutes
  const diffSign      = n => n > 0 ? `+${n}` : `${n}`
  const hasPrev       = prev.completedCount > 0

  const projectRows = byProject.map(p => `
    <tr>
      <td style="padding: 8px 0; color: #334155; font-size: 14px; border-bottom: 1px solid #f1f5f9;">${p.project.name}</td>
      <td style="padding: 8px 0; color: #334155; font-size: 14px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600;">${fmtMins(p.minutes)}</td>
      <td style="padding: 8px 0; color: #94a3b8; font-size: 13px; border-bottom: 1px solid #f1f5f9; text-align: right;">${p.tasks.length} tarea${p.tasks.length !== 1 ? 's' : ''}</td>
    </tr>`).join('')

  const completedItems = completedTasks.slice(0, 10).map(t => `
    <li style="margin-bottom: 6px; color: #475569; font-size: 14px; line-height: 1.5;">
      <span style="color: #22c55e; margin-right: 6px;">✓</span>
      <strong style="color: #334155;">[${t.project.name}]</strong> ${t.description}
      <span style="color: #94a3b8; font-size: 12px;"> — ${fmtMins(calcMins(t))}</span>
    </li>`).join('')

  const pendingItems = pendingTasks.slice(0, 8).map(t => {
    const statusColor = t.status === 'BLOCKED' ? '#ef4444' : t.status === 'PAUSED' ? '#f59e0b' : '#94a3b8'
    const statusLabel = t.status === 'BLOCKED' ? 'Bloqueada' : t.status === 'PAUSED' ? 'Pausada' : 'Pendiente'
    return `
    <li style="margin-bottom: 6px; color: #475569; font-size: 14px; line-height: 1.5;">
      <span style="color: ${statusColor}; font-size: 11px; font-weight: 600; margin-right: 6px;">${statusLabel}</span>
      <strong style="color: #334155;">[${t.project.name}]</strong> ${t.description}
    </li>`
  }).join('')

  const recoItems = (analysis.recomendaciones || []).map((r, i) => `
    <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
      <span style="background: #4f46e5; color: white; border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0;">${i + 1}</span>
      <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.6;">${r}</p>
    </div>`).join('')

  const moreCompleted = completedTasks.length > 10
    ? `<p style="color: #94a3b8; font-size: 13px; margin-top: 8px;">...y ${completedTasks.length - 10} más</p>`
    : ''
  const morePending = pendingTasks.length > 8
    ? `<p style="color: #94a3b8; font-size: 13px; margin-top: 8px;">...y ${pendingTasks.length - 8} más</p>`
    : ''

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin: 0; padding: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
<div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">

  <!-- Header -->
  <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); border-radius: 16px; padding: 32px; margin-bottom: 24px; text-align: center;">
    <p style="color: rgba(255,255,255,0.8); font-size: 13px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">Resumen semanal</p>
    <h1 style="color: white; margin: 0 0 8px 0; font-size: 24px; font-weight: 700;">Hola, ${user.name.split(' ')[0]} 👋</h1>
    <p style="color: rgba(255,255,255,0.8); margin: 0; font-size: 14px;">${fmtDate(week.from)} — ${fmtDate(week.to)}</p>
  </div>

  <!-- Stats row -->
  <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 24px;">
    <div style="background: white; border-radius: 12px; padding: 16px; text-align: center; border: 1px solid #e2e8f0;">
      <p style="font-size: 26px; font-weight: 700; color: #22c55e; margin: 0;">${completedTasks.length}</p>
      <p style="font-size: 12px; color: #94a3b8; margin: 4px 0 0 0;">Completadas</p>
      ${hasPrev ? `<p style="font-size: 11px; color: ${completedDiff >= 0 ? '#22c55e' : '#ef4444'}; margin: 2px 0 0 0;">${diffSign(completedDiff)} vs semana ant.</p>` : ''}
    </div>
    <div style="background: white; border-radius: 12px; padding: 16px; text-align: center; border: 1px solid #e2e8f0;">
      <p style="font-size: 26px; font-weight: 700; color: #4f46e5; margin: 0;">${fmtMins(totalMinutes)}</p>
      <p style="font-size: 12px; color: #94a3b8; margin: 4px 0 0 0;">Tiempo registrado</p>
      ${hasPrev ? `<p style="font-size: 11px; color: ${minutesDiff >= 0 ? '#22c55e' : '#ef4444'}; margin: 2px 0 0 0;">${diffSign(Math.round(minutesDiff / 60))}h vs semana ant.</p>` : ''}
    </div>
    <div style="background: white; border-radius: 12px; padding: 16px; text-align: center; border: 1px solid #e2e8f0;">
      <p style="font-size: 26px; font-weight: 700; color: ${pendingTasks.length > 5 ? '#f59e0b' : '#334155'}; margin: 0;">${pendingTasks.length}</p>
      <p style="font-size: 12px; color: #94a3b8; margin: 4px 0 0 0;">Pendientes</p>
      <p style="font-size: 11px; color: #94a3b8; margin: 2px 0 0 0;">${workDays.length} día${workDays.length !== 1 ? 's' : ''} trabajado${workDays.length !== 1 ? 's' : ''}</p>
    </div>
  </div>

  <!-- 1. Resumen -->
  <div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 16px; border: 1px solid #e2e8f0;">
    <h2 style="color: #1e293b; font-size: 16px; font-weight: 700; margin: 0 0 12px 0;">📋 Resumen de la semana</h2>
    <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0;">${analysis.resumen}</p>
  </div>

  <!-- 2. Qué pasó realmente -->
  <div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 16px; border: 1px solid #e2e8f0;">
    <h2 style="color: #1e293b; font-size: 16px; font-weight: 700; margin: 0 0 12px 0;">🔍 Qué pasó realmente</h2>
    <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0;">${analysis.quePasoRealmente}</p>
  </div>

  <!-- 3. Insight principal -->
  <div style="background: #eff6ff; border-radius: 12px; padding: 24px; margin-bottom: 16px; border: 1px solid #bfdbfe;">
    <h2 style="color: #1e40af; font-size: 16px; font-weight: 700; margin: 0 0 12px 0;">💡 Insight principal</h2>
    <p style="color: #1e3a8a; font-size: 15px; line-height: 1.7; margin: 0; font-weight: 500;">${analysis.insightPrincipal}</p>
  </div>

  <!-- 4. Riesgos -->
  <div style="background: #fff7ed; border-radius: 12px; padding: 24px; margin-bottom: 16px; border: 1px solid #fed7aa;">
    <h2 style="color: #c2410c; font-size: 16px; font-weight: 700; margin: 0 0 12px 0;">⚠️ Riesgos o alertas</h2>
    <p style="color: #7c2d12; font-size: 14px; line-height: 1.7; margin: 0;">${analysis.riesgos}</p>
  </div>

  <!-- 5. Recomendaciones -->
  <div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 16px; border: 1px solid #e2e8f0;">
    <h2 style="color: #1e293b; font-size: 16px; font-weight: 700; margin: 0 0 16px 0;">✅ Recomendaciones accionables</h2>
    ${recoItems}
  </div>

  <!-- 6. Enfoque próxima semana -->
  <div style="background: #f0fdf4; border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid #bbf7d0;">
    <h2 style="color: #166534; font-size: 16px; font-weight: 700; margin: 0 0 12px 0;">🎯 Enfoque para la próxima semana</h2>
    <p style="color: #14532d; font-size: 14px; line-height: 1.7; margin: 0;">${analysis.enfoqueProximaSemana}</p>
  </div>

  ${byProject.length > 0 ? `
  <!-- Tiempo por proyecto -->
  <div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 16px; border: 1px solid #e2e8f0;">
    <h2 style="color: #1e293b; font-size: 16px; font-weight: 700; margin: 0 0 16px 0;">⏱ Tiempo por proyecto</h2>
    <table style="width: 100%; border-collapse: collapse;">
      ${projectRows}
    </table>
  </div>` : ''}

  ${completedTasks.length > 0 ? `
  <!-- Tareas completadas -->
  <div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 16px; border: 1px solid #e2e8f0;">
    <h2 style="color: #1e293b; font-size: 16px; font-weight: 700; margin: 0 0 16px 0;">✓ Tareas completadas (${completedTasks.length})</h2>
    <ul style="margin: 0; padding: 0; list-style: none;">${completedItems}</ul>
    ${moreCompleted}
  </div>` : ''}

  ${pendingTasks.length > 0 ? `
  <!-- Tareas pendientes -->
  <div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
    <h2 style="color: #1e293b; font-size: 16px; font-weight: 700; margin: 0 0 16px 0;">📌 Tareas pendientes (${pendingTasks.length})</h2>
    <ul style="margin: 0; padding: 0; list-style: none;">${pendingItems}</ul>
    ${morePending}
  </div>` : ''}

  ${analysis.omisionesRol ? `
  <!-- Omisiones de rol -->
  <div style="background: #fffbeb; border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid #fde68a;">
    <h2 style="color: #92400e; font-size: 16px; font-weight: 700; margin: 0 0 12px 0;">🎯 Tareas de rol no registradas</h2>
    <p style="color: #78350f; font-size: 14px; line-height: 1.7; margin: 0;">${analysis.omisionesRol}</p>
  </div>` : ''}

  <!-- Footer -->
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0 0 16px 0;" />
  <p style="color: #cbd5e1; font-size: 12px; text-align: center; margin: 0;">
    BlissTracker · Podés desactivar este resumen en <strong>Preferencias</strong>
  </p>

</div>
</body>
</html>`
}

async function sendWeeklyReportForUser(user) {
  try {
    const [data, roleExpectation, memory] = await Promise.all([
      getWeeklyData(user.id),
      user.role
        ? prisma.roleExpectation.findUnique({ where: { roleName: user.role } })
        : null,
      user.insightMemoryEnabled !== false
        ? prisma.userInsightMemory.findMany({
            where: { userId: user.id, weekStart: { not: '' } },
            orderBy: { weekStart: 'desc' },
            take: 4,
          })
        : null,
    ])

    if (data.workDays.length === 0 && data.completedTasks.length === 0) {
      console.log(`[WeeklyReport] Sin actividad para ${user.name} (${user.email}), omitiendo.`)
      return
    }

    const analysis = await generateAnalysis(user, data, roleExpectation, memory)
    const html     = buildWeeklyEmailHtml(user, data, analysis)

    const weekLabel = `${fmtDate(data.week.from)} – ${fmtDate(data.week.to)}`
    await sendWeeklySummaryEmail(user.email, user.name, html, weekLabel)
    console.log(`[WeeklyReport] Email enviado a ${user.name} (${user.email})`)
  } catch (err) {
    console.error(`[WeeklyReport] Error procesando ${user.email}:`, err.message)
  }
}

async function sendAllWeeklyReports() {
  const users = await prisma.user.findMany({
    where: { active: true, weeklyEmailEnabled: true },
    select: { id: true, name: true, email: true, role: true, insightMemoryEnabled: true },
  })
  console.log(`[WeeklyReport] Enviando a ${users.length} usuario${users.length !== 1 ? 's' : ''}...`)
  for (let i = 0; i < users.length; i++) {
    await sendWeeklyReportForUser(users[i])
    if (i < users.length - 1) {
      await new Promise(r => setTimeout(r, 3000))
    }
  }
  console.log('[WeeklyReport] Proceso finalizado.')
}

module.exports = { sendWeeklyReportForUser, sendAllWeeklyReports }
