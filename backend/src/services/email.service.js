const { Resend } = require('resend')

const resend = new Resend(process.env.RESEND_API_KEY)

async function sendPasswordReset(email, name, resetUrl) {
  const { error } = await resend.emails.send({
    from: 'Bliss Team Tracker <gaston@blissmkt.ar>',
    to: email,
    subject: 'Recuperar contraseña — Bliss Team Tracker',
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
        <p style="color: #cbd5e1; font-size: 12px;">Bliss Team Tracker</p>
      </div>
    `,
  })

  if (error) throw new Error(error.message)
}

async function sendWelcomeEmail(email, name, password) {
  const loginUrl = `${process.env.FRONTEND_URL}/login`

  const { error } = await resend.emails.send({
    from: 'Bliss Team Tracker <gaston@blissmkt.ar>',
    to: email,
    subject: 'Bienvenido a Bliss Team Tracker',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1e293b; margin-bottom: 8px;">¡Bienvenido, ${name}!</h2>
        <p style="color: #475569; margin-bottom: 24px;">Tu cuenta en Bliss Team Tracker fue creada. Estos son tus datos de acceso:</p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px 0; color: #475569; font-size: 14px;"><strong>Email:</strong> ${email}</p>
          <p style="margin: 0; color: #475569; font-size: 14px;"><strong>Contraseña:</strong> ${password}</p>
        </div>
        <a href="${loginUrl}"
           style="display: inline-block; background: #4f46e5; color: white; text-decoration: none;
                  padding: 12px 24px; border-radius: 8px; font-weight: 600; margin-bottom: 24px;">
          Ingresar al sistema
        </a>
        <p style="color: #94a3b8; font-size: 14px;">Te recomendamos cambiar tu contraseña después del primer ingreso.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #cbd5e1; font-size: 12px;">Bliss Team Tracker</p>
      </div>
    `,
  })

  if (error) throw new Error(error.message)
}

module.exports = { sendPasswordReset, sendWelcomeEmail }
