const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')
const { sendSalesReminderEmail } = require('./email.service')

const APP_DOMAIN = process.env.APP_DOMAIN || 'blisstracker.app'

// Workspaces con el módulo Ventas habilitado (flag global o por workspace, respetando opt-out).
async function ventasEnabledWorkspaceIds() {
  const flag = await prisma.featureFlag.findUnique({ where: { key: 'ventas' } })
  if (!flag) return new Set()
  const ids = JSON.parse(flag.enabledWorkspaceIds || '[]')
  const all = await prisma.workspace.findMany({
    where: { status: { in: ['active', 'trialing'] } },
    select: { id: true, disabledFeatureKeys: true },
  })
  const enabled = new Set()
  for (const w of all) {
    const disabled = JSON.parse(w.disabledFeatureKeys || '[]')
    if ((flag.enabledGlobally || ids.includes(w.id)) && !disabled.includes('ventas')) enabled.add(w.id)
  }
  return enabled
}

function fmtDue(d, tz) {
  return new Date(d).toLocaleDateString('es-AR', { timeZone: tz, day: '2-digit', month: 'short' })
}

// Arma, por responsable, las próximas acciones para hoy / vencidas (estado no terminal).
async function buildReminders(workspace) {
  const tz = workspace.timezone
  const todayStr = todayString(tz)

  const actions = await prisma.leadAction.findMany({
    where: { workspaceId: workspace.id, status: 'pending', dueAt: { not: null }, lead: { status: { notIn: ['ganado', 'perdido'] } } },
    select: {
      id: true, title: true, dueAt: true, ownerId: true,
      lead: { select: { id: true, title: true, ownerId: true, company: { select: { name: true } } } },
    },
  })

  // Responsable efectivo = responsable de la acción, o dueño del lead.
  const byOwner = new Map() // ownerId → { today: [], overdue: [] }
  for (const a of actions) {
    const ownerId = a.ownerId || a.lead.ownerId
    if (!ownerId) continue
    const dueStr = a.dueAt.toLocaleDateString('en-CA', { timeZone: tz })
    const bucket = dueStr < todayStr ? 'overdue' : dueStr === todayStr ? 'today' : null
    if (!bucket) continue
    if (!byOwner.has(ownerId)) byOwner.set(ownerId, { today: [], overdue: [] })
    byOwner.get(ownerId)[bucket].push({
      id: a.lead.id,
      company: a.lead.company?.name || a.lead.title || 'Lead',
      actionTitle: a.title,
      due: fmtDue(a.dueAt, tz),
    })
  }
  return byOwner
}

// ¿Ya se le mandó el recordatorio de hoy a este email? (dedup vía EmailLog).
async function alreadySentToday(email, tz) {
  const [y, m, d] = todayString(tz).split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d - 1)) // margen holgado (~1 día) para cubrir husos
  const existing = await prisma.emailLog.findFirst({
    where: { to: email, type: 'salesReminder', status: 'sent', createdAt: { gte: start } },
    select: { id: true },
  })
  return !!existing
}

async function sendWorkspaceReminders(workspace) {
  const byOwner = await buildReminders(workspace)
  if (byOwner.size === 0) return { sent: 0 }
  const appUrl = `https://${workspace.slug}.${APP_DOMAIN}/ventas`

  let sent = 0
  for (const [ownerId, buckets] of byOwner) {
    if (buckets.today.length === 0 && buckets.overdue.length === 0) continue
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: ownerId } },
      select: { active: true, user: { select: { name: true, email: true } } },
    })
    if (!member?.active || !member.user?.email) continue
    if (await alreadySentToday(member.user.email, workspace.timezone)) continue

    try {
      await sendSalesReminderEmail(member.user.email, {
        name: member.user.name, workspaceName: workspace.name,
        today: buckets.today, overdue: buckets.overdue, appUrl,
      }, workspace.id)
      sent++
    } catch (err) {
      console.error(`[SalesReminders] Error enviando a ${member.user.email}:`, err.message)
    }
  }
  return { sent }
}

async function sendAllSalesReminders() {
  const enabled = await ventasEnabledWorkspaceIds()
  if (enabled.size === 0) return 0
  const workspaces = await prisma.workspace.findMany({
    where: { id: { in: [...enabled] } },
    select: { id: true, name: true, slug: true, timezone: true },
  })
  let total = 0
  for (const ws of workspaces) {
    try {
      const r = await sendWorkspaceReminders(ws)
      if (r.sent) { total += r.sent; console.log(`[SalesReminders] ✓ ${ws.name}: ${r.sent} recordatorio(s)`) }
    } catch (err) {
      console.error(`[SalesReminders] Error en ${ws.name}:`, err.message)
    }
    await new Promise(r => setTimeout(r, 500))
  }
  console.log(`[SalesReminders] Completado. ${total} recordatorio(s) enviados.`)
  return total
}

module.exports = { sendAllSalesReminders, sendWorkspaceReminders, buildReminders }
