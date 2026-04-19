const { Resend } = require('resend')
const prisma = require('../lib/prisma')

const resend = new Resend(process.env.RESEND_API_KEY)

async function getEmailFrom(workspaceId) {
  try {
    const query = workspaceId
      ? { where: { workspaceId }, orderBy: { id: 'asc' } }
      : { orderBy: { id: 'asc' } }
    const first = await prisma.project.findFirst({
      ...query,
      select: { emailFrom: true },
    })
    return first?.emailFrom || process.env.EMAIL_FROM || 'BlissTracker <gaston@blissmkt.ar>'
  } catch {
    return process.env.EMAIL_FROM || 'BlissTracker <gaston@blissmkt.ar>'
  }
}

async function logEmail({ workspaceId, to, subject, type, status, errorMsg }) {
  try {
    await prisma.emailLog.create({
      data: {
        workspaceId: workspaceId || null,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        type,
        status,
        errorMsg: errorMsg || null,
      },
    })
  } catch (e) {
    console.error('[EmailLog] Error al guardar log:', e.message)
  }
}

async function sendPasswordReset(email, name, resetUrl, workspaceId) {
  const from = await getEmailFrom(workspaceId)
  const subject = 'Recuperar contraseña — BlissTracker'
  try {
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #1e293b; margin-bottom: 8px;">Recuperar contraseña</h2>
          <p style="color: #475569; margin-bottom: 24px;">Hola <strong>${name}</strong>, recibimos una solicitud para restablecer tu contraseña.</p>
          <a href="${resetUrl}"
             style="display: inline-block; background: #4f46e5; color: white; text-decoration: none;
                    padding: 12px 24px; border-radius: 8px; font-weight: 600; margin-bottom: 24px;">
            Cambiar contraseña
          </a>
          <p style="color: #94a3b8; font-size: 14px;">Este enlace expira en 1 hora. Si no solicitaste el cambio, podés ignorar este correo.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #cbd5e1; font-size: 12px;">BlissTracker</p>
        </div>
      `,
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: email, subject, type: 'passwordReset', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: email, subject, type: 'passwordReset', status: 'failed', errorMsg: err.message })
    throw err
  }
}

async function sendWelcomeEmail(email, name, workspaceId) {
  const from = await getEmailFrom(workspaceId)
  const loginUrl = `${process.env.FRONTEND_URL}/login`
  const forgotUrl = `${process.env.FRONTEND_URL}/forgot-password`
  const subject = 'Bienvenido a BlissTracker'
  try {
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #1e293b; margin-bottom: 8px;">¡Bienvenido, ${name}!</h2>
          <p style="color: #475569; margin-bottom: 24px;">Tu cuenta en BlissTracker fue creada. Tu email de acceso es:</p>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
            <p style="margin: 0; color: #475569; font-size: 14px;"><strong>Email:</strong> ${email}</p>
          </div>
          <p style="color: #475569; margin-bottom: 20px;">Para establecer tu contraseña, hacé clic en el botón de abajo:</p>
          <a href="${forgotUrl}"
             style="display: inline-block; background: #4f46e5; color: white; text-decoration: none;
                    padding: 12px 24px; border-radius: 8px; font-weight: 600; margin-bottom: 24px;">
            Establecer mi contraseña
          </a>
          <p style="color: #94a3b8; font-size: 14px;">Una vez que establezcas tu contraseña, podés ingresar desde <a href="${loginUrl}" style="color: #4f46e5;">acá</a>.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #cbd5e1; font-size: 12px;">BlissTracker</p>
        </div>
      `,
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: email, subject, type: 'welcome', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: email, subject, type: 'welcome', status: 'failed', errorMsg: err.message })
    throw err
  }
}

async function sendWeeklySummaryEmail(email, name, html, weekLabel, workspaceId) {
  const from = await getEmailFrom(workspaceId)
  const subject = weekLabel
    ? `Tu semana en BlissTracker — ${weekLabel}`
    : 'Tu resumen semanal — BlissTracker'
  try {
    const { error } = await resend.emails.send({ from, to: email, subject, html })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: email, subject, type: 'weeklySummary', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: email, subject, type: 'weeklySummary', status: 'failed', errorMsg: err.message })
    throw err
  }
}

