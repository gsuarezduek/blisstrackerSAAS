const Anthropic = require('@anthropic-ai/sdk')
const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')
const { parseAIJson } = require('../utils/parseAIJson')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const AI_TIMEOUT_MS = 20000
const { logTokens } = require('../lib/logTokens')
const COOLDOWN_MS = 60 * 60 * 1000

function fmtMins(m) {
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function calcMins(t) {
  if (t.minutesOverride !== null && t.minutesOverride !== undefined) return t.minutesOverride
  if (!t.startedAt || !t.completedAt) return 0
  return Math.max(0, Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000) - (t.pausedMinutes || 0))
}

function getWeekStart(tz) {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const [y, m, d] = todayStr.split('-').map(Number)
  const today = new Date(y, m - 1, d)
  const dow = today.getDay()
  const daysToMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysToMonday)
  return monday.toISOString().slice(0, 10)
}

function dateNDaysAgo(n, tz) {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const [y, m, d] = todayStr.split('-').map(Number)
  const date = new Date(y, m - 1, d - n)
  return date.toISOString().slice(0, 10)
}

function daysBetween(dateA, dateB) {
  return Math.round(Math.abs(new Date(dateA) - new Date(dateB)) / 86400000)
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
  if (roleExpectation.description) ctx += `\nPROPÓSITO DEL ROL: ${roleExpectation.description}\n`

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
  let ctx = '\nPERFIL DE PRODUCTIVIDAD:\n'
  if (latest.tendencias)      ctx += `Tendencias: ${latest.tendencias}\n`
  if (latest.fortalezas)      ctx += `Fortalezas: ${latest.fortalezas}\n`
  if (latest.areasDeAtencion) ctx += `Áreas de atención: ${latest.areasDeAtencion}\n`

  const s = latest.estadisticas || {}
  if (s.tasaCompletado !== undefined) {
    ctx += `Estadísticas: ${Math.round(s.tasaCompletado * 100)}% completado, ${s.promedioTareasPorDia} tareas/día`
    if (s.avgPauseMinutes > 0) ctx += `, ${s.avgPauseMinutes}m pausa prom.`
    if (s.stuckTasksCount > 0) ctx += `, ${s.stuckTasksCount} tareas atascadas`
    ctx += '\n'
  }
  if (s.medianMinutes > 0) {
    const parts = [`mediana ${s.medianMinutes}m/tarea`]
    if (s.quickWins > 0) parts.push(`${s.quickWins} quick wins (<30m)`)
    if (s.deepWork  > 0) parts.push(`${s.deepWork} trabajo profundo (>90m)`)
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
    ctx += 'Evolución:\n'
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

function buildContext(user, todayTasks, carryOver, completedThisWeek, roleExpectation, memory, yesterdayInsight, today, tz) {
  const now = new Date()
  const timeStr = now.toLocaleTimeString('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString('es-AR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const all = [...todayTasks, ...carryOver]
  const inProgress     = all.filter(t => t.status === 'IN_PROGRESS')
  const blocked        = all.filter(t => t.status === 'BLOCKED')
  const paused         = all.filter(t => t.status === 'PAUSED')
  const pending        = all.filter(t => t.status === 'PENDING' && !t.isBacklog)
  const backlog        = all.filter(t => t.status === 'PENDING' && t.isBacklog)
  const completedToday = todayTasks.filter(t => t.status === 'COMPLETED')

  const carryOverIds = new Set(carryOver.map(t => t.id))
  const teamRole = user.teamRole ?? user.role ?? ''
  const roleCtx   = buildRoleContext(roleExpectation)
  const memoryCtx = buildMemoryContext(memory)
  let ctx = `FECHA: ${dateStr}\nHORA: ${timeStr}\nROL DEL USUARIO: ${teamRole}${roleCtx}${memoryCtx}\n`

  if (yesterdayInsight?.sugerencia) {
    ctx += `SUGERENCIA DE AYER: "${yesterdayInsight.sugerencia}"\n`
    ctx += `(Tené en cuenta el estado actual de las tareas para evaluar si fue seguida)\n\n`
  }

  if (inProgress.length > 0) {
    ctx += `EN CURSO (${inProgress.length}):\n`
    for (const t of inProgress) {
      const mins = t.startedAt ? Math.round((Date.now() - new Date(t.startedAt)) / 60000) : 0
      const age = carryOverIds.has(t.id) && t.workDay?.date ? ` ⚠ lleva ${daysBetween(today, t.workDay.date)} día(s) abierta` : ''
      ctx += `  - [${t.project.name}] "${t.description}" — en curso hace ${fmtMins(mins)}${age}\n`
    }
    ctx += '\n'
  }

  if (blocked.length > 0) {
    ctx += `BLOQUEADAS (${blocked.length}):\n`
    for (const t of blocked) {
      const age = carryOverIds.has(t.id) && t.workDay?.date ? ` ⚠ lleva ${daysBetween(today, t.workDay.date)} día(s) bloqueada` : ''
      ctx += `  - [${t.project.name}] "${t.description}"${t.blockedReason ? ` — motivo: "${t.blockedReason}"` : ''}${age}\n`
    }
    ctx += '\n'
  }

  if (paused.length > 0) {
    ctx += `PAUSADAS (${paused.length}):\n`
    for (const t of paused) {
      const age = carryOverIds.has(t.id) && t.workDay?.date ? ` (${daysBetween(today, t.workDay.date)} día(s) sin retomar)` : ''
      ctx += `  - [${t.project.name}] "${t.description}"${age}\n`
    }
    ctx += '\n'
  }

  if (pending.length > 0) {
    ctx += `PENDIENTES HOY (${pending.length}):\n`
    const visible = pending.slice(0, 12)
    for (const t of visible) {
      const age = carryOverIds.has(t.id) && t.workDay?.date ? ` (${daysBetween(today, t.workDay.date)} día(s) sin iniciar)` : ''
      ctx += `  - [${t.project.name}] "${t.description}"${age}\n`
    }
    if (pending.length > 12) ctx += `  ... y ${pending.length - 12} más\n`
    ctx += '\n'
  }

  if (backlog.length > 0) {
    ctx += `BACKLOG (${backlog.length}) — planificación semanal, no son prioridad inmediata:\n`
    const visible = backlog.slice(0, 8)
    for (const t of visible) ctx += `  - [${t.project.name}] "${t.description}"\n`
    if (backlog.length > 8) ctx += `  ... y ${backlog.length - 8} más\n`
    ctx += '\n'
  }

  if (completedToday.length > 0) {
    const todayMins = completedToday.reduce((s, t) => s + calcMins(t), 0)
    ctx += `COMPLETADAS HOY (${completedToday.length}) — ${fmtMins(todayMins)} registrados:\n`
    for (const t of completedToday) ctx += `  - [${t.project.name}] "${t.description}" (${fmtMins(calcMins(t))})\n`
    ctx += '\n'
  }

  if (completedThisWeek.length > 0) {
    const weekMins = completedThisWeek.reduce((s, t) => s + calcMins(t), 0)
    const byProject = {}
    for (const t of completedThisWeek) byProject[t.project.name] = (byProject[t.project.name] || 0) + 1
    const summary = Object.entries(byProject).map(([p, n]) => `${p} (${n})`).join(', ')
    ctx += `SEMANA EN CURSO: ${completedThisWeek.length} tareas completadas, ${fmtMins(weekMins)} registrados\n`
    ctx += `Proyectos: ${summary}\n`
  } else {
    ctx += `SEMANA EN CURSO: sin tareas completadas aún\n`
  }

  const carryOverActive = carryOver.filter(t => t.status !== 'COMPLETED')
  if (carryOverActive.length > 0) {
    ctx += `\nPENDIENTES DE DÍAS ANTERIORES: ${carryOverActive.length} tarea${carryOverActive.length !== 1 ? 's' : ''} sin resolver`
  }

  return ctx.trim()
}

async function generateInsight(userId, workspace, member) {
  const tz = workspace.timezone
  const workspaceId = workspace.id
  const today     = todayString(tz)
  const yesterday = dateNDaysAgo(1, tz)
  const weekStart = getWeekStart(tz)
  const teamRole  = member?.teamRole ?? ''
  const insightMemoryEnabled = member?.insightMemoryEnabled ?? true
  const taskQualityEnabled   = member?.taskQualityEnabled   ?? true

  const [user, workDay, carryOver, completedThisWeek] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    }),
    prisma.workDay.findUnique({
      where: { userId_workspaceId_date: { userId, workspaceId, date: today } },
      include: { tasks: { include: { project: true }, orderBy: { createdAt: 'asc' } } },
    }),
    prisma.task.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] },
        workDay: { date: { lt: today }, workspaceId },
      },
      include: { project: true, workDay: { select: { date: true } } },
    }),
    prisma.task.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        workDay: { date: { gte: weekStart, lte: today }, workspaceId },
      },
      include: { project: true },
    }),
  ])

  const [roleExpectation, memory, yesterdayInsight] = await Promise.all([
    teamRole
      ? prisma.roleExpectation.findUnique({
          where: { workspaceId_roleName: { workspaceId, roleName: teamRole } },
        })
      : null,
    insightMemoryEnabled
      ? prisma.userInsightMemory.findMany({
          where: { userId, workspaceId, weekStart: { not: '' } },
          orderBy: { weekStart: 'desc' },
          take: 4,
        })
      : null,
    prisma.dailyInsight.findUnique({
      where: { userId_workspaceId_date: { userId, workspaceId, date: yesterday } },
      select: { sugerencia: true },
    }),
  ])

  const userWithRole = { ...user, teamRole }
  const todayTasks = workDay?.tasks ?? []
  const context = buildContext(userWithRole, todayTasks, carryOver, completedThisWeek, roleExpectation, memory, yesterdayInsight, today, tz)

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    system: `Sos un coach de productividad que aplica la metodología GTD (Getting Things Done) de David Allen.

Principios clave que siempre aplicás:
- Una tarea debe ser una acción concreta con resultado visible. "Trabajar en X" no es una tarea — "Enviar propuesta a X" sí lo es. Cuando veas tareas vagas, mencionálo.
- Solo puede haber una tarea EN CURSO a la vez. El foco sostenido es la herramienta más poderosa de productividad.
- Los bloqueos sin resolver pudren el sistema — hay que eliminarlos o darles seguimiento activo ese mismo día, no dejarlos acumular.
- Saltar entre muchos proyectos en un mismo día fragmenta la atención y baja la calidad del trabajo.
- Una lista de más de 7-8 pendientes activos es señal de sobrecompromiso — hay que priorizar o delegar.
- Siempre debe haber claridad sobre cuál es la siguiente acción física y concreta.
- Las tareas con "X día(s)" en su etiqueta llevan ese tiempo sin moverse — esto es información crítica. Una tarea bloqueada o pausada hace 5+ días tiene una dinámica completamente diferente a una de ayer.
- El BACKLOG es una herramienta de planificación semanal — es donde el usuario organiza lo que piensa hacer más adelante. Nunca lo trates como trabajo urgente ni sugieras que hay que sacarlo del backlog. Su existencia es positiva, no un problema.

Si el contexto incluye SUGERENCIA DE AYER, evaluá implícitamente si fue seguida mirando el estado actual de las tareas. No hagas mención explícita de "ayer dijiste X", sino que naturalmente continuá el coaching teniendo en cuenta si el consejo funcionó o no.

Si el contexto incluye información del rol (PROPÓSITO DEL ROL, RESULTADOS ESPERADOS, RESPONSABILIDADES OPERATIVAS, TAREAS RECURRENTES DEL ROL), usá todo ese perfil para el alertaRol:
- TAREAS RECURRENTES: cruzá con el día de la semana y el momento del mes para detectar si falta algo esperado para hoy/esta semana.
- RESULTADOS ESPERADOS: si son cuantitativos (ej: "6 Reels por cuenta mensualmente"), considerá si el ritmo de trabajo actual de esta semana es compatible con cumplirlos.
- RESPONSABILIDADES OPERATIVAS: si el usuario lleva varios días sin tareas de una categoría clave de su rol (ej: "Soporte a campañas"), eso puede ser una omisión relevante.
Solo generás alertaRol si hay una omisión concreta y accionable. No generás alertas genéricas ni recordatorios de lo que "debería" hacer sin evidencia en los datos.

Si el contexto incluye PERFIL DE PRODUCTIVIDAD, usá esa memoria para personalizar el coaching. No la repitas textualmente — interpretala.

Analizás los datos reales del usuario y generás un coaching específico, concreto y accionable para su día de trabajo.

Devolvés ÚNICAMENTE un objeto JSON válido (sin markdown, sin bloques de código, sin texto extra antes o después) con exactamente estas claves:
- titulo: string de 3-6 palabras (el foco del coaching de hoy, ej: "Desbloqueá antes de avanzar")
- mensaje: string de 2-4 oraciones directas y específicas basadas en los datos reales. Mencioná proyectos y tareas concretas cuando aporte valor.
- sugerencia: string con UNA acción concreta que puede hacer ahora mismo (o null si no aplica)
- alertaRol: string con una alerta específica basada en las tareas recurrentes del rol y el momento del mes (o null si no hay expectativas configuradas o no hay omisiones detectadas)
- alertaGTD: si hay tareas pendientes o en curso con descripciones vagas (conceptos en lugar de acciones concretas), mencioná máximo 2 con una reformulación sugerida. Formato: "\\"Trabajar en web\\" → \\"Enviar 3 opciones de homepage para aprobación\\"". null si todas las descripciones son suficientemente concretas.
- tono: exactamente uno de "warning" | "alert" | "positive" | "neutral"

Escribís en español rioplatense, tono directo y humano. No usás frases genéricas. No felicitás por cosas básicas.`,
    messages: [{ role: 'user', content: context }],
  }, { timeout: AI_TIMEOUT_MS })
  logTokens('insight', userId, msg.usage, workspaceId)

  let parsed
  try { parsed = parseAIJson(msg.content[0].text) }
  catch { throw Object.assign(new Error('Respuesta de IA inválida. Intentá de nuevo.'), { status: 502 }) }

  return {
    titulo:     String(parsed.titulo || 'Insight del día').slice(0, 100),
    mensaje:    String(parsed.mensaje || ''),
    sugerencia: parsed.sugerencia ? String(parsed.sugerencia) : null,
    alertaRol:  parsed.alertaRol  ? String(parsed.alertaRol)  : null,
    alertaGTD:  (taskQualityEnabled && parsed.alertaGTD) ? String(parsed.alertaGTD) : null,
    tono:       ['warning', 'alert', 'positive', 'neutral'].includes(parsed.tono) ? parsed.tono : 'neutral',
  }
}

