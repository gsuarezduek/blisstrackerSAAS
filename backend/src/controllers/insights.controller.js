const Anthropic = require('@anthropic-ai/sdk')
const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TZ = 'America/Argentina/Buenos_Aires'
const COOLDOWN_MS = 60 * 60 * 1000 // 1 hora

function fmtMins(m) {
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function calcMins(t) {
  if (t.minutesOverride !== null && t.minutesOverride !== undefined) return t.minutesOverride
  if (!t.startedAt || !t.completedAt) return 0
  return Math.max(0, Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000) - (t.pausedMinutes || 0))
}

function getWeekStart() {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const [y, m, d] = todayStr.split('-').map(Number)
  const today = new Date(y, m - 1, d)
  const dow = today.getDay()
  const daysToMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysToMonday)
  return monday.toISOString().slice(0, 10)
}

const FREQ_LABEL = { daily: 'diaria', weekly: 'semanal', monthly: 'mensual', first_week: 'primera semana del mes' }

function buildRoleContext(roleExpectation) {
  if (!roleExpectation) return ''
  let ctx = ''

  if (roleExpectation.description) {
    ctx += `\nDESCRIPCIÓN DEL ROL: ${roleExpectation.description}\n`
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

function buildMemoryContext(memory) {
  if (!memory) return ''
  let ctx = '\nPERFIL DE PRODUCTIVIDAD (últimas semanas):\n'
  if (memory.tendencias)      ctx += `Tendencias: ${memory.tendencias}\n`
  if (memory.fortalezas)      ctx += `Fortalezas: ${memory.fortalezas}\n`
  if (memory.areasDeAtencion) ctx += `Áreas de atención: ${memory.areasDeAtencion}\n`
  const stats = memory.estadisticas || {}
  if (stats.tasaCompletado !== undefined) {
    ctx += `Estadísticas históricas: tasa de completado ${Math.round(stats.tasaCompletado * 100)}%, `
    ctx += `${stats.promedioTareasPorDia} tareas/día, `
    ctx += `${stats.proyectosSimultaneos} proyectos simultáneos en promedio\n`
  }
  return ctx
}

function buildContext(user, todayTasks, carryOver, completedThisWeek, roleExpectation, memory) {
  const now = new Date()
  const timeStr = now.toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString('es-AR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const all = [...todayTasks, ...carryOver]
  const inProgress    = all.filter(t => t.status === 'IN_PROGRESS')
  const blocked       = all.filter(t => t.status === 'BLOCKED')
  const paused        = all.filter(t => t.status === 'PAUSED')
  const pending       = all.filter(t => t.status === 'PENDING')
  const completedToday = todayTasks.filter(t => t.status === 'COMPLETED')

  const roleCtx   = buildRoleContext(roleExpectation)
  const memoryCtx = buildMemoryContext(memory)
  let ctx = `FECHA: ${dateStr}\nHORA: ${timeStr}\nROL DEL USUARIO: ${user.role}${roleCtx}${memoryCtx}\n`

  if (inProgress.length > 0) {
    ctx += `EN CURSO (${inProgress.length}):\n`
    for (const t of inProgress) {
      const mins = t.startedAt ? Math.round((Date.now() - new Date(t.startedAt)) / 60000) : 0
      ctx += `  - [${t.project.name}] "${t.description}" — en curso hace ${fmtMins(mins)}\n`
    }
    ctx += '\n'
  }

  if (blocked.length > 0) {
    ctx += `BLOQUEADAS (${blocked.length}):\n`
    for (const t of blocked) {
      const legacy = carryOver.find(c => c.id === t.id) ? ' ⚠ días anteriores' : ''
      ctx += `  - [${t.project.name}] "${t.description}"${t.blockedReason ? ` — motivo: "${t.blockedReason}"` : ''}${legacy}\n`
    }
    ctx += '\n'
  }

  if (paused.length > 0) {
    ctx += `PAUSADAS (${paused.length}):\n`
    for (const t of paused) {
      const legacy = carryOver.find(c => c.id === t.id) ? ' (días anteriores)' : ''
      ctx += `  - [${t.project.name}] "${t.description}"${legacy}\n`
    }
    ctx += '\n'
  }

  if (pending.length > 0) {
    ctx += `PENDIENTES (${pending.length}):\n`
    const visible = pending.slice(0, 12)
    for (const t of visible) {
      const legacy = carryOver.find(c => c.id === t.id) ? ' (días anteriores)' : ''
      ctx += `  - [${t.project.name}] "${t.description}"${legacy}\n`
    }
    if (pending.length > 12) ctx += `  ... y ${pending.length - 12} más\n`
    ctx += '\n'
  }

  if (completedToday.length > 0) {
    const todayMins = completedToday.reduce((s, t) => s + calcMins(t), 0)
    ctx += `COMPLETADAS HOY (${completedToday.length}) — ${fmtMins(todayMins)} registrados:\n`
    for (const t of completedToday) {
      ctx += `  - [${t.project.name}] "${t.description}" (${fmtMins(calcMins(t))})\n`
    }
    ctx += '\n'
  }

  if (completedThisWeek.length > 0) {
    const weekMins = completedThisWeek.reduce((s, t) => s + calcMins(t), 0)
    const byProject = {}
    for (const t of completedThisWeek) {
      byProject[t.project.name] = (byProject[t.project.name] || 0) + 1
    }
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

async function generateInsight(userId) {
  const today = todayString()
  const weekStart = getWeekStart()

  const [user, workDay, carryOver, completedThisWeek] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, insightMemoryEnabled: true, taskQualityEnabled: true },
    }),
    prisma.workDay.findUnique({
      where: { userId_date: { userId, date: today } },
      include: {
        tasks: { include: { project: true }, orderBy: { createdAt: 'asc' } },
      },
    }),
    prisma.task.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] },
        workDay: { date: { lt: today } },
      },
      include: { project: true },
    }),
    prisma.task.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        workDay: { date: { gte: weekStart, lte: today } },
      },
      include: { project: true },
    }),
  ])

  // Fetch role expectation y memoria en paralelo
  const [roleExpectation, memory] = await Promise.all([
    user?.role
      ? prisma.roleExpectation.findUnique({ where: { roleName: user.role } })
      : null,
    user?.insightMemoryEnabled !== false
      ? prisma.userInsightMemory.findUnique({ where: { userId } })
      : null,
  ])

  const todayTasks = workDay?.tasks ?? []
  const context = buildContext(user, todayTasks, carryOver, completedThisWeek, roleExpectation, memory)

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
- Los bloqueos de días anteriores son una señal de alarma — indican que algo está trabando el sistema.

