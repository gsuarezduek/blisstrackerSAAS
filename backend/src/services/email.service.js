const nodemailer = require('nodemailer')
const { resolve4 } = require('dns').promises

const SMTP_HOST = 'smtp.hostinger.com'

async function sendPasswordReset(email, name, resetUrl) {
  // Resolver manualmente a IPv4 para evitar que Railway use IPv6
  let host = SMTP_HOST
  try {
    const [ip] = await resolve4(SMTP_HOST)
    host = ip
    console.log(`[email] Resolvió ${SMTP_HOST} → ${ip}`)
  } catch (e) {
    console.warn('[email] No pudo resolver IPv4, usando hostname:', e.message)
  }

  const transporter = nodemailer.createTransport({
    host,
    port: 465,
    secure: true,
    tls: { servername: SMTP_HOST }, // valida el certificado con el hostname real
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })

  await transporter.sendMail({
    from: `"Bliss Team Tracker" <${process.env.SMTP_USER}>`,
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
}

module.exports = { sendPasswordReset }
