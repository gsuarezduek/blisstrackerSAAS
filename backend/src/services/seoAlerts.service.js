// Alertas SEO: compara los snapshots del mes recién cerrado contra el mes anterior
// y avisa por email a los admins/owners cuando hay retrocesos relevantes (tráfico,
// posición, Domain Rating, keywords que salen del top 10). Solo envía si hay alertas
// (cero ruido). Se ejecuta dentro de la cadena mensual MONTHLY_CHAIN el 1° del mes.
const prisma = require('../lib/prisma')
const { MARKETING_PROJECT_WHERE } = require('../lib/projectModules')
const { prevMonthStr, monthLabel } = require('../lib/monthUtils')
const { followLostInWindow } = require('../lib/backlinks')
const { sendSeoAlertEmail } = require('./email.service')
const { DEFAULT_TZ } = require('../utils/dates')

// Umbrales
const CLICKS_DROP_PCT   = 0.30  // caída de clicks ≥30%
const CLICKS_MIN_PREV   = 20    // solo si el mes anterior tenía tráfico relevante
const POSITION_WORSEN   = 3     // la posición media empeoró ≥3 puestos
const POSITION_MIN_IMPR = 100   // solo si había impresiones relevantes
const DR_DROP           = 5     // Domain Rating bajó ≥5
const KW_DROP_MIN       = 2     // ≥2 keywords salieron del top 10
// Enlaces. El umbral de perdidos es 1 a propósito y no un mínimo más alto: un enlace
// conseguido es trabajo que se hizo y se le facturó, así que uno solo ya es algo que el
// equipo tiene que saber. Lo que cambia con el volumen es la GRAVEDAD, no si se avisa.
const BL_LOST_MIN        = 1     // al menos un enlace perdido en el mes
const BL_DOMAINS_DROP    = 0.10  // los dominios de referencia cayeron ≥10%
const BL_DOMAINS_MIN_PREV = 5    // solo si había un perfil con algo de volumen

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Ventana [inicio, fin) de un mes en UTC — el mismo criterio con el que el snapshot
// decide si un `lostAt` cae en el mes (ver backlinkSnapshot.service.js): mezclar husos
// haría que un enlace perdido el 31 a las 22:00 ART cuente en un mes acá y en otro allá.
function monthRange(month) {
  const [y, m] = String(month).split('-').map(Number)
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) }
}

// Calcula las alertas de un proyecto para el mes indicado vs. el anterior.
async function buildProjectAlerts(projectId, month, prevMonth) {
  const alerts = []

  const [cur, prev] = await Promise.all([
    prisma.searchConsoleSnapshot.findUnique({ where: { projectId_month: { projectId, month } } }),
    prisma.searchConsoleSnapshot.findUnique({ where: { projectId_month: { projectId, month: prevMonth } } }),
  ])

  if (cur && prev) {
    if (prev.clicks >= CLICKS_MIN_PREV && cur.clicks < prev.clicks * (1 - CLICKS_DROP_PCT)) {
      const pct = Math.round((1 - cur.clicks / prev.clicks) * 100)
      alerts.push({ type: 'traffic', severity: 'high', message: `Clicks orgánicos −${pct}% (${prev.clicks} → ${cur.clicks})` })
    }
    if (prev.impressions >= POSITION_MIN_IMPR && (cur.avgPosition - prev.avgPosition) >= POSITION_WORSEN) {
      alerts.push({ type: 'position', severity: 'medium', message: `Posición media empeoró (${prev.avgPosition.toFixed(1)} → ${cur.avgPosition.toFixed(1)})` })
    }
    if (prev.domainRating != null && cur.domainRating != null && (prev.domainRating - cur.domainRating) >= DR_DROP) {
      alerts.push({ type: 'dr', severity: 'medium', message: `Domain Rating bajó (${prev.domainRating} → ${cur.domainRating})` })
    }
  }

  // ── Enlaces entrantes ────────────────────────────────────────────
  const [blCur, blPrev] = await Promise.all([
    prisma.backlinkSnapshot.findUnique({ where: { projectId_month: { projectId, month } } }),
    prisma.backlinkSnapshot.findUnique({ where: { projectId_month: { projectId, month: prevMonth } } }),
  ])
  const win = monthRange(month)

  if (blCur) {
    if (blCur.lostLinks >= BL_LOST_MIN) {
      // De los perdidos del mes, cuántos transferían autoridad. No sale del snapshot
      // (que sólo guarda el total) porque perder un dofollow editorial no es lo mismo
      // que perder un enlace de un directorio nofollow, y la gravedad del aviso cambia.
      const dofollowLost = await prisma.backlink.count({
        where: { projectId, linkType: 'follow', lostAt: { gte: win.gte, lt: win.lt } },
      })
      alerts.push({
        type:     'backlinks_lost',
        severity: dofollowLost > 0 ? 'high' : 'medium',
        message:  dofollowLost > 0
          ? `${blCur.lostLinks} enlace(s) entrante(s) perdido(s), ${dofollowLost} de ellos dofollow`
          : `${blCur.lostLinks} enlace(s) entrante(s) perdido(s)`,
      })
    }

    if (blPrev && blPrev.referringDomains >= BL_DOMAINS_MIN_PREV
        && blCur.referringDomains < blPrev.referringDomains * (1 - BL_DOMAINS_DROP)) {
      const pct = Math.round((1 - blCur.referringDomains / blPrev.referringDomains) * 100)
      alerts.push({
        type:     'referring_domains',
        severity: 'medium',
        message:  `Dominios de referencia −${pct}% (${blPrev.referringDomains} → ${blCur.referringDomains})`,
      })
    }
  }

  // Enlaces que pasaron de dofollow a nofollow. Va fuera del `if (blCur)` porque no
  // necesita el snapshot: sale del historial de chequeos, que existe desde la primera
  // corrida del verificador.
  const checks = await prisma.backlinkCheck.findMany({
    // Arranca un mes antes para tener contra qué comparar el primer chequeo del mes.
    where:  { projectId, found: true, createdAt: { gte: monthRange(prevMonth).gte, lt: win.lt } },
    select: { backlinkId: true, linkType: true, found: true, createdAt: true },
  })
  const turnedNofollow = followLostInWindow(checks, win.gte, win.lt)
  if (turnedNofollow > 0) {
    alerts.push({
      type:     'backlink_nofollow',
      severity: 'medium',
      message:  `${turnedNofollow} enlace(s) pasaron de dofollow a nofollow`,
    })
  }

  // Keywords que salieron del top 10
  const [kwCur, kwPrev] = await Promise.all([
    prisma.keywordRanking.findMany({ where: { projectId, month }, select: { trackedKeywordId: true, position: true } }),
    prisma.keywordRanking.findMany({ where: { projectId, month: prevMonth }, select: { trackedKeywordId: true, position: true } }),
  ])
  const prevMap = new Map(kwPrev.map(k => [k.trackedKeywordId, k.position]))
  let dropped = 0
  for (const k of kwCur) {
    const p = prevMap.get(k.trackedKeywordId)
    if (p != null && p > 0 && p <= 10 && (k.position === 0 || k.position > 10)) dropped++
  }
  if (dropped >= KW_DROP_MIN) alerts.push({ type: 'keywords', severity: 'medium', message: `${dropped} keyword(s) salieron del top 10` })

  return alerts
}

