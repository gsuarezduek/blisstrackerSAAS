// Intake público de Leads desde integraciones externas (ej. WP Webhooks + Contact
// Form 7, que no tiene webhooks nativos). Sin auth — la identidad del workspace la
// da Workspace.leadWebhookToken (token opaco, de bajo privilegio: solo permite crear
// un Lead, nunca leer nada). Ver concepto "Intake público de Leads" en docs/claude/ventas.md.
const prisma = require('../../lib/prisma')
const { normalizePhone } = require('../../lib/phone')
const { logLeadEvent } = require('./_shared')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /api/public/leads/:token
// Body: { name, email?, phone?, company?, message?, website? }
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

    const { name, email, phone, company, message, website } = req.body
    if (website && String(website).trim()) {
      return res.status(201).json({ ok: true })
    }

    const cleanName    = String(name ?? '').trim().slice(0, 160)
    const cleanEmail   = String(email ?? '').trim().slice(0, 160)
    const cleanPhone   = String(phone ?? '').trim().slice(0, 40)
    const cleanCompany = String(company ?? '').trim().slice(0, 160)
    const cleanMessage = String(message ?? '').trim().slice(0, 5000)

    if (!cleanName) return res.status(400).json({ error: 'El nombre es requerido' })
    if (!cleanEmail && !cleanPhone) return res.status(400).json({ error: 'Indicá un email o teléfono de contacto' })
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
        },
      })
    })

    if (cleanMessage) {
      try {
        await prisma.leadActivity.create({
          data: {
            workspaceId, leadId: lead.id, userId: null, kind: 'note',
            content: `Mensaje del formulario: ${cleanMessage}`,
          },
        })
      } catch (err) { console.error('[ventas] publicLeadIntake note error:', err.message) }
    }

    await logLeadEvent({
      workspaceId, leadId: lead.id, userId: null, type: 'lead_created',
      content: 'se creó automáticamente desde el formulario web',
    })

    res.status(201).json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { createPublicLead }
