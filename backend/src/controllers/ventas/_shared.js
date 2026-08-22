// Helpers compartidos por los controllers del módulo Ventas (CRM).
const prisma = require('../../lib/prisma')
const { ACTIVE_LEAD_STATUS_KEYS } = require('../../lib/salesCatalog')

// Includes reutilizables (shape estable devuelto al frontend).
const OWNER_SELECT = { select: { id: true, name: true, avatar: true } }

// Próximas acciones pendientes primero (por fecha, sin fecha al final), luego resueltas.
const ACTIONS_INCLUDE = {
  include: { owner: OWNER_SELECT, doneBy: OWNER_SELECT },
  orderBy: [{ status: 'asc' }, { dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
}

const LEAD_LIST_INCLUDE = {
  company:        { select: { id: true, name: true, website: true, industry: true } },
  primaryContact: { select: { id: true, name: true, title: true, email: true, phone: true } },
  owner:          OWNER_SELECT,
  actions:        { where: { status: 'pending' }, ...ACTIONS_INCLUDE },
}

const LEAD_DETAIL_INCLUDE = {
  company:        { include: { contacts: { orderBy: { name: 'asc' } } } },
  primaryContact: true,
  owner:          OWNER_SELECT,
  createdBy:      OWNER_SELECT,
  convertedProject: { select: { id: true, name: true, active: true } },
  activities:     { include: { user: OWNER_SELECT }, orderBy: { createdAt: 'desc' } },
  proposals:      { orderBy: [{ version: 'desc' }] },
  researches:     { orderBy: { createdAt: 'desc' } },
  actions:        ACTIONS_INCLUDE,
}

/**
 * Registra un evento automático en el timeline del lead (LeadActivity kind='event').
 * Nunca lanza (best-effort): un fallo del log no debe romper la operación principal.
 */
async function logLeadEvent({ workspaceId, leadId, userId, type, content, meta = {} }) {
  try {
    await prisma.leadActivity.create({
      data: { workspaceId, leadId, userId: userId ?? null, kind: 'event', type, content, meta },
    })
  } catch (err) {
    console.error('[ventas] logLeadEvent error:', err.message)
  }
}

/**
 * Un Contact no puede ser primaryContact de más de un Lead activo (no terminal)
 * a la vez — regla elegida para no dejar ambigua bajo cuál Lead se muestra/
 * notifica la conversación de WhatsApp de ese contacto (Fase 2 del plan).
 * `client` es `prisma` o un `tx` de transacción, según el caller. Lanza
 * {status: 409} si hay conflicto — el caller lo deja propagar a next(err).
 */
async function assertContactAvailable(client, { workspaceId, contactId, excludeLeadId }) {
  if (!contactId) return
  const conflict = await client.lead.findFirst({
    where: {
      workspaceId,
      primaryContactId: contactId,
      status: { in: ACTIVE_LEAD_STATUS_KEYS },
      ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
    },
    select: { id: true, title: true, company: { select: { name: true } } },
  })
  if (conflict) {
    const label = conflict.title?.trim() || conflict.company?.name || `Lead #${conflict.id}`
    const err = new Error(`Este contacto ya es el principal de otro lead activo: "${label}"`)
    err.status = 409
    throw err
  }
}

module.exports = { OWNER_SELECT, LEAD_LIST_INCLUDE, LEAD_DETAIL_INCLUDE, logLeadEvent, assertContactAvailable }
