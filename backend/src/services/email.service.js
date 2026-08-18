const { Resend } = require('resend')
const prisma = require('../lib/prisma')
const { getSetting } = require('../lib/platformSettings')
const { DEFAULT_TZ } = require('../utils/dates')

const resend = new Resend(process.env.RESEND_API_KEY)

// URL del logo: apunta al frontend del workspace principal (bliss).
// El archivo /blisstracker_logo.svg está en el public de todos los workspaces.
const APP_DOMAIN  = process.env.APP_DOMAIN  || 'blisstracker.app'
const LOGO_URL    = `https://bliss.${APP_DOMAIN}/blisstracker_logo.svg`
const LOCKUP_URL  = `https://bliss.${APP_DOMAIN}/logo-lockup.svg`

// Escapa HTML de texto libre de usuario antes de insertarlo en un email — evita
// HTML injection en emails que llegan a bandejas de mayor privilegio (admins,
// equipo interno) vía campos como feedback.message, observation, reviewNote.
function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

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
    <img src="${LOCKUP_URL}" alt="BlissTracker" width="220" height="34"
         style="display:inline-block;width:220px;height:34px;" />
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

/**
 * Normaliza un remitente para que siempre lleve nombre de display. Si el valor
 * es un email "pelado" (sin el formato `Nombre <email>`), le antepone
 * "BlissTracker" para que los clientes de correo no muestren el email como nombre.
 */
function normalizeFrom(value) {
  const v = (value || '').trim()
  if (!v) return v
  // Ya trae nombre de display ("Nombre <email>") → respetar tal cual.
  if (v.includes('<')) return v
  // Email pelado → anteponer el nombre por defecto.
  return `BlissTracker <${v}>`
}

/**
 * Remitente global de la plataforma: setting `platformEmailFrom` (editable desde
 * SuperAdmin → Configuración) con fallback a la env var EMAIL_FROM.
 */
async function getPlatformFrom() {
  try {
    const configured = await getSetting('platformEmailFrom')
    if (configured && configured.trim()) return normalizeFrom(configured)
  } catch { /* ignore — caemos al env */ }
  return normalizeFrom(process.env.EMAIL_FROM) || 'BlissTracker <gaston@blissmkt.ar>'
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
    if (first?.emailFrom) return normalizeFrom(first.emailFrom)
  } catch { /* ignore — caemos al remitente global */ }
  return getPlatformFrom()
}

// Mapa evento → toggle de setting que lo habilita.
const PLATFORM_EVENT_TOGGLE = {
  feedback:        'notifyOnFeedback',
  newWorkspace:    'notifyOnNewWorkspace',
  paymentSuccess:  'notifyOnPaymentSuccess',
  paymentFailed:   'notifyOnPaymentFailed',
  cancellation:    'notifyOnCancellation',
  deletionRequest: 'notifyOnDeletionRequest',
  trialExpired:    'notifyOnTrialExpired',
  scrapeError:     'notifyOnScrapeError',
}

/**
 * Envía un aviso interno a la casilla de administración de la plataforma.
 * No-op silencioso si `platformAdminEmail` está vacío o el toggle del evento
 * está apagado. Nunca lanza — los hooks la llaman fire-and-forget.
 *
 * @param {string} event     clave de PLATFORM_EVENT_TOGGLE
 * @param {object} opts      { subject, bodyHtml, workspaceId? }
 */
async function sendPlatformNotification(event, { subject, bodyHtml, workspaceId = null }) {
  try {
    const toggleKey = PLATFORM_EVENT_TOGGLE[event]
    if (toggleKey) {
      const enabled = await getSetting(toggleKey)
      if (!enabled) return
    }

    const raw = (await getSetting('platformAdminEmail')) || ''
    const to = raw.split(',').map(s => s.trim()).filter(Boolean)
    if (!to.length) return // casilla no configurada → sistema apagado

    const from = await getPlatformFrom()
    const { error } = await resend.emails.send({ from, to, subject, html: emailShell(bodyHtml) })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: to.join(', '), subject, type: 'adminAlert', status: 'sent' })
  } catch (err) {
    console.error(`[PlatformNotification:${event}]`, err.message)
    await logEmail({ workspaceId, to: 'admin', subject, type: 'adminAlert', status: 'failed', errorMsg: err.message })
  }
}

