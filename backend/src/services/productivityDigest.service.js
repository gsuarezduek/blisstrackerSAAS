// Aviso semanal de Productividad: arma y envía a los admins/owners del workspace
// la lista de personas en alerta (en baja / inactivas / con atascos) del mes en curso.
// Solo envía si hay al menos una persona en alerta (cero ruido).
const prisma = require('../lib/prisma')
const { getWorkspaceStats, memberStatus } = require('./productivityStats.service')
const { getProductivityPeriod } = require('../lib/timeMetrics')
const { sendProductivityDigestEmail } = require('./email.service')

const STATUS_LABEL = { inactive: 'inactivo', down: '↓ en baja', stuck: 'con atascos' }
const ALERT_ORDER  = { inactive: 0, down: 1, stuck: 2 }
const ALERT = new Set(['inactive', 'down', 'stuck'])

// Calcula las personas en alerta de un workspace (mes en curso, igual que la vista por defecto).
async function buildWorkspaceDigest(workspace) {
  const tz = workspace.timezone || 'America/Argentina/Buenos_Aires'
  const period = getProductivityPeriod('current', tz)

  const [statsMap, members] = await Promise.all([
    getWorkspaceStats(workspace.id, tz, period),
    prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id, active: true },
      select: { teamRole: true, user: { select: { id: true, name: true } } },
    }),
  ])

  const flagged = []
  for (const m of members) {
    const s = statsMap.get(m.user.id)
    if (!s) continue
    const status = memberStatus(s)
    if (!ALERT.has(status)) continue
    flagged.push({
      name: m.user.name,
      role: m.teamRole || '',
      status,
      statusLabel: STATUS_LABEL[status],
      completed: s.current.totalCompleted,
      hours: Math.round(s.current.totalMinutes / 60 * 10) / 10,
      tareasPct: s.delta.tareasPct,
      stuckTasks: s.stuckTasks,
    })
  }
  flagged.sort((a, b) => ALERT_ORDER[a.status] - ALERT_ORDER[b.status])
  return { flagged, period }
}

// Envía el aviso a los admins/owners de un workspace. No-op si no hay alertas ni destinatarios.
async function sendWorkspaceDigest(workspace) {
  const digest = await buildWorkspaceDigest(workspace)
  if (digest.flagged.length === 0) return { sent: false, reason: 'sin alertas' }

  const admins = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id, active: true, role: { in: ['admin', 'owner'] } },
    select: { user: { select: { email: true } } },
  })
  const emails = [...new Set(admins.map(a => a.user.email).filter(Boolean))]
  if (emails.length === 0) return { sent: false, reason: 'sin admins' }

  const appUrl = `https://${workspace.slug}.${process.env.APP_DOMAIN || 'blisstracker.app'}/admin/productivity`
  await sendProductivityDigestEmail(emails, workspace.name, digest, appUrl, workspace.id)
  return { sent: true, count: digest.flagged.length, recipients: emails.length }
}

// Cron: recorre los workspaces activos con el digest habilitado y envía donde haya alertas.
async function sendAllProductivityDigests() {
  const workspaces = await prisma.workspace.findMany({
    where: { status: { in: ['active', 'trialing'] }, productivityDigestEnabled: true },
    select: { id: true, name: true, slug: true, timezone: true },
  })
  let sent = 0
  for (const ws of workspaces) {
    try {
      const r = await sendWorkspaceDigest(ws)
      if (r.sent) { sent++; console.log(`[ProductivityDigest] ✓ ${ws.name}: ${r.count} en alerta → ${r.recipients} admin(s)`) }
    } catch (err) {
      console.error(`[ProductivityDigest] Error en ${ws.name}:`, err.message)
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  console.log(`[ProductivityDigest] Completado. ${sent}/${workspaces.length} workspaces con aviso enviado.`)
  return sent
}

module.exports = { buildWorkspaceDigest, sendWorkspaceDigest, sendAllProductivityDigests }