async function sendTestSettingsEmail(email, name, fromOverride, workspaceId) {
  const from = fromOverride || await getEmailFrom(workspaceId)
  const subject = 'Email de prueba — BlissTracker'
  try {
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #1e293b; margin-bottom: 8px;">✅ Configuración de email correcta</h2>
          <p style="color: #475569; margin-bottom: 16px;">Hola <strong>${name}</strong>, este es un email de prueba para verificar que la configuración del remitente funciona correctamente.</p>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
            <p style="margin: 0; color: #166534; font-size: 14px;"><strong>Remitente configurado:</strong> ${from}</p>
          </div>
          <p style="color: #94a3b8; font-size: 14px;">Si recibiste este email, la configuración DNS y el remitente están funcionando correctamente.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #cbd5e1; font-size: 12px;">BlissTracker</p>
        </div>
      `,
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: email, subject, type: 'testSettings', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: email, subject, type: 'testSettings', status: 'failed', errorMsg: err.message })
    throw err
  }
}

async function sendInvitationEmail(email, inviterName, workspaceName, joinUrl, workspaceId) {
  const from = await getEmailFrom(workspaceId)
  const subject = `${inviterName} te invitó a ${workspaceName} en BlissTracker`
  try {
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #1e293b; margin-bottom: 8px;">Fuiste invitado a ${workspaceName}</h2>
          <p style="color: #475569; margin-bottom: 24px;">
            <strong>${inviterName}</strong> te invitó a unirte al workspace <strong>${workspaceName}</strong> en BlissTracker.
          </p>
          <a href="${joinUrl}"
             style="display: inline-block; background: #f7931a; color: white; text-decoration: none;
                    padding: 12px 24px; border-radius: 8px; font-weight: 600; margin-bottom: 24px;">
            Aceptar invitación
          </a>
          <p style="color: #94a3b8; font-size: 14px;">Este enlace expira en 7 días. Si no esperabas esta invitación, podés ignorar este correo.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #cbd5e1; font-size: 12px;">BlissTracker</p>
        </div>
      `,
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
    timeZone: 'America/Argentina/Buenos_Aires',
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  const subject = `⚠️ ${workspaceName} será eliminado en 48 horas`
  try {
    const { error } = await resend.emails.send({
      from,
      to: emails,
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px;">
            <h2 style="color: #991b1b; margin: 0 0 8px;">⚠️ Solicitud de eliminación de workspace</h2>
            <p style="color: #b91c1c; margin: 0; font-size: 14px;">
              <strong>${requestedByName}</strong> solicitó eliminar el workspace <strong>${workspaceName}</strong>.
            </p>
          </div>

          <p style="color: #475569; margin-bottom: 8px;">
            Si nadie cancela esta acción, el workspace y <strong>todos sus datos</strong> serán eliminados permanentemente el:
          </p>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 20px; margin-bottom: 24px;">
            <p style="margin: 0; color: #1e293b; font-size: 16px; font-weight: 600;">${date} (hora de Argentina)</p>
          </div>

          <p style="color: #475569; margin-bottom: 20px;">
            Si esto fue un error o querés cancelar la eliminación, hacé clic en el botón de abajo antes de esa fecha.
          </p>
          <a href="${cancelUrl}"
             style="display: inline-block; background: #16a34a; color: white; text-decoration: none;
                    padding: 12px 28px; border-radius: 8px; font-weight: 600; margin-bottom: 24px;">
            Cancelar eliminación
          </a>

          <p style="color: #94a3b8; font-size: 13px;">
            Cualquier administrador del workspace puede cancelar esta acción desde Preferencias → Globales.
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #cbd5e1; font-size: 12px;">BlissTracker</p>
        </div>
      `,
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: emails, subject, type: 'deletionWarning', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: emails, subject, type: 'deletionWarning', status: 'failed', errorMsg: err.message })
    throw err
  }
}

module.exports = {
  sendPasswordReset,
  sendWelcomeEmail,
  sendWeeklySummaryEmail,
  sendTestSettingsEmail,
  sendInvitationEmail,
  sendWorkspaceDeletionWarning,
}
