const prisma      = require('../lib/prisma')
const Anthropic   = require('@anthropic-ai/sdk')
const { emailShell, sendMonthlyMarketingReport } = require('./email.service')

const anthropic = new Anthropic()

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function prevMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}

function geoBand(score) {
  if (score >= 86) return 'Excelente'
  if (score >= 68) return 'Bueno'
  if (score >= 36) return 'Base'
  return 'Crítico'
}

/**
 * Genera datos del informe mensual para un proyecto.
 */
async function generateMonthlyReport(project, workspaceId, month) {
  const prevMonth = prevMonthStr(month)

  const [geoAudit, kwRankings, snapshot, prevSnapshot, pageSpeedMobile, pageSpeedDesktop, allKeywords] = await Promise.all([
    prisma.geoAudit.findFirst({
      where:   { projectId: project.id, workspaceId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select:  { score: true, createdAt: true },
    }),
    prisma.keywordRanking.findMany({
      where:  { trackedKeyword: { projectId: project.id, workspaceId }, month, position: { gt: 0 } },
      select: { position: true, keyword: { select: { query: true } } },
    }),
    prisma.analyticsSnapshot.findFirst({
      where:   { projectId: project.id, workspaceId, month },
      orderBy: { createdAt: 'desc' },
      select:  { sessions: true, activeUsers: true },
    }),
    prisma.analyticsSnapshot.findFirst({
      where:   { projectId: project.id, workspaceId, month: prevMonth },
      orderBy: { createdAt: 'desc' },
      select:  { sessions: true },
    }),
    prisma.pageSpeedResult.findFirst({
      where:   { projectId: project.id, workspaceId, strategy: 'mobile', status: 'done' },
      orderBy: { createdAt: 'desc' },
      select:  { performanceScore: true },
    }),
    prisma.pageSpeedResult.findFirst({
      where:   { projectId: project.id, workspaceId, strategy: 'desktop', status: 'done' },
      orderBy: { createdAt: 'desc' },
      select:  { performanceScore: true },
    }),
    // Keywords con rankings del mes actual y anterior para calcular movers
    prisma.trackedKeyword.findMany({
      where:   { projectId: project.id, workspaceId },
      include: {
        rankings: {
          where:   { month: { in: [month, prevMonth] } },
          orderBy: { month: 'desc' },
        },
      },
    }),
  ])

  // Calcular keyword movers
  const movers = allKeywords
    .map(kw => {
      const curr = kw.rankings.find(r => r.month === month)
      const prev = kw.rankings.find(r => r.month === prevMonth)
      if (!curr || !prev || prev.position <= 0 || curr.position <= 0) return null
      return { query: kw.query, delta: parseFloat((prev.position - curr.position).toFixed(1)), currPos: curr.position }
    })
    .filter(Boolean)

  const improved  = movers.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3)
  const declined  = movers.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3)

  const healthData = {
    geo:         geoAudit  ? { score: geoAudit.score, band: geoBand(geoAudit.score) } : null,
    keywords:    kwRankings.length > 0
      ? { avgPosition: parseFloat((kwRankings.reduce((s, r) => s + r.position, 0) / kwRankings.length).toFixed(1)), count: kwRankings.length }
      : null,
    traffic:     snapshot ? {
      sessions:     snapshot.sessions ?? 0,
      prevSessions: prevSnapshot?.sessions ?? null,
      delta:        (prevSnapshot?.sessions && prevSnapshot.sessions > 0)
        ? parseFloat(((snapshot.sessions - prevSnapshot.sessions) / prevSnapshot.sessions * 100).toFixed(1))
        : null,
    } : null,
    performance: (pageSpeedMobile || pageSpeedDesktop) ? {
      mobile:  pageSpeedMobile?.performanceScore  ?? null,
      desktop: pageSpeedDesktop?.performanceScore ?? null,
    } : null,
  }

  // Prompt Claude Haiku
  const dataCtx = JSON.stringify({ month, project: project.name, healthData, improved, declined }, null, 2)
  const message = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Sos un analista de marketing digital. Redactá un resumen ejecutivo en español para el informe mensual del proyecto "${project.name}" (${month}).