async function getDailyInsight(req, res, next) {
  try {
    const userId = req.user.userId
    const workspace = req.workspace
    const member   = req.workspaceMember
    const tz = workspace.timezone
    const date = todayString(tz)

    const existing = await prisma.dailyInsight.findUnique({
      where: { userId_workspaceId_date: { userId, workspaceId: workspace.id, date } },
    })
    if (existing) return res.json(existing)

    const data = await generateInsight(userId, workspace, member)
    let insight
    try {
      insight = await prisma.dailyInsight.create({
        data: { userId, workspaceId: workspace.id, date, ...data },
      })
    } catch (createErr) {
      if (createErr.code === 'P2002') {
        // Condición de carrera o índice legacy (userId, date) todavía presente en DB.
        // Recuperar el registro que ya existe.
        insight = await prisma.dailyInsight.findUnique({
          where: { userId_workspaceId_date: { userId, workspaceId: workspace.id, date } },
        })
        if (!insight) throw createErr
      } else {
        throw createErr
      }
    }
    res.json(insight)
  } catch (err) {
    console.error('[DailyInsight] Error:', err.message)
    if (err.name === 'APIConnectionTimeoutError' || err.code === 'ETIMEDOUT') {
      return next(Object.assign(new Error('El servicio de IA no respondió a tiempo. Intentá de nuevo en unos minutos.'), { status: 503 }))
    }
    next(err)
  }
}

