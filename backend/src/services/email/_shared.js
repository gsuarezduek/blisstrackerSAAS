const { Resend } = require('resend')
const prisma = require('../../lib/prisma')
const { getSetting } = require('../../lib/platformSettings')

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

module.exports = {
  resend,
  escHtml,
  emailShell,
  getEmailFrom,
  getPlatformFrom,
  logEmail,
  sendPlatformNotification,
  platformCard,
}
