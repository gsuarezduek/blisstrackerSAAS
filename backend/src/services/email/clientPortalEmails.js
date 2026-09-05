const { resend, getEmailFrom, emailShell, logEmail, escHtml } = require('./_shared')

// Código OTP para desbloquear "Datos en vivo" en el portal de cliente (sin auth, sin contraseña).
async function sendClientLoginCodeEmail(email, projectName, code, workspaceId) {
  const from = await getEmailFrom(workspaceId)
  const subject = `Tu código de acceso — ${projectName}`
  try {
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject,
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 12px;font-size:20px;">Tu código de acceso</h2>
          <p style="color:#475569;margin:0 0 20px;">Usá este código para ver los datos en vivo de <strong>${projectName}</strong>:</p>
          <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#E67A1F;text-align:center;
                      background:#fff7ed;border-radius:8px;padding:16px;margin-bottom:20px;">
            ${code}
          </div>
          <p style="color:#94a3b8;font-size:14px;margin:0;">Expira en 10 minutos. Si no lo pediste vos, podés ignorar este correo.</p>
        </div>
      `),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: email, subject, type: 'clientPortalLoginCode', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: email, subject, type: 'clientPortalLoginCode', status: 'failed', errorMsg: err.message })
    throw err
  }
}

/**
 * Aviso a la agencia cuando un cliente deja feedback sobre un informe.
 * @param {string[]} emails       destinatarios (admins/owners + miembros del proyecto)
 * @param {object}   payload      { projectName, periodLabel, reportUrl, name, rating, comment, workspaceName }
 * @param {number}   workspaceId
 */
async function sendReportFeedbackEmail(emails, payload, workspaceId) {
  if (!emails || emails.length === 0) return
  const { projectName, periodLabel, reportUrl, name, rating, comment, workspaceName } = payload
  const from = await getEmailFrom(workspaceId)
  const r = Math.max(1, Math.min(5, Number(rating) || 0))
  const stars = '★'.repeat(r) + '☆'.repeat(5 - r)
  const clientName = (name && name.trim()) ? name.trim() : 'Un cliente'
  const subject = `⭐ ${r}/5 — Feedback del informe de ${projectName}`
  try {
    const { error } = await resend.emails.send({
      from,
      to: emails,
      subject,
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 6px;font-size:20px;">Nuevo feedback de un cliente</h2>
          <p style="color:#475569;margin:0 0 18px;">
            <strong>${escHtml(clientName)}</strong> calificó el informe <strong>${escHtml(projectName)}</strong>${periodLabel ? ` · ${escHtml(periodLabel)}` : ''}.
          </p>
          <div style="font-size:26px;letter-spacing:3px;color:#f59e0b;margin:0 0 6px;">${stars}</div>
          <p style="color:#64748b;font-size:14px;margin:0 0 18px;">${r} de 5 estrellas</p>
          ${comment ? `<div style="background:#f8fafc;border-left:3px solid #cbd5e1;border-radius:6px;padding:12px 16px;color:#334155;font-size:14px;line-height:1.6;margin:0 0 20px;">"${escHtml(comment)}"</div>` : '<p style="color:#94a3b8;font-size:13px;margin:0 0 20px;">Sin comentario.</p>'}
          ${reportUrl ? `<a href="${reportUrl}" style="display:inline-block;background:#E67A1F;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;">Ver el informe</a>` : ''}
        </div>
      `),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'reportFeedback', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'reportFeedback', status: 'failed', errorMsg: err.message })
  }
}

/**
 * Aviso al cliente: hay piezas de Contenido esperando su aprobación. Se dispara
 * desde el botón "Pedir aprobación" (content.controller.js requestApproval),
 * UNA VEZ POR CONTACTO (no en batch): `portalUrl` es personal, lleva el
 * magic-token de acceso directo de 72h atado a ese contactId — mandar un solo
 * email a varios destinatarios forzaría a compartir el mismo link entre todos.
 * @param {string} email    email del contacto
 * @param {object} payload  { projectName, portalUrl, pieces: [{title}], workspaceName }
 */
