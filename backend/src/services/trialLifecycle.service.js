/**
 * Email lifecycle del trial.
 *
 * Cron diario que busca workspaces en `trialing` y manda 4 emails escalonados
 * en días 3, 7, 12, 13 del trial. Cada uno tiene su propósito:
 *   - Día  3: check-in suave ("¿qué tal?")
 *   - Día  7: progreso + reminder de features no exploradas
 *   - Día 12: primera urgencia (quedan 2 días)
 *   - Día 13: último día (CTA fuerte a /pricing)
 *
 * Lógica:
 *   - workspaces con `status='trialing'` y sin `deletionRequest`
 *   - calcular días desde createdAt
 *   - elegir email correspondiente y enviar al owner
 *   - dedupe via EmailLog: no enviar 2 veces el mismo type al mismo email
 *
 * Trigger: cron diario en index.js a las 09:00 ART (12:00 UTC).
 */
const prisma = require('../lib/prisma')

const resend = (() => {
  try {
    const { Resend } = require('resend')
    return new Resend(process.env.RESEND_API_KEY)
  } catch { return null }
})()

const FROM_FALLBACK = process.env.EMAIL_FROM || 'BlissTracker <noreply@blisstracker.app>'
const APP_URL = process.env.FRONTEND_URL || 'https://blisstracker.app'

function shell(bodyHtml) {
  return `
    <!doctype html>
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
    <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1e293b;">
      <div style="max-width:560px;margin:0 auto;">
        <div style="text-align:center;padding:16px 0;">
          <span style="font-size:20px;font-weight:700;color:#E67A1F;">BlissTracker</span>
        </div>
        ${bodyHtml}
        <p style="text-align:center;color:#94a3b8;font-size:12px;margin:24px 0 0;">
          Recibís este email porque tu workspace está en trial.
          Si tenés alguna duda, respondé a este mensaje — Gastón lee personalmente.
        </p>
      </div>
    </body></html>
  `
}

async function logEmail(data) {
  await prisma.emailLog.create({ data }).catch(() => {})
}

async function alreadySent(workspaceId, type) {
  const log = await prisma.emailLog.findFirst({
    where:  { workspaceId, type, status: 'sent' },
    select: { id: true },
  })
  return !!log
}

async function sendOne({ to, subject, type, html, workspaceId }) {
  if (!resend) {
    console.warn(`[trialLifecycle] Resend no inicializado, skip "${type}" a ${to}`)
    return
  }
  if (await alreadySent(workspaceId, type)) return // dedupe

  try {
    const { error } = await resend.emails.send({ from: FROM_FALLBACK, to, subject, html })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to, subject, type, status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to, subject, type, status: 'failed', errorMsg: err.message })
    console.error(`[trialLifecycle] Error enviando "${type}" a ${to}:`, err.message)
  }
}

// ─── Templates ───────────────────────────────────────────────────────────────

function tplDay3({ name }) {
  return shell(`
    <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;">
      <h2 style="margin:0 0 12px;font-size:20px;">¿Cómo va, ${name}?</h2>
      <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
        Pasaron tres días desde que creaste tu workspace en BlissTracker.
        Quería preguntarte directamente: <strong>¿qué te parece hasta ahora?</strong>
      </p>
      <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
        Si te trabaste con algo, o no encontraste lo que esperabas, respondeme este email.
        Leo todo personalmente y arreglo cosas rápido cuando son importantes.
      </p>
      <p style="color:#475569;line-height:1.6;margin:0 0 24px;">
        Por las dudas, dos lugares que casi todos los que arrancan exploran primero:
      </p>
      <ul style="color:#475569;line-height:1.8;padding-left:20px;margin:0 0 24px;">
        <li><strong>Marketing → GEO</strong>: auditoría de citation readiness para AI Overviews. Pegá una URL de cliente y mirá el resultado.</li>
        <li><strong>Marketing → Informes</strong>: armá el primer informe mensual con URL pública.</li>
      </ul>
      <p style="margin:0;">— Gastón</p>
    </div>
  `)
}

function tplDay7({ name }) {
  return shell(`
    <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;">
      <h2 style="margin:0 0 12px;font-size:20px;">${name}, vas por la mitad del trial.</h2>
      <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
        Una semana usando BlissTracker. Si llegaste hasta acá, probablemente ya viste estas tres cosas:
      </p>
      <ul style="color:#475569;line-height:1.8;padding-left:20px;margin:0 0 16px;">
        <li>El coach de IA armando tu mañana sin que tengas que pensar prioridades.</li>
        <li>Foco forzado: una tarea activa por persona, sin multitasking disfrazado.</li>
        <li>Dashboards de marketing en un solo lugar (sin tener 7 pestañas abiertas).</li>
      </ul>
      <p style="color:#475569;line-height:1.6;margin:0 0 24px;">
        Si todavía no probaste el <strong>informe mensual con URL pública</strong> ni el <strong>GEO Audit</strong>,
        te recomiendo encarecidamente que dediques 10 minutos a cada uno antes de que termine el trial.
        Son los dos features que más impactan en la conversación con clientes.
      </p>
      <a href="${APP_URL}" style="display:inline-block;background:#E67A1F;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">
        Entrar a mi workspace
      </a>
      <p style="color:#475569;line-height:1.6;margin:24px 0 0;">
        ¿Algo que no funciona como esperabas? Respondé a este email.
      </p>
    </div>
  `)
}