/**
 * Tarjeta de detalle reutilizable para los avisos de plataforma.
 * @param {string} title
 * @param {Array<[string,string]>} rows  pares [etiqueta, valor]
 * @param {string} accent  color del borde superior
 */
function platformCard(title, rows, accent = '#E67A1F') {
  const cells = rows
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<tr><td style="padding:8px 0;color:#64748b;font-size:14px;width:140px;vertical-align:top;">${k}</td><td style="padding:8px 0;color:#1e293b;font-size:14px;font-weight:600;">${v}</td></tr>`)
    .join('')
  return `
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:3px solid ${accent};border-radius:12px;padding:24px 28px;margin-top:8px;">
      <h2 style="color:#1e293b;margin:0 0 16px;font-size:18px;">${title}</h2>
      <table style="width:100%;border-collapse:collapse;">${cells}</table>
    </div>`
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

// Recordatorio diario de Ventas: próximas acciones para hoy + vencidas del responsable.
async function sendSalesReminderEmail(email, { name, workspaceName, today = [], overdue = [], appUrl }, workspaceId) {
  const from = await getEmailFrom(workspaceId)
  const nT = today.length, nO = overdue.length
  const subject = nO > 0
    ? `🔔 Ventas: ${nO} acción${nO === 1 ? '' : 'es'} vencida${nO === 1 ? '' : 's'}${nT ? ` · ${nT} para hoy` : ''}`
    : `🔔 Ventas: ${nT} acción${nT === 1 ? '' : 'es'} para hoy`

  const item = (l, overdueRow) => `
    <tr>
      <td style="padding:9px 0;border-top:1px solid #f1f5f9;">
        <a href="${appUrl}?lead=${l.id}" style="color:#1e293b;font-size:14px;font-weight:600;text-decoration:none;">${l.company}</a>
        <br><span style="color:#64748b;font-size:13px;">${l.actionTitle || 'Próxima acción'}</span>
      </td>
      <td style="padding:9px 0;border-top:1px solid #f1f5f9;text-align:right;white-space:nowrap;vertical-align:top;">
        <span style="color:${overdueRow ? '#dc2626' : '#64748b'};font-size:12px;">${l.due}</span>
      </td>
    </tr>`

  const section = (title, rows, color) => rows.length ? `
    <p style="color:${color};font-size:13px;font-weight:600;margin:18px 0 4px;">${title}</p>
    <table style="width:100%;border-collapse:collapse;">${rows.join('')}</table>` : ''

  const inner = `
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
      <h2 style="color:#1e293b;margin:0 0 6px;font-size:20px;">🔔 Tus seguimientos de hoy</h2>
      <p style="color:#475569;margin:0 0 8px;font-size:14px;">Hola ${name || ''}, esto es lo que tenés pendiente en <strong>${workspaceName}</strong>.</p>
      ${section('⚠️ Vencidas', overdue.map(l => item(l, true)), '#dc2626')}
      ${section('📅 Para hoy', today.map(l => item(l, false)), '#0f766e')}
      <div style="text-align:center;margin-top:24px;">
        <a href="${appUrl}" style="display:inline-block;background:#F7931A;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 22px;border-radius:8px;">Ver mis leads</a>
      </div>
    </div>`

  try {
    const { error } = await resend.emails.send({ from, to: email, subject, html: emailShell(inner) })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: email, subject, type: 'salesReminder', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: email, subject, type: 'salesReminder', status: 'failed', errorMsg: err.message })
    throw err
  }
}

// Aviso de "juego de Gamification finalizado" a todo el equipo (con el ganador).
async function sendGameFinishedEmail(emails, workspaceName, game, winner, appUrl, workspaceId) {
  const from = await getEmailFrom(workspaceId)
  const subject = winner
    ? `🏆 ${game.title} — ganó ${winner.label}`
    : `🏁 ${game.title} — finalizó`

  const winnerBlock = winner
    ? `
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:18px 20px;margin:0 0 18px;text-align:center;">
          <p style="margin:0 0 4px;color:#92400e;font-size:13px;font-weight:600;">🏆 GANADOR</p>
          <p style="margin:0;color:#1e293b;font-size:20px;font-weight:700;">${winner.label}</p>
          <p style="margin:4px 0 0;color:#b45309;font-size:13px;">${winner.score} ${game.scoring === 'vote' ? 'votos' : 'puntos'}</p>
        </div>`
    : `<p style="color:#475569;margin:0 0 18px;font-size:14px;">El desafío finalizó sin un ganador con puntaje.</p>`

  const prizeBlock = game.prize
    ? `<p style="color:#475569;margin:0 0 18px;font-size:14px;">🎁 Premio: <strong>${game.prize}</strong></p>`
    : ''

  const inner = `
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
      <h2 style="color:#1e293b;margin:0 0 6px;font-size:20px;">🏆 ${game.title}</h2>
      <p style="color:#94a3b8;font-size:13px;margin:0 0 18px;">${workspaceName}</p>
      ${winnerBlock}
      ${prizeBlock}
      <div style="text-align:center;margin-top:8px;">
        <a href="${appUrl || ''}" style="display:inline-block;background:#F7931A;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 22px;border-radius:8px;">Ver resultados</a>
      </div>
    </div>`

  try {
    const { error } = await resend.emails.send({ from, to: emails, subject, html: emailShell(inner) })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'gameFinished', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'gameFinished', status: 'failed', errorMsg: err.message })
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
 * desde el botón "Pedir aprobación" (content.controller.js requestApproval).
 * @param {string[]} emails  contactos activos con canApprove del portal
 * @param {object}   payload { projectName, portalUrl, pieces: [{title}], workspaceName }
 */
async function sendContentApprovalRequestEmail(emails, payload, workspaceId) {
  if (!emails || emails.length === 0) return
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
      to: emails,
      subject,
      html: emailShell(`
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
          <h2 style="color:#1e293b;margin:0 0 12px;font-size:20px;">Tenés contenido para revisar</h2>
          <p style="color:#475569;margin:0 0 16px;">
            ${escHtml(workspaceName || 'Tu agencia')} preparó ${count} pieza${count === 1 ? '' : 's'} de <strong>${escHtml(projectName)}</strong> y está${count === 1 ? '' : 'n'} lista${count === 1 ? '' : 's'} para tu aprobación:
          </p>
          <ul style="margin:0 0 20px;padding-left:20px;">${list}</ul>
          ${portalUrl ? `<a href="${portalUrl}" style="display:inline-block;background:#E67A1F;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;">Revisar y aprobar</a>` : ''}
        </div>
      `),
    })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'contentApprovalRequest', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'contentApprovalRequest', status: 'failed', errorMsg: err.message })
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

module.exports = {
  sendSeoAlertEmail,
  sendGameFinishedEmail,
  sendReportFeedbackEmail,
  sendReportPublishedEmail,
  sendContentApprovalRequestEmail,
  sendPortalFirstLoginEmail,
  sendClientLoginCodeEmail,
  sendPasswordReset,
  sendEmailChangeVerification,
  sendEmailChangedNotice,
  sendWelcomeEmail,
  sendLateNotificationEmail,
  sendProductivityDigestEmail,
  sendSalesReminderEmail,
  sendWeeklySummaryEmail,
  sendInvitationEmail,
  sendWorkspaceDeletionWarning,
  sendVacationRequestEmail,
  sendVacationReviewEmail,
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendPlatformNotification,
  platformCard,
  emailShell,
  escHtml,
}