Si el contexto incluye DESCRIPCIÓN DEL ROL y TAREAS RECURRENTES DEL ROL, usá esa información para detectar si hay tareas esperadas para esta etapa del mes que no aparecen registradas. Tené en cuenta el día del mes y la frecuencia de cada tarea recurrente. Si detectás una omisión relevante, mencionala en alertaRol.

Si el contexto incluye PERFIL DE PRODUCTIVIDAD, usá esa memoria para personalizar el coaching: hacé referencia a patrones previos del usuario cuando sea relevante. No repitas la memoria textualmente — interpretala.

Analizás los datos reales del usuario y generás un coaching específico, concreto y accionable para su día de trabajo.

Devolvés ÚNICAMENTE un objeto JSON válido (sin markdown, sin bloques de código, sin texto extra antes o después) con exactamente estas claves:
- titulo: string de 3-6 palabras (el foco del coaching de hoy, ej: "Desbloqueá antes de avanzar")
- mensaje: string de 2-4 oraciones directas y específicas basadas en los datos reales. Mencioná proyectos y tareas concretas cuando aporte valor.
- sugerencia: string con UNA acción concreta que puede hacer ahora mismo (o null si no aplica)
- alertaRol: string con una alerta específica basada en las tareas recurrentes del rol y el momento del mes (o null si no hay expectativas configuradas o no hay omisiones detectadas)
- alertaGTD: si hay tareas pendientes o en curso con descripciones vagas (conceptos en lugar de acciones concretas), mencioná máximo 2 con una reformulación sugerida. Formato: "\"Trabajar en web\" → \"Enviar 3 opciones de homepage para aprobación\"". null si todas las descripciones son suficientemente concretas.
- tono: exactamente uno de "warning" | "alert" | "positive" | "neutral"

Escribís en español rioplatense, tono directo y humano. No usás frases genéricas. No felicitás por cosas básicas.`,
    messages: [{ role: 'user', content: context }],
  })

  let text = msg.content[0].text.trim()
  // El modelo a veces envuelve el JSON en bloques de código markdown
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  }
  const parsed = JSON.parse(text)
  return {
    titulo:     String(parsed.titulo || 'Insight del día').slice(0, 100),
    mensaje:    String(parsed.mensaje || ''),
    sugerencia: parsed.sugerencia ? String(parsed.sugerencia) : null,
    alertaRol:  parsed.alertaRol  ? String(parsed.alertaRol)  : null,
    alertaGTD:  (user?.taskQualityEnabled !== false && parsed.alertaGTD)
                  ? String(parsed.alertaGTD) : null,
    tono:       ['warning', 'alert', 'positive', 'neutral'].includes(parsed.tono) ? parsed.tono : 'neutral',
  }
}

async function getDailyInsight(req, res, next) {
  try {
    const userId = req.user.id
    const date   = todayString()

    const existing = await prisma.dailyInsight.findUnique({
      where: { userId_date: { userId, date } },
    })
    if (existing) return res.json(existing)

    const data = await generateInsight(userId)
    const insight = await prisma.dailyInsight.create({
      data: { userId, date, ...data },
    })
    res.json(insight)
  } catch (err) {
    console.error('[DailyInsight] Error:', err.message)
    next(err)
  }
}

async function refreshDailyInsight(req, res, next) {
  try {
    const userId = req.user.id
    const date   = todayString()

    const existing = await prisma.dailyInsight.findUnique({
      where: { userId_date: { userId, date } },
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
      await prisma.dailyInsight.delete({ where: { userId_date: { userId, date } } })
    }

    const data = await generateInsight(userId)
    const insight = await prisma.dailyInsight.create({
      data: { userId, date, ...data },
    })
    res.json(insight)
  } catch (err) {
    console.error('[DailyInsight] Error refresh:', err.message)
    next(err)
  }
}

async function saveFeedback(req, res, next) {
  try {
    const userId = req.user.id
    const date   = todayString()
    const { feedback } = req.body
    if (feedback !== null && !['up', 'down'].includes(feedback)) {
      return res.status(400).json({ error: 'feedback debe ser "up", "down" o null' })
    }
    const insight = await prisma.dailyInsight.update({
      where: { userId_date: { userId, date } },
      data: { feedback },
    })
    res.json(insight)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Insight no encontrado' })
    next(err)
  }
}

module.exports = { getDailyInsight, refreshDailyInsight, saveFeedback }
