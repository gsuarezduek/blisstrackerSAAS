const { Resend } = require('resend')
const prisma = require('../lib/prisma')
const { getSetting } = require('../lib/platformSettings')

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
            <strong>${userName}</strong> solicitó días en <strong>${workspaceName}</strong>.
          </p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <tr><td style="padding:8px 0;color:#64748b;font-size:14px;width:120px;">Tipo</td><td style="padding:8px 0;color:#1e293b;font-size:14px;font-weight:600;">${typeLabel}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Fechas</td><td style="padding:8px 0;color:#1e293b;font-size:14px;">${dateRange}</td></tr>
            ${request.observation ? `<tr><td style="padding:8px 0;color:#64748b;font-size:14px;vertical-align:top;">Observación</td><td style="padding:8px 0;color:#1e293b;font-size:14px;">${request.observation}</td></tr>` : ''}
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
          <p style="color:#475569;margin:0 0 16px;">Hola <strong>${userName}</strong>, tu solicitud de licencia en <strong>${workspaceName}</strong> fue revisada.</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <tr><td style="padding:8px 0;color:#64748b;font-size:14px;width:120px;">Tipo</td><td style="padding:8px 0;color:#1e293b;font-size:14px;">${typeLabel}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Fechas</td><td style="padding:8px 0;color:#1e293b;font-size:14px;">${dateRange}</td></tr>
            ${request.reviewNote ? `<tr><td style="padding:8px 0;color:#64748b;font-size:14px;vertical-align:top;">Nota</td><td style="padding:8px 0;color:#1e293b;font-size:14px;">${request.reviewNote}</td></tr>` : ''}
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
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return String(text).trim().split(/\n{2,}/).map(block =>
    `<p style="color:#475569;margin:0 0 16px;line-height:1.6;">${esc(block).replace(/\n/g, '<br>')}</p>`
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

module.exports = {
  sendGameFinishedEmail,
  sendPasswordReset,
  sendEmailChangeVerification,
  sendEmailChangedNotice,
  sendWelcomeEmail,
  sendLateNotificationEmail,
  sendProductivityDigestEmail,
  sendWeeklySummaryEmail,
  sendTestSettingsEmail,
  sendInvitationEmail,
  sendWorkspaceDeletionWarning,
  sendVacationRequestEmail,
  sendVacationReviewEmail,
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendPlatformNotification,
  platformCard,
  emailShell,
}
