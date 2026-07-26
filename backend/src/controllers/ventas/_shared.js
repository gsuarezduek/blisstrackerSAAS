// Helpers compartidos por los controllers del módulo Ventas (CRM).
const prisma = require('../../lib/prisma')

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

module.exports = { OWNER_SELECT, LEAD_LIST_INCLUDE, LEAD_DETAIL_INCLUDE, logLeadEvent }
