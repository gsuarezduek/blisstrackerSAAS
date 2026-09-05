const { DEFAULT_TZ } = require('../../utils/dates')
const { resend, getEmailFrom, emailShell, logEmail } = require('./_shared')

async function sendInvitationEmail(email, inviterName, workspaceName, joinUrl, workspaceId) {
  const from = await getEmailFrom(workspaceId)
  const subject = `${inviterName} te invitó a ${workspaceName} en BlissTracker`
  try {
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject,
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 12px;font-size:20px;">Fuiste invitado a ${workspaceName}</h2>
          <p style="color:#475569;margin:0 0 20px;">
            <strong>${inviterName}</strong> te invitó a unirte al workspace <strong>${workspaceName}</strong> en BlissTracker.
          </p>
          <a href="${joinUrl}"
             style="display:inline-block;background:#E67A1F;color:white;text-decoration:none;
                    padding:12px 24px;border-radius:8px;font-weight:600;margin-bottom:20px;">
            Aceptar invitación
          </a>
          <p style="color:#94a3b8;font-size:14px;margin:0;">Este enlace expira en 7 días. Si no esperabas esta invitación, podés ignorar este correo.</p>
        </div>
      `),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: email, subject, type: 'invitation', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: email, subject, type: 'invitation', status: 'failed', errorMsg: err.message })
    throw err
  }
}

async function sendWorkspaceDeletionWarning(emails, workspaceName, requestedByName, cancelUrl, scheduledAt, workspaceId) {
  const from = await getEmailFrom(workspaceId)
  const date = new Date(scheduledAt).toLocaleString('es-AR', {
    timeZone: DEFAULT_TZ,
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  const subject = `⚠️ ${workspaceName} será eliminado en 48 horas`
  try {
    const { error } = await resend.emails.send({
      from,
      to: emails,
      subject,
      html: emailShell(`
        <div style="margin-top:8px;">
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px 24px;margin-bottom:20px;">
            <h2 style="color:#991b1b;margin:0 0 8px;font-size:18px;">⚠️ Solicitud de eliminación de workspace</h2>
            <p style="color:#b91c1c;margin:0;font-size:14px;">
              <strong>${requestedByName}</strong> solicitó eliminar el workspace <strong>${workspaceName}</strong>.
            </p>
          </div>
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin-bottom:16px;">
            <p style="color:#475569;margin:0 0 12px;">
              Si nadie cancela esta acción, el workspace y <strong>todos sus datos</strong> serán eliminados permanentemente el:
            </p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
              <p style="margin:0;color:#1e293b;font-size:16px;font-weight:600;">${date} (hora de Argentina)</p>
            </div>
            <p style="color:#475569;margin:0 0 20px;">
              Si esto fue un error o querés cancelar la eliminación, hacé clic en el botón de abajo antes de esa fecha.
            </p>
            <a href="${cancelUrl}"
               style="display:inline-block;background:#16a34a;color:white;text-decoration:none;
                      padding:12px 28px;border-radius:8px;font-weight:600;margin-bottom:16px;">
              Cancelar eliminación
            </a>
            <p style="color:#94a3b8;font-size:13px;margin:0;">
              Cualquier administrador del workspace puede cancelar esta acción desde Preferencias → Globales.
            </p>
          </div>
        </div>
      `),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: emails, subject, type: 'deletionWarning', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: emails, subject, type: 'deletionWarning', status: 'failed', errorMsg: err.message })
    throw err
  }
}

/**
 * Notifica al owner y admins del workspace que el pago fue exitoso.
 * @param {string[]} emails
 * @param {string}   workspaceName
 * @param {number}   seats
 * @param {Date|null} periodEnd
 * @param {number}   workspaceId
 */
async function sendPaymentSuccessEmail(emails, workspaceName, seats, periodEnd, workspaceId) {
  const from    = await getEmailFrom(workspaceId)
  const subject = `¡Suscripción activada! — ${workspaceName}`
  const dateStr = periodEnd
    ? new Date(periodEnd).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null
  try {
    const { error } = await resend.emails.send({
      from,
      to: emails,
      subject,
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 12px;font-size:20px;">¡Pago recibido!</h2>
          <p style="color:#475569;margin:0 0 20px;">
            La suscripción de <strong>${workspaceName}</strong> está activa. Gracias por confiar en BlissTracker.
          </p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
            <p style="margin:0 0 6px;color:#166534;font-weight:600;">Plan Pro</p>
            <p style="margin:0 0 4px;color:#166534;font-size:14px;">Seats activos: <strong>${seats}</strong></p>
            ${dateStr ? `<p style="margin:0;color:#166534;font-size:14px;">Próxima facturación: <strong>${dateStr}</strong></p>` : ''}
          </div>
          <p style="color:#94a3b8;font-size:13px;margin:0;">Podés gestionar tu suscripción desde <strong>Facturación</strong> en BlissTracker.</p>
        </div>
      `),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'paymentSuccess', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'paymentSuccess', status: 'failed', errorMsg: err.message })
  }
}

/**
 * Notifica al owner y admins que hubo un fallo de pago.
 * @param {string[]} emails
 * @param {string}   workspaceName
 * @param {number}   workspaceId
 */
async function sendPaymentFailedEmail(emails, workspaceName, workspaceId) {
  const from    = await getEmailFrom(workspaceId)
  const subject = `Problema con el pago — ${workspaceName}`
  try {
    const { error } = await resend.emails.send({
      from,
      to: emails,
      subject,
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#991b1b;margin:0 0 12px;font-size:20px;">Fallo en el pago</h2>
          <p style="color:#475569;margin:0 0 20px;">
            No pudimos procesar el pago de la suscripción de <strong>${workspaceName}</strong>.
            Regularizá tu método de pago para evitar la suspensión del workspace.
          </p>
          <p style="color:#94a3b8;font-size:13px;margin:0;">
            Podés actualizar tu método de pago desde <strong>Facturación → Gestionar suscripción</strong>.
          </p>
        </div>
      `),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'paymentFailed', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'paymentFailed', status: 'failed', errorMsg: err.message })
  }
}

module.exports = { sendInvitationEmail, sendWorkspaceDeletionWarning, sendPaymentSuccessEmail, sendPaymentFailedEmail }
