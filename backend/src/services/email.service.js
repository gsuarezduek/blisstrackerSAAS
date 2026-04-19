const { Resend } = require('resend')
const prisma = require('../lib/prisma')

const resend = new Resend(process.env.RESEND_API_KEY)

// URL del logo: apunta al frontend del workspace principal (bliss).
// El archivo /blisstracker_logo.svg está en el public de todos los workspaces.
const APP_DOMAIN  = process.env.APP_DOMAIN  || 'blisstracker.app'
const LOGO_URL    = `https://bliss.${APP_DOMAIN}/blisstracker_logo.svg`
const LOCKUP_URL  = `https://bliss.${APP_DOMAIN}/logo-lockup.svg`

// Header y footer compartidos por todos los emails transaccionales.
// El lockup SVG incluye ícono + wordmark, ideal para el encabezado.
function emailShell(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:24px 16px;">

  <!-- Logo header -->
  <div style="text-align:center;padding:24px 0 8px;">
    <img src="${LOCKUP_URL}" alt="BlissTracker" width="200" height="54"
         style="display:inline-block;height:54px;width:auto;max-width:200px;" />
  </div>

  <!-- Contenido -->
  ${bodyHtml}

  <!-- Footer -->
  <div style="text-align:center;padding:20px 0 8px;border-top:1px solid #e2e8f0;margin-top:24px;">
    <img src="${LOGO_URL}" alt="" width="20" height="20"
         style="display:inline-block;vertical-align:middle;margin-right:6px;opacity:0.6;" />
    <span style="color:#cbd5e1;font-size:12px;vertical-align:middle;">BlissTracker</span>
  </div>

</div>
</body>
</html>`
}

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
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 12px;font-size:20px;">Recuperar contraseña</h2>
          <p style="color:#475569;margin:0 0 24px;">Hola <strong>${name}</strong>, recibimos una solicitud para restablecer tu contraseña.</p>
          <a href="${resetUrl}"
             style="display:inline-block;background:#E67A1F;color:white;text-decoration:none;
                    padding:12px 24px;border-radius:8px;font-weight:600;margin-bottom:24px;">
            Cambiar contraseña
          </a>
          <p style="color:#94a3b8;font-size:14px;margin:0;">Este enlace expira en 1 hora. Si no solicitaste el cambio, podés ignorar este correo.</p>
        </div>
      `),
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
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 12px;font-size:20px;">¡Bienvenido, ${name}!</h2>
          <p style="color:#475569;margin:0 0 20px;">Tu cuenta en BlissTracker fue creada. Tu email de acceso es:</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
            <p style="margin:0;color:#475569;font-size:14px;"><strong>Email:</strong> ${email}</p>
          </div>
          <p style="color:#475569;margin:0 0 20px;">Para establecer tu contraseña, hacé clic en el botón de abajo:</p>
          <a href="${forgotUrl}"
             style="display:inline-block;background:#E67A1F;color:white;text-decoration:none;
                    padding:12px 24px;border-radius:8px;font-weight:600;margin-bottom:20px;">
            Establecer mi contraseña
          </a>
          <p style="color:#94a3b8;font-size:14px;margin:0;">Una vez que establezcas tu contraseña, podés ingresar desde <a href="${loginUrl}" style="color:#E67A1F;">acá</a>.</p>
        </div>
      `),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: email, subject, type: 'welcome', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: email, subject, type: 'welcome', status: 'failed', errorMsg: err.message })
    throw err
  }
}

async function sendWeeklySummaryEmail(email, name, html, weekLabel, workspaceId, workspaceName) {
  const from = await getEmailFrom(workspaceId)
  const wsLabel = workspaceName || 'BlissTracker'
  const subject = weekLabel
    ? `Tu semana en ${wsLabel} — ${weekLabel}`
    : `Tu resumen semanal — ${wsLabel}`
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
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 12px;font-size:20px;">✅ Configuración de email correcta</h2>
          <p style="color:#475569;margin:0 0 16px;">Hola <strong>${name}</strong>, este es un email de prueba para verificar que la configuración del remitente funciona correctamente.</p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
            <p style="margin:0;color:#166534;font-size:14px;"><strong>Remitente configurado:</strong> ${from}</p>
          </div>
          <p style="color:#94a3b8;font-size:14px;margin:0;">Si recibiste este email, la configuración DNS y el remitente están funcionando correctamente.</p>
        </div>
      `),
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

module.exports = {
  sendPasswordReset,
  sendWelcomeEmail,
  sendWeeklySummaryEmail,
  sendTestSettingsEmail,
  sendInvitationEmail,
  sendWorkspaceDeletionWarning,
}
