// Aviso semanal de Prioridades (Marketing): arma y envía a los admins/owners del
// workspace la lista de proyectos con pendientes de alta prioridad (SEO/GEO,
// objetivos, RRSS, Ads, Informes — ver marketingPending.service.js). Solo envía si
// hay al menos un proyecto con pendientes (cero ruido), mismo criterio que
// productivityDigest.service.js.
const prisma = require('../lib/prisma')
const { computeWorkspacePendingSummary } = require('./marketingPending.service')
const { enabledWorkspaceIds } = require('../lib/featureFlags')
const { sendMarketingDigestEmail } = require('./email.service')
const { DEFAULT_TZ } = require('../utils/dates')

// Calcula los proyectos con pendientes de un workspace (mismos datos que "Prioridades" sin proyecto seleccionado).
async function buildWorkspaceDigest(workspace) {
  const tz = workspace.timezone || DEFAULT_TZ
  const projects = await computeWorkspacePendingSummary({ workspaceId: workspace.id, tz })
  return { projects }
}

// Envía el aviso a los admins/owners de un workspace. No-op si no hay pendientes ni destinatarios.
async function sendWorkspaceDigest(workspace) {
  const digest = await buildWorkspaceDigest(workspace)
  if (digest.projects.length === 0) return { sent: false, reason: 'sin pendientes' }

  const admins = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id, active: true, role: { in: ['admin', 'owner'] } },
    select: { user: { select: { email: true } } },
  })
  const emails = [...new Set(admins.map(a => a.user.email).filter(Boolean))]
  if (emails.length === 0) return { sent: false, reason: 'sin admins' }

  const appUrl = `https://${workspace.slug}.${process.env.APP_DOMAIN || 'blisstracker.app'}/marketing?tab=hoy`
  await sendMarketingDigestEmail(emails, workspace.name, digest, appUrl, workspace.id)
  return { sent: true, count: digest.projects.length, recipients: emails.length }
}

// Envío de prueba bajo demanda: manda el digest al email indicado SIEMPRE (incluso sin
// pendientes, con la variante "todo al día"), para que el admin pueda ver cómo queda el mail.
async function sendTestDigest(workspace, email) {
  const digest = await buildWorkspaceDigest(workspace)
  const appUrl = `https://${workspace.slug}.${process.env.APP_DOMAIN || 'blisstracker.app'}/marketing?tab=hoy`
  await sendMarketingDigestEmail([email], workspace.name, digest, appUrl, workspace.id, { isTest: true })
  return { sent: true, to: email, count: digest.projects.length }
}

// Cron: recorre los workspaces con Marketing habilitado + el digest prendido y envía donde haya pendientes.
async function sendAllMarketingDigests() {
  const enabled = await enabledWorkspaceIds('marketing')
  if (enabled.size === 0) { console.log('[MarketingDigest] Sin workspaces con Marketing habilitado.'); return 0 }

  const workspaces = await prisma.workspace.findMany({
    where: { id: { in: [...enabled] }, status: { in: ['active', 'trialing'] }, marketingDigestEnabled: true },
    select: { id: true, name: true, slug: true, timezone: true },
  })
  let sent = 0
  for (const ws of workspaces) {
    try {
      const r = await sendWorkspaceDigest(ws)
      if (r.sent) { sent++; console.log(`[MarketingDigest] ✓ ${ws.name}: ${r.count} proyecto(s) con pendientes → ${r.recipients} admin(s)`) }
    } catch (err) {
      console.error(`[MarketingDigest] Error en ${ws.name}:`, err.message)
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  console.log(`[MarketingDigest] Completado. ${sent}/${workspaces.length} workspaces con aviso enviado.`)
  return sent
}

module.exports = { buildWorkspaceDigest, sendWorkspaceDigest, sendTestDigest, sendAllMarketingDigests }
