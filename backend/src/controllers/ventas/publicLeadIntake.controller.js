// Intake público de Leads desde integraciones externas (ej. WP Webhooks + Contact
// Form 7, que no tiene webhooks nativos). Sin auth — la identidad del workspace la
// da Workspace.leadWebhookToken (token opaco, de bajo privilegio: solo permite crear
// un Lead, nunca leer nada). Ver concepto "Intake público de Leads" en docs/claude/ventas.md.
const prisma = require('../../lib/prisma')
const { normalizePhone } = require('../../lib/phone')
const { logLeadEvent } = require('./_shared')

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
// Como el lead recién se crea, el campo siempre está vacío acá — sembrarlo no pisa
// ninguna nota humana. Mismo criterio que `toHtml` de projectSituation.controller.js
// (texto plano → párrafos escapados) para que se vea igual que algo tipeado a mano.
function textToHtml(text) {
  if (!text) return null
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return text.split(/\n{2,}/).map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('')
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
      select: { id: true },
    })
    if (!workspace) return res.status(404).json({ error: 'No encontrado' })

    const body = req.body || {}
    if (body.website && String(body.website).trim()) {
      return res.status(201).json({ ok: true })
    }

    const sources = [body, body.form_submit_data]
    const cleanEmail   = pickField(sources, FIELD_ALIASES.email).slice(0, 160)
    const cleanPhone   = pickField(sources, FIELD_ALIASES.phone).slice(0, 40)
    const cleanCompany = pickField(sources, FIELD_ALIASES.company).slice(0, 160)
    // Sin nombre explícito, usa el email o el teléfono antes que rechazar el lead
    // — perder un contacto real por un formulario que no pide nombre es peor que
    // un Contact/Company con el email como "nombre".
    const cleanName    = (pickField(sources, FIELD_ALIASES.name) || cleanEmail || cleanPhone).slice(0, 160)
    const notesSeed    = buildNotesSeed(body)

    if (!cleanEmail && !cleanPhone) return res.status(400).json({ error: 'Indicá un email o teléfono de contacto' })
    if (!cleanName) return res.status(400).json({ error: 'El nombre es requerido' })
    if (cleanEmail && !EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Ingresá un email válido' })

    const workspaceId = workspace.id

    const lead = await prisma.$transaction(async (tx) => {
      const c = await tx.company.create({
        data: { workspaceId, name: cleanCompany || cleanName },
      })
      const contact = await tx.contact.create({
        data: {
          workspaceId,
          companyId: c.id,
          name: cleanName,
          email: cleanEmail || null,
          phone: normalizePhone(cleanPhone),
        },
      })
      return tx.lead.create({
        data: {
          workspaceId,
          companyId: c.id,
          primaryContactId: contact.id,
          origin: 'sitio_web',
          createdById: null,
          notes: textToHtml(notesSeed),
        },
      })
    })

    await logLeadEvent({
      workspaceId, leadId: lead.id, userId: null, type: 'lead_created',
      content: 'se creó automáticamente desde el formulario web',
    })

    res.status(201).json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { createPublicLead }