Datos disponibles:
${dataCtx}

Respondé SOLO con un JSON con esta estructura:
{
  "resumen": "3 párrafos breves sobre tráfico, posicionamiento y salud técnica",
  "highlights": ["logro 1", "logro 2", "logro 3"],
  "alertas": ["alerta 1 si corresponde"]
}
Si no hay datos suficientes para un área, mencionalo brevemente. Sé conciso y accionable.`,
    }],
  })

  let analysis = { resumen: '', highlights: [], alertas: [] }
  try {
    const raw = message.content[0].text.trim()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) analysis = JSON.parse(jsonMatch[0])
  } catch (err) {
    console.error('[MonthlyReport] Error parseando análisis IA:', err.message)
    analysis.resumen = message.content[0].text.trim()
  }

  return { healthData, keywordMovers: { improved, declined }, analysis }
}

/**
 * Genera el HTML del informe mensual.
 */
function buildMonthlyReportHtml(project, month, data) {
  const { healthData: h, analysis, keywordMovers } = data
  const fmtDelta = d => d == null ? '—' : `${d > 0 ? '+' : ''}${d}%`
  const fmtPos   = p => p == null ? '—' : p.toFixed(1)

  const kpiRows = `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">
        <span style="font-size:20px;">🌐</span>
        <span style="color:#64748b;font-size:13px;margin-left:8px;">Salud GEO</span>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:#1e293b;">
        ${h.geo ? `${h.geo.score}/100 · ${h.geo.band}` : 'Sin datos'}
      </td>
    </tr>
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">
        <span style="font-size:20px;">🔑</span>
        <span style="color:#64748b;font-size:13px;margin-left:8px;">Posicionamiento</span>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:#1e293b;">
        ${h.keywords ? `Pos. promedio ${fmtPos(h.keywords.avgPosition)} · ${h.keywords.count} kw` : 'Sin datos'}
      </td>
    </tr>
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">
        <span style="font-size:20px;">📈</span>
        <span style="color:#64748b;font-size:13px;margin-left:8px;">Tráfico</span>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:#1e293b;">
        ${h.traffic ? `${h.traffic.sessions.toLocaleString('es-AR')} sesiones · ${fmtDelta(h.traffic.delta)} vs mes ant.` : 'Sin datos'}
      </td>
    </tr>
    <tr>
      <td style="padding:12px 16px;">
        <span style="font-size:20px;">⚡</span>
        <span style="color:#64748b;font-size:13px;margin-left:8px;">Performance</span>
      </td>
      <td style="padding:12px 16px;text-align:right;font-weight:600;color:#1e293b;">
        ${h.performance ? `Móvil ${h.performance.mobile ?? '—'} · Desktop ${h.performance.desktop ?? '—'}` : 'Sin datos'}
      </td>
    </tr>
  `

  const highlightsHtml = analysis.highlights.length
    ? `<ul style="margin:0;padding-left:20px;color:#475569;font-size:14px;">
        ${analysis.highlights.map(hl => `<li style="margin-bottom:6px;">${hl}</li>`).join('')}
      </ul>`
    : ''

  const alertasHtml = analysis.alertas.length
    ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px 16px;margin-top:16px;">
        <p style="color:#c2410c;font-weight:600;margin:0 0 8px;font-size:14px;">⚠ Alertas</p>
        <ul style="margin:0;padding-left:20px;color:#9a3412;font-size:13px;">
          ${analysis.alertas.map(a => `<li style="margin-bottom:4px;">${a}</li>`).join('')}
        </ul>
      </div>`
    : ''

  const moversHtml = (keywordMovers.improved.length || keywordMovers.declined.length)
    ? `<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-top:20px;">
        <p style="color:#1e293b;font-weight:600;margin:0 0 12px;font-size:15px;">📊 Movimiento de keywords</p>
        ${keywordMovers.improved.length ? `
          <p style="color:#166534;font-size:13px;font-weight:600;margin:0 0 6px;">⬆ Mejoraron</p>
          <ul style="margin:0 0 12px;padding-left:20px;color:#15803d;font-size:13px;">
            ${keywordMovers.improved.map(m => `<li>${m.query} — pos. ${m.currPos.toFixed(1)} (+${m.delta})</li>`).join('')}
          </ul>` : ''}
        ${keywordMovers.declined.length ? `
          <p style="color:#991b1b;font-size:13px;font-weight:600;margin:0 0 6px;">⬇ Bajaron</p>
          <ul style="margin:0;padding-left:20px;color:#dc2626;font-size:13px;">
            ${keywordMovers.declined.map(m => `<li>${m.query} — pos. ${m.currPos.toFixed(1)} (${m.delta})</li>`).join('')}
          </ul>` : ''}
      </div>`
    : ''

  const body = `
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-top:8px;">
      <h2 style="color:#1e293b;margin:0 0 4px;font-size:20px;">Informe de Marketing</h2>
      <p style="color:#94a3b8;margin:0 0 20px;font-size:13px;">${project.name} · ${month}</p>

      <table style="width:100%;border-collapse:collapse;border:1px solid #f1f5f9;border-radius:8px;overflow:hidden;">
        ${kpiRows}
      </table>

      ${analysis.resumen ? `
      <div style="margin-top:20px;">
        <p style="color:#1e293b;font-weight:600;margin:0 0 8px;font-size:15px;">📝 Resumen ejecutivo</p>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0;">${analysis.resumen.replace(/\n/g, '<br>')}</p>
      </div>` : ''}

      ${highlightsHtml ? `
      <div style="margin-top:16px;">
        <p style="color:#1e293b;font-weight:600;margin:0 0 8px;font-size:15px;">✅ Highlights</p>
        ${highlightsHtml}
      </div>` : ''}

      ${alertasHtml}
    </div>
    ${moversHtml}
  `

  return emailShell(body)
}

