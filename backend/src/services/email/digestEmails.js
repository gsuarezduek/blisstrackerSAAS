const { resend, getEmailFrom, emailShell, logEmail, escHtml } = require('./_shared')

// Aviso semanal de Productividad a admins/owners: lista de personas en alerta.
// digest = { flagged: [{ name, role, statusLabel, status, completed, hours, tareasPct, stuckTasks }], period }
async function sendProductivityDigestEmail(emails, workspaceName, digest, appUrl, workspaceId, { isTest = false } = {}) {
  const from = await getEmailFrom(workspaceId)
  const n = digest.flagged.length
  const testTag = isTest ? '[prueba] ' : ''
  const subject = n === 0
    ? `${testTag}📊 Productividad: todo en orden en ${workspaceName}`
    : `${testTag}📊 Productividad: ${n} ${n === 1 ? 'persona necesita' : 'personas necesitan'} atención en ${workspaceName}`

  const STATUS_COLOR = {
    inactive: '#dc2626', down: '#dc2626', stuck: '#d97706',
  }
  const reasonFor = f => {
    if (f.status === 'inactive') return 'Trabajó pero no completó tareas'
    if (f.status === 'stuck')    return `${f.stuckTasks} tarea${f.stuckTasks !== 1 ? 's' : ''} atascada${f.stuckTasks !== 1 ? 's' : ''} (&gt;7 días)`
    const pct = f.tareasPct != null ? ` (${Math.round(f.tareasPct * 100)}%)` : ''
    return `Ritmo en baja${pct}`
  }

  const rows = digest.flagged.map(f => `
    <tr>
      <td style="padding:10px 0;border-top:1px solid #f1f5f9;">
        <span style="color:#1e293b;font-size:14px;font-weight:600;">${f.name}</span>
        ${f.role ? `<span style="color:#94a3b8;font-size:12px;"> · ${f.role}</span>` : ''}
        <br><span style="color:#64748b;font-size:13px;">${reasonFor(f)}</span>
      </td>
      <td style="padding:10px 0;border-top:1px solid #f1f5f9;text-align:right;white-space:nowrap;vertical-align:top;">
        <span style="display:inline-block;background:${STATUS_COLOR[f.status]}1a;color:${STATUS_COLOR[f.status]};font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;">${f.statusLabel}</span>
        <br><span style="color:#94a3b8;font-size:12px;">${f.completed}t · ${f.hours}h</span>
      </td>
    </tr>`).join('')

  const testNote = isTest
    ? `<p style="color:#94a3b8;font-size:12px;margin:0 0 16px;text-align:center;background:#f8fafc;border-radius:8px;padding:8px;">Este es un envío de prueba que pediste desde Preferencias. El aviso automático se manda los lunes y solo cuando hay alguien en alerta.</p>`
    : ''

  const inner = n === 0
    ? `
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 6px;font-size:20px;">📊 Pulso del equipo</h2>
          ${testNote}
          <p style="color:#475569;margin:0 0 20px;font-size:14px;">✅ Esta semana <strong>nadie necesita atención</strong> en <strong>${workspaceName}</strong>. Todo el equipo dentro de lo esperado.</p>
          <div style="text-align:center;margin-top:8px;">
            <a href="${appUrl}" style="display:inline-block;background:#F7931A;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 22px;border-radius:8px;">Ver Productividad</a>
          </div>
        </div>`
    : `
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 6px;font-size:20px;">📊 Pulso del equipo</h2>
          ${testNote}
          <p style="color:#475569;margin:0 0 20px;font-size:14px;">
            <strong>${n}</strong> ${n === 1 ? 'persona necesita' : 'personas necesitan'} tu atención esta semana en <strong>${workspaceName}</strong>.
          </p>
          <table style="width:100%;border-collapse:collapse;">${rows}</table>
          <div style="text-align:center;margin-top:24px;">
            <a href="${appUrl}" style="display:inline-block;background:#F7931A;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 22px;border-radius:8px;">Ver Productividad</a>
          </div>
          <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;text-align:center;">Solo te avisamos cuando hay algo para mirar. Podés desactivar este aviso en Preferencias → Globales.</p>
        </div>`

  try {
    const { error } = await resend.emails.send({
      from,
      to: emails,
      subject,
      html: emailShell(inner),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'productivityDigest', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'productivityDigest', status: 'failed', errorMsg: err.message })
    throw err
  }
}