async function refreshDailyInsight(req, res, next) {
  try {
    const userId = req.user.userId
    const workspace = req.workspace
    const member   = req.workspaceMember
    const tz = workspace.timezone
    const date = todayString(tz)

    const existing = await prisma.dailyInsight.findUnique({
      where: { userId_workspaceId_date: { userId, workspaceId: workspace.id, date } },
    })

    if (existing) {
      const age = Date.now() - new Date(existing.updatedAt).getTime()
      if (age < COOLDOWN_MS) {
        const waitMins = Math.ceil((COOLDOWN_MS - age) / 60000)
        return res.status(429).json({
          error: `Podés regenerar en ${waitMins} minuto${waitMins !== 1 ? 's' : ''}`,
          waitMins,
        })
      }
      await prisma.dailyInsight.delete({
        where: { userId_workspaceId_date: { userId, workspaceId: workspace.id, date } },
      })
    }

    const data = await generateInsight(userId, workspace, member)
    let insight
    try {
      insight = await prisma.dailyInsight.create({
        data: { userId, workspaceId: workspace.id, date, ...data },
      })
    } catch (createErr) {
      if (createErr.code === 'P2002') {
        insight = await prisma.dailyInsight.findUnique({
          where: { userId_workspaceId_date: { userId, workspaceId: workspace.id, date } },
        })
        if (!insight) throw createErr
      } else {
        throw createErr
      }
    }
    res.json(insight)
  } catch (err) {
    console.error('[DailyInsight] Error refresh:', err.message)
    next(err)
  }
}

async function saveFeedback(req, res, next) {
  try {
    const userId = req.user.userId
    const workspace = req.workspace
    const tz = workspace.timezone
    const date = todayString(tz)
    const { feedback } = req.body
    if (feedback !== null && !['up', 'down'].includes(feedback)) {
      return res.status(400).json({ error: 'feedback debe ser "up", "down" o null' })
    }
    const insight = await prisma.dailyInsight.update({
      where: { userId_workspaceId_date: { userId, workspaceId: workspace.id, date } },
      data: { feedback },
    })
    res.json(insight)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Insight no encontrado' })
    next(err)
  }
}

module.exports = { getDailyInsight, refreshDailyInsight, saveFeedback }
