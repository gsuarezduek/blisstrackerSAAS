// Intake público de Leads desde integraciones externas (ej. WP Webhooks + Contact
// Form 7, que no tiene webhooks nativos). Sin auth — la identidad del workspace la
// da Workspace.leadWebhookToken (token opaco, de bajo privilegio: solo permite crear
// un Lead, nunca leer nada). Ver concepto "Intake público de Leads" en docs/claude/ventas.md.
const prisma = require('../../lib/prisma')
const { normalizePhone, countryFromTimezone } = require('../../lib/phone')
const { logLeadEvent } = require('./_shared')
const { ACTIVE_LEAD_STATUS_KEYS } = require('../../lib/salesCatalog')
const { resolveModuleAccess, memberRoleNames } = require('../../lib/moduleAccess')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// WP Webhooks (versión free) no deja renombrar campos de salida: manda los datos
// crudos de Contact Form 7 anidados en `form_submit_data`, con los nombres tal cual
// están en el formulario (ej. "nombre"/"telefono"/"empresa"), no "name"/"phone"/
// "company". Para no depender de reconfigurar el formulario o el plugin, el intake
// reconoce ambas formas: el body plano genérico (pensado para una integración propia
// futura, ej. un widget embebible) y el shape de WP Webhooks+CF7 — buscando estos
// alias en los dos lugares.
const FIELD_ALIASES = {
  name:    ['name', 'nombre'],
  email:   ['email', 'correo'],
  phone:   ['phone', 'telefono', 'teléfono', 'tel'],
  company: ['company', 'empresa'],
  message: ['message', 'mensaje'],
}
// Campos de tracking (UTM/ads) que WP Webhooks suele mandar como hidden fields de
// CF7 — no son contenido útil para la nota del lead, se ignoran aunque vengan vacíos
// (que es lo normal cuando no hay parámetros de campaña en la URL).
const NOISE_KEYS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'])

function pickField(sources, aliases) {
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue
    for (const key of aliases) {
      const v = src[key]
      if (v != null && String(v).trim()) return String(v).trim()
    }
  }
  return ''
}

// Arma el texto que siembra Lead.notes: el campo de mensaje explícito si vino, más
// cualquier otro campo del formulario que no haya sido reconocido como
// name/email/phone/company/message (ej. "¿Cuánto estimás invertir?" en un form de
// CF7) — así cualquier pregunta que el workspace agregue a su formulario queda
// igual registrada, sin tener que tocar este código de nuevo.
function buildNotesSeed(body) {
  const sources = [body, body.form_submit_data]
  const lines = []
  const explicitMessage = pickField(sources, FIELD_ALIASES.message)
  if (explicitMessage) lines.push(explicitMessage)

  const extras = body.form_submit_data
  if (extras && typeof extras === 'object') {
    const matchedKeys = new Set(Object.values(FIELD_ALIASES).flat())
    for (const [k, v] of Object.entries(extras)) {
      if (matchedKeys.has(k) || NOISE_KEYS.has(k)) continue
      if (v == null || !String(v).trim()) continue
      lines.push(`${k}: ${String(v).trim()}`)
    }
  }
  return lines.join('\n').slice(0, 5000)
}

// Lead.notes guarda HTML (mismo campo que edita el WYSIWYG de "Notas de reunión").
// Mismo criterio que `toHtml` de projectSituation.controller.js (texto plano →
// párrafos escapados) para que se vea igual que algo tipeado a mano.
function textToHtml(text) {
  if (!text) return null
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return text.split(/\n{2,}/).map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('')
}

// Concatena HTML nuevo al final del existente (o lo reemplaza si estaba vacío) —
// usado al fusionar una resubmisión del formulario con un lead activo ya abierto
// (nunca pisa lo que ya había).
function appendHtml(existing, addition) {
  if (!addition) return existing || null
  if (!existing || existing === '<p></p>') return addition
  return existing + addition
}

// Quiénes tienen acceso al módulo Ventas en este workspace — mismo criterio que
// GET /ventas/team (salesDashboard.controller.js getTeam). Se usa para avisarle a
// todo el equipo comercial cuando entra un lead nuevo (todavía no hay ningún
// responsable asignado en este punto).
async function resolveSalesTeamUserIds(workspace) {
  const { roles: salesRoles, userIds: salesUserIds } = resolveModuleAccess(workspace, 'ventas')
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id, active: true },
    select: { role: true, teamRole: true, extraTeamRoles: true, user: { select: { id: true } } },
  })
  return members
    .filter(m => ['admin', 'owner'].includes(m.role) || memberRoleNames(m).some(r => salesRoles.includes(r)) || salesUserIds.includes(m.user.id))
    .map(m => m.user.id)
}

// Best-effort: nunca rompe la creación del lead si falla.
async function notifyNewLead(workspace, lead, companyName) {
  try {
    const userIds = await resolveSalesTeamUserIds(workspace)
    if (!userIds.length) return
    await prisma.notification.createMany({
      data: userIds.map(userId => ({
        workspaceId: workspace.id, userId, actorId: null, leadId: lead.id,
        type: 'LEAD_CREATED', message: `llegó un lead nuevo desde el formulario web: "${companyName}"`,
      })),
    })
  } catch (err) { console.error('[ventas] notifyNewLead error:', err.message) }
}

