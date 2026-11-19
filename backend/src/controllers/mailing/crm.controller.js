// Importar contactos de Ventas (CRM) a una base de Mailing. Es una importación
// PUNTUAL, no una sincronización en vivo: el filtro queda guardado en la base
// (`crmFilter`) para poder repetirla con "Volver a sincronizar". Repetirla suma
// los contactos nuevos del CRM y completa datos; nunca re-suscribe a una baja.
//
// Requiere, además de Mailing, que la persona vea Ventas (flag `ventas` + acceso
// al módulo): los contactos del CRM son del workspace, no del proyecto.
const prisma = require('../../lib/prisma')
const { isFlagEnabledForWorkspace } = require('../../lib/featureFlags')
const { hasModuleAccess } = require('../../lib/moduleAccess')
const { LEAD_STATUSES, LEAD_ORIGINS, LEAD_STATUS_KEYS, LEAD_ORIGIN_KEYS } = require('../../lib/salesCatalog')
const { importRows } = require('../../services/mailing/importer')
const { resolveCtx, intParam, sendError, rejectAgent } = require('./_shared')

const MAX_CRM_CONTACTS = 20000

async function ventasAvailable(req) {
  const flag = await prisma.featureFlag.findUnique({ where: { key: 'ventas' } })
  const disabled = JSON.parse(req.workspace?.disabledFeatureKeys ?? '[]')
  return isFlagEnabledForWorkspace(flag, req.workspace.id, disabled) && hasModuleAccess(req, 'ventas')
}

function cleanFilter(raw = {}) {
  const pick = (arr, valid) => [...new Set((Array.isArray(arr) ? arr : []).filter(v => valid.includes(v)))]
  return {
    statuses: pick(raw.statuses, LEAD_STATUS_KEYS),
    origins: pick(raw.origins, LEAD_ORIGIN_KEYS),
    onlyPrimary: raw.onlyPrimary === true,
    includeArchived: raw.includeArchived === true,
  }
}

/** `where` sobre Contact. Sin estados ni orígenes: todos los contactos con email. */
function crmContactWhere(workspaceId, f) {
  const where = { workspaceId, email: { not: null } }
  if (f.statuses.length || f.origins.length || f.onlyPrimary) {
    const lead = {
      ...(f.includeArchived ? {} : { archived: false }),
      ...(f.statuses.length ? { status: { in: f.statuses } } : {}),
      ...(f.origins.length ? { origin: { in: f.origins } } : {}),
    }
    // Contacto principal del lead, o cualquier contacto de una empresa con ese lead.
    if (f.onlyPrimary) where.primaryForLeads = { some: lead }
    else where.company = { leads: { some: lead } }
  }
  return where
}

function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return { firstName: parts[0] || null, lastName: parts.slice(1).join(' ') || null }
}

async function rowsFor(workspaceId, filter) {
  const contacts = await prisma.contact.findMany({
    where: crmContactWhere(workspaceId, filter),
    select: { id: true, name: true, title: true, email: true, company: { select: { name: true, industry: true } } },
    orderBy: { id: 'asc' },
    take: MAX_CRM_CONTACTS + 1,
  })
  return {
    truncated: contacts.length > MAX_CRM_CONTACTS,
    rows: contacts.slice(0, MAX_CRM_CONTACTS).map(c => ({
      email: c.email,
      ...splitName(c.name),
      crmContactId: c.id,
      fields: { empresa: c.company?.name, cargo: c.title, rubro: c.company?.industry },
    })),
  }
}

/** GET /projects/:id/mailing/crm/options */
async function crmOptions(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    res.json({
      available: await ventasAvailable(req),
      statuses: LEAD_STATUSES.map(s => ({ key: s.key, label: s.label })),
      origins: LEAD_ORIGINS.map(o => ({ key: o.key, label: o.label })),
    })
  } catch (err) { next(err) }
}

// Importar declara que esos contactos aceptaron recibir mails: lo hace una persona.
const CONSENT_HUMAN_ONLY = 'Importar contactos desde Ventas lo hace una persona desde la app. Un agente suma contactos de a 50 con mailing_contacts_add.'

async function runImport(req, res, next, { listId, filter }) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    if (!(await ventasAvailable(req))) return res.status(403).json({ error: 'Para importar desde Ventas necesitás acceso al módulo de Ventas.' })
    const list = listId && await prisma.mailingList.findFirst({ where: { id: listId, projectId: ctx.projectId } })
    if (!list) return res.status(404).json({ error: 'Elegí la base a la que se importan los contactos' })
    const dryRun = !!req.body?.dryRun
    if (!dryRun && rejectAgent(req, res, CONSENT_HUMAN_ONLY)) return
    if (!dryRun && req.body?.consent !== true) return res.status(400).json({ error: 'Tenés que confirmar que estos contactos aceptaron recibir mails.' })

    const { rows, truncated } = await rowsFor(ctx.workspaceId, filter)
    const result = await importRows({ workspaceId: ctx.workspaceId, projectId: ctx.projectId, rows, listIds: [list.id], dryRun, source: 'crm' })
    if (!dryRun) {
      await prisma.mailingList.update({ where: { id: list.id }, data: { crmFilter: filter, crmSyncedAt: new Date() } })
    }
    res.json({ ...result, truncated, limit: MAX_CRM_CONTACTS })
  } catch (err) { sendError(res, next, err) }
}

/** POST /projects/:id/mailing/crm/import { listId, filter, dryRun, consent } */
function crmImport(req, res, next) {
  return runImport(req, res, next, { listId: intParam(req.body?.listId), filter: cleanFilter(req.body?.filter) })
}

/** POST /projects/:id/mailing/lists/:listId/crm-sync { dryRun, consent } — repite con el filtro guardado. */
async function crmSync(req, res, next) {
  try {
    const listId = intParam(req.params.listId)
    const list = listId && await prisma.mailingList.findFirst({ where: { id: listId, projectId: req.project?.id }, select: { crmFilter: true } })
    if (!list) return res.status(404).json({ error: 'Base no encontrada' })
    if (!list.crmFilter) return res.status(400).json({ error: 'Esta base no se armó desde Ventas' })
    return runImport(req, res, next, { listId, filter: cleanFilter(list.crmFilter) })
  } catch (err) { next(err) }
}

module.exports = { crmOptions, crmImport, crmSync, crmContactWhere, cleanFilter, splitName }