function tplDay12({ name }) {
  return shell(`
    <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;">
      <h2 style="margin:0 0 12px;font-size:20px;">${name}, tu trial vence en 2 días.</h2>
      <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
        Quería avisarte con tiempo para que decidas con calma.
      </p>
      <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:14px 18px;margin:0 0 20px;">
        <p style="margin:0;color:#92400e;font-size:14px;">
          <strong>Qué pasa en 2 días:</strong> si activás el plan Pro, todo sigue igual.
          Si no activás y tenés hasta 3 usuarios, pasás al plan Gratis (sin perder nada).
          Si tenés más de 3, el workspace queda en pausa hasta que actives.
        </p>
      </div>
      <p style="color:#475569;line-height:1.6;margin:0 0 24px;">
        El plan Pro es <strong>USD 3 por usuario por mes</strong>, sin permanencia.
        Podés ver el detalle completo o ir directo a activar abajo.
      </p>
      <div style="display:flex;gap:10px;">
        <a href="${APP_URL}/pricing" style="display:inline-block;background:#E67A1F;color:white;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">
          Ver pricing y activar
        </a>
        <a href="${APP_URL}/billing" style="display:inline-block;background:#f1f5f9;color:#1e293b;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">
          Activar ahora
        </a>
      </div>
      <p style="margin:24px 0 0;">— Gastón</p>
    </div>
  `)
}

function tplDay13({ name }) {
  return shell(`
    <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;">
      <h2 style="margin:0 0 12px;font-size:20px;color:#dc2626;">Último día de trial, ${name}.</h2>
      <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
        Mañana tu workspace pasa de <strong>trial</strong> a <strong>plan Gratis</strong> (hasta 3 usuarios)
        o a <strong>past_due</strong> (más de 3 usuarios). Tus datos no se borran — pero las funciones quedan limitadas.
      </p>
      <p style="color:#475569;line-height:1.6;margin:0 0 24px;">
        Si querés mantener todo activo, activá el plan Pro en menos de 60 segundos:
      </p>
      <a href="${APP_URL}/billing" style="display:inline-block;background:#dc2626;color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:16px;">
        Activar plan Pro (USD 3/seat/mes)
      </a>
      <p style="color:#475569;line-height:1.6;margin:24px 0 0;">
        Si decidiste que BlissTracker no es para vos, también está bien.
        Pero respondeme dos líneas contándome por qué — me ayuda a hacerlo mejor. — Gastón
      </p>
    </div>
  `)
}

// ─── Cron handler ────────────────────────────────────────────────────────────

const STAGES = [
  { day: 3,  type: 'trialDay3CheckIn',  subject: '¿Qué tal van tus primeros días?',          tpl: tplDay3 },
  { day: 7,  type: 'trialDay7Progress', subject: 'Vas por la mitad del trial',               tpl: tplDay7 },
  { day: 12, type: 'trialDay12Urgency', subject: 'Tu trial vence en 2 días',                 tpl: tplDay12 },
  { day: 13, type: 'trialDay13LastDay', subject: 'Último día de trial — activá tu plan',     tpl: tplDay13 },
]

function daysSince(date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Corre la rutina diaria: para cada workspace en trial, calcula su día y envía
 * el email correspondiente si todavía no fue enviado.
 */
async function runTrialLifecycle() {
  const workspaces = await prisma.workspace.findMany({
    where: {
      status: 'trialing',
      deletionRequest: null,
    },
    include: {
      members: {
        where: { role: 'owner', active: true },
        include: { user: { select: { name: true, email: true } } },
      },
    },
  })

  let sent = 0
  for (const ws of workspaces) {
    const owner = ws.members[0]?.user
    if (!owner?.email) continue

    const age = daysSince(ws.createdAt)
    const stage = STAGES.find(s => s.day === age)
    if (!stage) continue

    await sendOne({
      to:          owner.email,
      subject:     stage.subject,
      type:        stage.type,
      html:        stage.tpl({ name: owner.name?.split(' ')[0] || 'hola' }),
      workspaceId: ws.id,
    })
    sent++
  }

  return { workspacesChecked: workspaces.length, emailsSent: sent }
}

module.exports = { runTrialLifecycle, STAGES }