// POST /api/public/leads/:token
// Body: { name, email?, phone?, company?, message?, website? } — o el shape de
// WP Webhooks+CF7 ({ form_submit_data: { ... } }), ver FIELD_ALIASES arriba.
// `website` es un honeypot (input oculto en el form) — mismo criterio que
// landing.controller.js `submitContact`: si viene completo, se asume bot y se
// responde 201 igual, sin crear nada.
async function createPublicLead(req, res, next) {
  try {
    const workspace = await prisma.workspace.findFirst({
      where: { leadWebhookToken: req.params.token },
      select: { id: true, moduleAccess: true, timezone: true },
    })
    if (!workspace) return res.status(404).json({ error: 'No encontrado' })

    const body = req.body || {}
    if (body.website && String(body.website).trim()) {
      return res.status(201).json({ ok: true })
    }

    const sources = [body, body.form_submit_data]
    const cleanEmail    = pickField(sources, FIELD_ALIASES.email).slice(0, 160)
    const cleanPhoneRaw = pickField(sources, FIELD_ALIASES.phone).slice(0, 40)
    const countryHint   = countryFromTimezone(workspace.timezone)
    // Ya normalizado acá (no solo al guardar): necesitamos el E.164 final para
    // poder buscar un Contact existente con el mismo formato.
    const cleanPhone    = normalizePhone(cleanPhoneRaw, { countryHint })
    const cleanCompany  = pickField(sources, FIELD_ALIASES.company).slice(0, 160)
    // Sin nombre explícito, usa el email o el teléfono antes que rechazar el lead
    // — perder un contacto real por un formulario que no pide nombre es peor que
    // un Contact/Company con el email como "nombre".
    const cleanName     = (pickField(sources, FIELD_ALIASES.name) || cleanEmail || cleanPhoneRaw).slice(0, 160)
    const notesHtml     = textToHtml(buildNotesSeed(body))

    if (!cleanEmail && !cleanPhoneRaw) return res.status(400).json({ error: 'Indicá un email o teléfono de contacto' })
    if (!cleanName) return res.status(400).json({ error: 'El nombre es requerido' })
    if (cleanEmail && !EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Ingresá un email válido' })

    const workspaceId = workspace.id

    // Dedup: ¿ya hay un Contact con este email o teléfono en el workspace?
    const existingContact = cleanEmail || cleanPhone
      ? await prisma.contact.findFirst({
          where: {
            workspaceId,
            OR: [cleanEmail ? { email: cleanEmail } : null, cleanPhone ? { phone: cleanPhone } : null].filter(Boolean),
          },
          include: {
            company: { select: { name: true } },
            primaryForLeads: { select: { id: true, status: true } },
          },
        })
      : null

    let lead, companyNameForNotify, isNewLead

    if (existingContact) {
      const activeLead = existingContact.primaryForLeads.find(l => ACTIVE_LEAD_STATUS_KEYS.includes(l.status))
      companyNameForNotify = existingContact.company?.name || cleanName

      if (activeLead) {
        // Ya tiene un lead abierto: fusiona en vez de duplicar — no crea nada nuevo.
        const current = await prisma.lead.findUnique({ where: { id: activeLead.id }, select: { notes: true } })
        lead = await prisma.lead.update({
          where: { id: activeLead.id },
          data: { notes: appendHtml(current?.notes, notesHtml) },
        })
        await logLeadEvent({
          workspaceId, leadId: lead.id, userId: null, type: 'form_resubmitted',
          content: 'volvió a completar el formulario web',
        })
        isNewLead = false
      } else {
        // Sin lead activo (los anteriores ya se cerraron, o nunca tuvo uno): abre
        // una oportunidad nueva, pero reusando el Contact/Company existentes.
        lead = await prisma.lead.create({
          data: {
            workspaceId,
            companyId: existingContact.companyId,
            primaryContactId: existingContact.id,
            origin: 'sitio_web',
            createdById: null,
            notes: notesHtml,
          },
        })
        await logLeadEvent({ workspaceId, leadId: lead.id, userId: null, type: 'lead_created', content: 'se creó automáticamente desde el formulario web' })
        isNewLead = true
      }
    } else {
      lead = await prisma.$transaction(async (tx) => {
        const c = await tx.company.create({ data: { workspaceId, name: cleanCompany || cleanName } })
        const contact = await tx.contact.create({
          data: { workspaceId, companyId: c.id, name: cleanName, email: cleanEmail || null, phone: cleanPhone },
        })
        return tx.lead.create({
          data: { workspaceId, companyId: c.id, primaryContactId: contact.id, origin: 'sitio_web', createdById: null, notes: notesHtml },
        })
      })
      companyNameForNotify = cleanCompany || cleanName
      await logLeadEvent({ workspaceId, leadId: lead.id, userId: null, type: 'lead_created', content: 'se creó automáticamente desde el formulario web' })
      isNewLead = true
    }

    if (isNewLead) await notifyNewLead(workspace, lead, companyNameForNotify)

    res.status(201).json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { createPublicLead }
