const { Resend } = require('resend')

const resend = new Resend(process.env.RESEND_API_KEY)

async function sendPasswordReset(email, name, resetUrl) {
  const { error } = await resend.emails.send({
    from: 'BlissTracker <gaston@blissmkt.ar>',
    to: email,
    subject: 'Recuperar contraseña — BlissTracker',
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
}

async function sendWelcomeEmail(email, name) {
  const loginUrl = `${process.env.FRONTEND_URL}/login`
  const forgotUrl = `${process.env.FRONTEND_URL}/forgot-password`

  const { error } = await resend.emails.send({
    from: 'BlissTracker <gaston@blissmkt.ar>',
    to: email,
    subject: 'Bienvenido a BlissTracker',
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
}

async function sendWeeklySummaryEmail(email, name, html, weekLabel) {
  const subject = weekLabel
    ? `Tu semana en BlissTracker — ${weekLabel}`
    : 'Tu resumen semanal — BlissTracker'

  const { error } = await resend.emails.send({
    from: 'BlissTracker <gaston@blissmkt.ar>',
    to: email,
    subject,
    html,
  })

  if (error) throw new Error(error.message)
}

module.exports = { sendPasswordReset, sendWelcomeEmail, sendWeeklySummaryEmail }