/**
 * Envía informes mensuales a todos los proyectos con integraciones activas.
 */
async function sendAllMonthlyMarketingReports() {
  const month = prevMonthStr(currentMonthStr()) // informe del mes que acaba de terminar

  // Proyectos con al menos una integración GA4 o GSC activa
  const integrations = await prisma.projectIntegration.findMany({
    where: {
      type:   { in: ['google_analytics', 'google_search_console'] },
      status: 'active',
    },
    select: { projectId: true, project: { select: { name: true, workspaceId: true } } },
    distinct: ['projectId'],
  })

  console.log(`[MonthlyReport] Enviando informes para ${integrations.length} proyectos (mes: ${month})`)

  for (const intg of integrations) {
    try {
      const project     = { id: intg.projectId, name: intg.project.name }
      const workspaceId = intg.project.workspaceId

      // Obtener admins/owners del workspace
      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId, role: { in: ['owner', 'admin'] }, active: true },
        select: { user: { select: { email: true, name: true } } },
      })
      const emails = members.map(m => m.user.email).filter(Boolean)
      if (!emails.length) continue

      const data = await generateMonthlyReport(project, workspaceId, month)
      const html = buildMonthlyReportHtml(project, month, data)
      await sendMonthlyMarketingReport(emails, project.name, month, html, workspaceId)
      console.log(`[MonthlyReport] Enviado para proyecto ${project.id} a ${emails.length} destinatario(s)`)
      await new Promise(r => setTimeout(r, 2000))
    } catch (err) {
      console.error(`[MonthlyReport] Error en proyecto ${intg.projectId}:`, err.message)
    }
  }
}

module.exports = { sendAllMonthlyMarketingReports, generateMonthlyReport }
