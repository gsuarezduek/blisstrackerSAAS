const { resend, getEmailFrom, emailShell, logEmail } = require('./_shared')

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

// Verificación de cambio de email primario. Se envía al NUEVO correo; el cambio
// solo se aplica cuando el usuario abre el link.
async function sendEmailChangeVerification(newEmail, name, verifyUrl, workspaceId) {
  const from = await getEmailFrom(workspaceId)
  const subject = 'Confirmá tu nuevo email — BlissTracker'
  try {
    const { error } = await resend.emails.send({
      from,
      to: newEmail,
      subject,
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 12px;font-size:20px;">Confirmá tu nuevo email</h2>
          <p style="color:#475569;margin:0 0 24px;">Hola <strong>${name}</strong>, pediste cambiar el email de tu cuenta a esta dirección. Confirmá para aplicar el cambio.</p>
          <a href="${verifyUrl}"
             style="display:inline-block;background:#E67A1F;color:white;text-decoration:none;
                    padding:12px 24px;border-radius:8px;font-weight:600;margin-bottom:24px;">
            Confirmar nuevo email
          </a>
          <p style="color:#94a3b8;font-size:14px;margin:0;">Este enlace expira en 1 hora. Si no solicitaste el cambio, podés ignorar este correo.</p>
        </div>
      `),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: newEmail, subject, type: 'emailChange', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: newEmail, subject, type: 'emailChange', status: 'failed', errorMsg: err.message })
    throw err
  }
}

// Aviso de seguridad al email ANTERIOR cuando el cambio se concretó.
async function sendEmailChangedNotice(oldEmail, name, newEmail, workspaceId) {
  const from = await getEmailFrom(workspaceId)
  const subject = 'Se cambió el email de tu cuenta — BlissTracker'
  try {
    const { error } = await resend.emails.send({
      from,
      to: oldEmail,
      subject,
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 12px;font-size:20px;">Se cambió el email de tu cuenta</h2>
          <p style="color:#475569;margin:0 0 16px;">Hola <strong>${name}</strong>, el email de acceso de tu cuenta se cambió a <strong>${newEmail}</strong>.</p>
          <p style="color:#94a3b8;font-size:14px;margin:0;">Si no fuiste vos, contactá al soporte de inmediato: alguien podría tener acceso a tu cuenta.</p>
        </div>
      `),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: oldEmail, subject, type: 'emailChange', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: oldEmail, subject, type: 'emailChange', status: 'failed', errorMsg: err.message })
    // No relanzamos: es un aviso best-effort, no debe romper el flujo de confirmación.
  }
}

// `slug` es opcional: si se conoce, el botón lleva directo al login del workspace
// (el usuario ya definió su contraseña al registrarse); sin slug cae al login central.
async function sendWelcomeEmail(email, name, workspaceId, slug) {
  const from = await getEmailFrom(workspaceId)
  const domain = process.env.APP_DOMAIN || 'blisstracker.app'
  const loginUrl = slug ? `https://${slug}.${domain}/login` : `${process.env.FRONTEND_URL}/login`
  const subject = 'Bienvenido a BlissTracker'
  try {
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject,
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 12px;font-size:20px;">¡Bienvenido, ${name}!</h2>
          <p style="color:#475569;margin:0 0 20px;">Tu cuenta en BlissTracker ya está lista. Tu email de acceso es:</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
            <p style="margin:0;color:#475569;font-size:14px;"><strong>Email:</strong> ${email}</p>
          </div>
          <a href="${loginUrl}"
             style="display:inline-block;background:#E67A1F;color:white;text-decoration:none;
                    padding:12px 24px;border-radius:8px;font-weight:600;margin-bottom:20px;">
            Ir a mi workspace
          </a>
          <p style="color:#94a3b8;font-size:14px;margin:0;">Ingresá con la contraseña que ya definiste. Si la olvidaste, podés restablecerla desde la pantalla de inicio de sesión.</p>
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

// Verificación del email primario al crear la cuenta (signup). A diferencia de
// sendWelcomeEmail (que asume que hay que volver a iniciar sesión), el owner ya
// quedó logueado automáticamente en su workspace nuevo — este email solo confirma
// la casilla; hasta que no se abra el link, el frontend muestra un banner de aviso.
async function sendVerificationEmail(email, name, verifyUrl, workspaceId) {
  const from = await getEmailFrom(workspaceId)
  const subject = 'Confirmá tu email — BlissTracker'
  try {
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject,
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 12px;font-size:20px;">¡Bienvenido, ${name}!</h2>
          <p style="color:#475569;margin:0 0 20px;">Tu cuenta en BlissTracker ya está lista y podés usarla ahora mismo. Solo falta que confirmes tu email para asegurarte de recibir avisos importantes (facturación, notificaciones, recuperación de contraseña).</p>
          <a href="${verifyUrl}"
             style="display:inline-block;background:#E67A1F;color:white;text-decoration:none;
                    padding:12px 24px;border-radius:8px;font-weight:600;margin-bottom:20px;">
            Confirmar mi email
          </a>
          <p style="color:#94a3b8;font-size:14px;margin:0;">Si no creaste esta cuenta, podés ignorar este correo.</p>
        </div>
      `),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: email, subject, type: 'emailVerification', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: email, subject, type: 'emailVerification', status: 'failed', errorMsg: err.message })
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

module.exports = {
  sendPasswordReset,
  sendEmailChangeVerification,
  sendEmailChangedNotice,
  sendWelcomeEmail,
  sendVerificationEmail,
  sendWeeklySummaryEmail,
}