// Arma y envía el aviso de un workspace. No-op si no hay alertas ni destinatarios.
async function sendWorkspaceSeoAlerts(workspace, month, prevMonth) {
  const projects = await prisma.project.findMany({
    where:  { workspaceId: workspace.id, ...MARKETING_PROJECT_WHERE },
    select: { id: true, name: true },
  })

  const projectAlerts = []
  for (const p of projects) {
    const alerts = await buildProjectAlerts(p.id, month, prevMonth)
    if (alerts.length) projectAlerts.push({ projectName: p.name, alerts })
  }
  if (projectAlerts.length === 0) return { sent: false, reason: 'sin alertas' }

  const admins = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id, active: true, role: { in: ['admin', 'owner'] } },
    select: { user: { select: { email: true } } },
  })
  const emails = [...new Set(admins.map(a => a.user.email).filter(Boolean))]
  if (emails.length === 0) return { sent: false, reason: 'sin admins' }

  const appUrl = `https://${workspace.slug}.${process.env.APP_DOMAIN || 'blisstracker.app'}/marketing?tab=geo-seo&sub=seo`
  await sendSeoAlertEmail(emails, workspace.name, monthLabel(month), projectAlerts, appUrl, workspace.id)
  return { sent: true, count: projectAlerts.reduce((s, p) => s + p.alerts.length, 0) }
}

// Ejecutado dentro de MONTHLY_CHAIN el 1° del mes: revisa el mes recién cerrado.
async function checkAndSendAllSeoAlerts() {
  const month     = prevMonthStr(currentMonthStr()) // mes recién cerrado
  const prevMonth = prevMonthStr(month)

  const workspaces = await prisma.workspace.findMany({
    where:  { status: { notIn: ['suspended', 'cancelled'] }, seoAlertsEnabled: true },
    select: { id: true, name: true, slug: true },
  })

  let sent = 0
  for (const ws of workspaces) {
    try {
      const r = await sendWorkspaceSeoAlerts(ws, month, prevMonth)
      if (r.sent) sent++
    } catch (err) {
      console.error(`[SeoAlerts] Error en workspace ${ws.id}:`, err.message)
    }
  }
  console.log(`[SeoAlerts] ${sent}/${workspaces.length} workspaces con alertas enviadas (${month}).`)
}

module.exports = { checkAndSendAllSeoAlerts, sendWorkspaceSeoAlerts, buildProjectAlerts }