async function sendContentApprovalRequestEmail(email, payload, workspaceId) {
  if (!email) return
  const { projectName, portalUrl, pieces, workspaceName } = payload
  const from = await getEmailFrom(workspaceId)
  const count = pieces?.length || 0
  const subject = `${count} pieza${count === 1 ? '' : 's'} para aprobar — ${projectName}`
  const list = (pieces || []).slice(0, 10).map(p => `
    <li style="color:#334155;font-size:14px;line-height:1.8;">${escHtml(p.title)}</li>
  `).join('')
  try {
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject,
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 12px;font-size:20px;">Tenés contenido para revisar</h2>
          <p style="color:#475569;margin:0 0 16px;">
            ${escHtml(workspaceName || 'Tu agencia')} preparó ${count} pieza${count === 1 ? '' : 's'} de <strong>${escHtml(projectName)}</strong> y está${count === 1 ? '' : 'n'} lista${count === 1 ? '' : 's'} para tu aprobación:
          </p>
          <ul style="margin:0 0 20px;padding-left:20px;">${list}</ul>
          ${portalUrl ? `<a href="${portalUrl}" style="display:inline-block;background:#E67A1F;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;">Revisar y aprobar</a>` : ''}
          ${portalUrl ? `<p style="color:#94a3b8;font-size:12px;margin:16px 0 0;">Este link te deja entrar directo por 72 horas, sin pedirte código. Pasado ese tiempo, o desde cualquier otro momento, entrá como siempre desde el portal con tu email.</p>` : ''}
        </div>
      `),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: email, subject, type: 'contentApprovalRequest', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: email, subject, type: 'contentApprovalRequest', status: 'failed', errorMsg: err.message })
  }
}

/**
 * Aviso al cliente: se publicó un informe nuevo. Se dispara desde
 * monthlyReport.controller.js (notifyReportPublished), a demanda del admin
 * (popup tras publicar) — nunca automático.
 * @param {string[]} emails  contactos activos del portal de cliente del proyecto
 * @param {object}   payload { projectName, periodLabel, portalUrl, workspaceName }
 */
async function sendReportPublishedEmail(emails, payload, workspaceId) {
  if (!emails || emails.length === 0) return
  const { projectName, periodLabel, portalUrl, workspaceName } = payload
  const from = await getEmailFrom(workspaceId)
  const subject = `Nuevo informe disponible — ${projectName}`
  try {
    const { error } = await resend.emails.send({
      from,
      to: emails,
      subject,
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 12px;font-size:20px;">Ya está disponible tu informe</h2>
          <p style="color:#475569;margin:0 0 20px;">
            ${escHtml(workspaceName || 'Tu agencia')} publicó el informe de <strong>${escHtml(projectName)}</strong>${periodLabel ? ` · ${escHtml(periodLabel)}` : ''}.
          </p>
          ${portalUrl ? `<a href="${portalUrl}" style="display:inline-block;background:#E67A1F;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;">Ver informe</a>` : ''}
        </div>
      `),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'reportPublished', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'reportPublished', status: 'failed', errorMsg: err.message })
  }
}

/**
 * Aviso al equipo: un contacto del cliente hizo login por primera vez en el
 * portal. Se dispara desde clientPortal.controller.js (verifyLoginCode),
 * una sola vez por contacto — no por sesión.
 * @param {string[]} emails  admins/owners + miembros del proyecto (getProjectNotifyRecipients)
 * @param {object}   payload { projectName, contactName, contactEmail, projectUrl }
 */
async function sendPortalFirstLoginEmail(emails, payload, workspaceId) {
  if (!emails || emails.length === 0) return
  const { projectName, contactName, contactEmail, projectUrl } = payload
  const from = await getEmailFrom(workspaceId)
  const who = (contactName && contactName.trim()) ? contactName.trim() : (contactEmail || 'Un cliente')
  const subject = `👋 ${who} entró al portal — ${projectName}`
  try {
    const { error } = await resend.emails.send({
      from,
      to: emails,
      subject,
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 6px;font-size:20px;">👋 Nuevo acceso al portal</h2>
          <p style="color:#475569;margin:0 0 20px;">
            <strong>${escHtml(who)}</strong>${contactEmail ? ` (${escHtml(contactEmail)})` : ''} entró por primera vez al portal de <strong>${escHtml(projectName)}</strong>.
          </p>
          ${projectUrl ? `<a href="${projectUrl}" style="display:inline-block;background:#E67A1F;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;">Ver proyecto</a>` : ''}
        </div>
      `),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'portalFirstLogin', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'portalFirstLogin', status: 'failed', errorMsg: err.message })
  }
}

module.exports = {
  sendClientLoginCodeEmail,
  sendReportFeedbackEmail,
  sendContentApprovalRequestEmail,
  sendReportPublishedEmail,
  sendPortalFirstLoginEmail,
}
