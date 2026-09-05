const { resend, getEmailFrom, emailShell, logEmail, escHtml } = require('./_shared')

const LEAVE_TYPE_LABELS = {
  vacaciones: 'Vacaciones',
  estudio:    'Estudio / examen',
  maternidad: 'Maternidad',
  paternidad: 'Paternidad',
  enfermedad: 'Enfermedad / salud',
  duelo:      'Duelo familiar',
  mudanza:    'Mudanza',
  otro:       'Otro',
}

/**
 * Notifica a los admins del workspace que un usuario solicitó días.
 * @param {string[]} adminEmails
 * @param {string}   userName        nombre del solicitante
 * @param {string}   workspaceName
 * @param {object}   request         { startDate, endDate, type, observation }
 * @param {number}   workspaceId
 */
async function sendVacationRequestEmail(adminEmails, userName, workspaceName, request, workspaceId) {
  const from = await getEmailFrom(workspaceId)
  const typeLabel = LEAVE_TYPE_LABELS[request.type] ?? request.type
  const dateRange = request.startDate === request.endDate
    ? request.startDate
    : `${request.startDate} → ${request.endDate}`
  const subject = `📋 Nueva solicitud de licencia de ${userName}`
  try {
    const { error } = await resend.emails.send({
      from,
      to: adminEmails,
      subject,
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 12px;font-size:20px;">📋 Nueva solicitud de licencia</h2>
          <p style="color:#475569;margin:0 0 20px;">
            <strong>${escHtml(userName)}</strong> solicitó días en <strong>${escHtml(workspaceName)}</strong>.
          </p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <tr><td style="padding:8px 0;color:#64748b;font-size:14px;width:120px;">Tipo</td><td style="padding:8px 0;color:#1e293b;font-size:14px;font-weight:600;">${typeLabel}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Fechas</td><td style="padding:8px 0;color:#1e293b;font-size:14px;">${dateRange}</td></tr>
            ${request.observation ? `<tr><td style="padding:8px 0;color:#64748b;font-size:14px;vertical-align:top;">Observación</td><td style="padding:8px 0;color:#1e293b;font-size:14px;">${escHtml(request.observation)}</td></tr>` : ''}
          </table>
          <p style="color:#94a3b8;font-size:13px;margin:0;">Revisá la solicitud en BlissTracker → Administración → RRHH → Vacaciones.</p>
        </div>
      `),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: adminEmails.join(','), subject, type: 'vacationRequest', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: adminEmails.join(','), subject, type: 'vacationRequest', status: 'failed', errorMsg: err.message })
  }
}

/**
 * Notifica al usuario que su solicitud fue revisada.
 * @param {string}  userEmail
 * @param {string}  userName
 * @param {string}  workspaceName
 * @param {object}  request   { startDate, endDate, type, status, reviewNote }
 * @param {number}  workspaceId
 */
async function sendVacationReviewEmail(userEmail, userName, workspaceName, request, workspaceId) {
  const from = await getEmailFrom(workspaceId)
  const approved  = request.status === 'approved'
  const typeLabel = LEAVE_TYPE_LABELS[request.type] ?? request.type
  const dateRange = request.startDate === request.endDate
    ? request.startDate
    : `${request.startDate} → ${request.endDate}`
  const subject = approved
    ? `✅ Tu solicitud de licencia fue aprobada`
    : `❌ Tu solicitud de licencia fue rechazada`
  try {
    const { error } = await resend.emails.send({
      from,
      to: userEmail,
      subject,
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <div style="background:${approved ? '#f0fdf4' : '#fef2f2'};border:1px solid ${approved ? '#bbf7d0' : '#fecaca'};border-radius:10px;padding:16px 20px;margin-bottom:20px;">
            <h2 style="color:${approved ? '#15803d' : '#991b1b'};margin:0;font-size:18px;">
              ${approved ? '✅ Solicitud aprobada' : '❌ Solicitud rechazada'}
            </h2>
          </div>
          <p style="color:#475569;margin:0 0 16px;">Hola <strong>${escHtml(userName)}</strong>, tu solicitud de licencia en <strong>${escHtml(workspaceName)}</strong> fue revisada.</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <tr><td style="padding:8px 0;color:#64748b;font-size:14px;width:120px;">Tipo</td><td style="padding:8px 0;color:#1e293b;font-size:14px;">${typeLabel}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Fechas</td><td style="padding:8px 0;color:#1e293b;font-size:14px;">${dateRange}</td></tr>
            ${request.reviewNote ? `<tr><td style="padding:8px 0;color:#64748b;font-size:14px;vertical-align:top;">Nota</td><td style="padding:8px 0;color:#1e293b;font-size:14px;">${escHtml(request.reviewNote)}</td></tr>` : ''}
          </table>
          <p style="color:#94a3b8;font-size:13px;margin:0;">Podés ver el historial de tus solicitudes en BlissTracker → Tu perfil.</p>
        </div>
      `),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: userEmail, subject, type: 'vacationReview', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: userEmail, subject, type: 'vacationReview', status: 'failed', errorMsg: err.message })
  }
}

// Convierte texto plano (con saltos de línea) a HTML: párrafos por línea en blanco, <br> por salto simple.
function textToHtmlParagraphs(text) {
  return String(text).trim().split(/\n{2,}/).map(block =>
    `<p style="color:#475569;margin:0 0 16px;line-height:1.6;">${escHtml(block).replace(/\n/g, '<br>')}</p>`
  ).join('')
}

/**
 * Email de notificación de tardanza. `template` es el cuerpo editable por el admin
 * (placeholders [Nombre] y [workspace]); acá se interpolan y se formatea a HTML.
 */
async function sendLateNotificationEmail(email, name, workspaceName, template, workspaceId) {
  const from = await getEmailFrom(workspaceId)
  const subject = `Sobre tu horario de ingreso en ${workspaceName}`
  const body = String(template)
    .replace(/\[Nombre\]/g, name || '')
    .replace(/\[workspace\]/g, workspaceName || '')
  try {
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject,
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          ${textToHtmlParagraphs(body)}
        </div>
      `),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: email, subject, type: 'lateNotification', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: email, subject, type: 'lateNotification', status: 'failed', errorMsg: err.message })
    throw err
  }
}

module.exports = { sendVacationRequestEmail, sendVacationReviewEmail, sendLateNotificationEmail }