// Aviso semanal de Prioridades (Marketing) a admins/owners: proyectos con pendientes.
// digest = { projects: [{ projectId, projectName, total, high }] }
async function sendMarketingDigestEmail(emails, workspaceName, digest, appUrl, workspaceId, { isTest = false } = {}) {
  const from = await getEmailFrom(workspaceId)
  const n = digest.projects.length
  const testTag = isTest ? '[prueba] ' : ''
  const subject = n === 0
    ? `${testTag}🎯 Prioridades de Marketing: todo al día en ${workspaceName}`
    : `${testTag}🎯 Prioridades de Marketing: ${n} ${n === 1 ? 'proyecto tiene' : 'proyectos tienen'} pendientes en ${workspaceName}`

  const rows = digest.projects.map(p => `
    <tr>
      <td style="padding:10px 0;border-top:1px solid #f1f5f9;">
        <span style="color:#1e293b;font-size:14px;font-weight:600;">${escHtml(p.projectName)}</span>
      </td>
      <td style="padding:10px 0;border-top:1px solid #f1f5f9;text-align:right;white-space:nowrap;vertical-align:top;">
        ${p.high > 0 ? `<span style="display:inline-block;background:#dc26261a;color:#dc2626;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;">${p.high} alta${p.high === 1 ? '' : 's'}</span>` : ''}
        <br><span style="color:#94a3b8;font-size:12px;">${p.total} pendiente${p.total === 1 ? '' : 's'}</span>
      </td>
    </tr>`).join('')

  const testNote = isTest
    ? `<p style="color:#94a3b8;font-size:12px;margin:0 0 16px;text-align:center;background:#f8fafc;border-radius:8px;padding:8px;">Este es un envío de prueba que pediste desde Preferencias. El aviso automático se manda los lunes y solo cuando hay pendientes.</p>`
    : ''

  const inner = n === 0
    ? `
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 6px;font-size:20px;">🎯 Prioridades de Marketing</h2>
          ${testNote}
          <p style="color:#475569;margin:0 0 20px;font-size:14px;">✅ No hay pendientes de alta prioridad en ningún proyecto de <strong>${escHtml(workspaceName)}</strong> ahora mismo.</p>
          <div style="text-align:center;margin-top:8px;">
            <a href="${appUrl}" style="display:inline-block;background:#F7931A;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 22px;border-radius:8px;">Ver Prioridades</a>
          </div>
        </div>`
    : `
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 6px;font-size:20px;">🎯 Prioridades de Marketing</h2>
          ${testNote}
          <p style="color:#475569;margin:0 0 20px;font-size:14px;">
            <strong>${n}</strong> ${n === 1 ? 'proyecto tiene' : 'proyectos tienen'} recomendaciones pendientes en <strong>${escHtml(workspaceName)}</strong>.
          </p>
          <table style="width:100%;border-collapse:collapse;">${rows}</table>
          <div style="text-align:center;margin-top:24px;">
            <a href="${appUrl}" style="display:inline-block;background:#F7931A;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 22px;border-radius:8px;">Ver Prioridades</a>
          </div>
          <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;text-align:center;">Solo te avisamos cuando hay pendientes de alta prioridad. Podés desactivar este aviso en Preferencias → Globales.</p>
        </div>`

  try {
    const { error } = await resend.emails.send({
      from,
      to: emails,
      subject,
      html: emailShell(inner),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'marketingDigest', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'marketingDigest', status: 'failed', errorMsg: err.message })
    throw err
  }
}

// Alerta SEO mensual: caídas de tráfico/posición/DR/keywords por proyecto.
// projectAlerts = [{ projectName, alerts: [{ type, severity, message }] }]. No-op si vacío.
async function sendSeoAlertEmail(emails, workspaceName, monthLabel, projectAlerts, appUrl, workspaceId) {
  if (!emails?.length || !projectAlerts?.length) return
  const from = await getEmailFrom(workspaceId)
  const total = projectAlerts.reduce((s, p) => s + p.alerts.length, 0)
  const subject = `🚨 SEO: ${total} alerta${total === 1 ? '' : 's'} en ${workspaceName} (${monthLabel})`

  const SEV_COLOR = { high: '#dc2626', medium: '#d97706', low: '#64748b' }
  const blocks = projectAlerts.map(p => `
    <div style="margin:0 0 16px;">
      <p style="color:#1e293b;font-size:14px;font-weight:700;margin:0 0 6px;">${p.projectName}</p>
      ${p.alerts.map(a => `
        <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-top:1px solid #f1f5f9;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${SEV_COLOR[a.severity] || '#64748b'};margin-top:5px;flex-shrink:0;"></span>
          <span style="color:#475569;font-size:13px;">${a.message}</span>
        </div>`).join('')}
    </div>`).join('')

  try {
    const { error } = await resend.emails.send({
      from, to: emails, subject,
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 6px;font-size:20px;">🚨 Alertas SEO — ${monthLabel}</h2>
          <p style="color:#475569;margin:0 0 20px;font-size:14px;">Detectamos ${total} señal${total === 1 ? '' : 'es'} de retroceso en el SEO de <strong>${workspaceName}</strong> respecto al mes anterior.</p>
          ${blocks}
          <div style="text-align:center;margin-top:24px;">
            <a href="${appUrl}" style="display:inline-block;background:#F7931A;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 22px;border-radius:8px;">Ver Marketing → SEO</a>
          </div>
          <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;text-align:center;">Solo te avisamos cuando hay un retroceso relevante. Aviso mensual automático.</p>
        </div>`),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'seoAlert', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'seoAlert', status: 'failed', errorMsg: err.message })
  }
}

module.exports = { sendProductivityDigestEmail, sendMarketingDigestEmail, sendSeoAlertEmail }
