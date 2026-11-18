// Bases (MailingList) y contactos (MailingContact) de un proyecto.
const crypto = require('crypto')
const prisma = require('../../lib/prisma')
const { backendBase } = require('../../services/mailing/config')
const { normalizeEmail } = require('../../lib/normalizeEmail')
const { buildTextSearchFilters } = require('../../lib/textSearch')
const { resolveCtx, intParam, sendError } = require('./_shared')
const { ownListIds } = require('../../services/mailing/audience')
const { importRows, addMemberships, cleanFields, cleanName, EMAIL_RE } = require('../../services/mailing/importer')

const STATUSES = ['pending', 'subscribed', 'unsubscribed', 'bounced', 'complained']
const MAX_IMPORT_ROWS = 2000

// ─── Bases ───────────────────────────────────────────────────────────────────

function formInfo(list) {
  return { subscribeUrl: list.publicFormToken ? `${backendBase()}/api/public/mailing/subscribe/${list.publicFormToken}` : null }
}

/** GET /projects/:id/mailing/lists — con total y suscriptos por base. */
async function listLists(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const [lists, subscribed, totals] = await Promise.all([
      prisma.mailingList.findMany({
        where: { projectId: ctx.projectId },
        orderBy: { name: 'asc' },
        select: {
          id: true, name: true, description: true, doubleOptIn: true, publicFormToken: true, formSuccessUrl: true,
          crmFilter: true, crmSyncedAt: true, createdAt: true, _count: { select: { members: true } },
        },
      }),
      prisma.mailingListMember.groupBy({
        by: ['listId'],
        where: { list: { projectId: ctx.projectId }, contact: { status: 'subscribed' } },
        _count: { _all: true },
      }),
      prisma.mailingContact.groupBy({
        by: ['status'],
        where: { projectId: ctx.projectId },
        _count: { _all: true },
      }),
    ])
    const subs = new Map(subscribed.map(s => [s.listId, s._count._all]))
    const counts = Object.fromEntries(STATUSES.map(s => [s, 0]))
    for (const t of totals) counts[t.status] = t._count._all
    res.json({
      lists: lists.map(({ _count, ...l }) => ({ ...l, ...formInfo(l), total: _count.members, subscribed: subs.get(l.id) || 0 })),
      contactCounts: { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) },
    })
  } catch (err) { next(err) }
}

async function createList(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const name = String(req.body?.name || '').trim().slice(0, 80)
    if (!name) return res.status(400).json({ error: 'La base necesita un nombre' })
    const exists = await prisma.mailingList.findFirst({ where: { projectId: ctx.projectId, name } })
    if (exists) return res.status(409).json({ error: 'Ya hay una base con ese nombre' })
    const list = await prisma.mailingList.create({
      data: {
        workspaceId: ctx.workspaceId, projectId: ctx.projectId, name,
        description: String(req.body?.description || '').trim().slice(0, 300) || null,
      },
    })
    res.status(201).json({ ...list, total: 0, subscribed: 0 })
  } catch (err) { next(err) }
}

async function updateList(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const listId = intParam(req.params.listId)
    const list = listId && await prisma.mailingList.findFirst({ where: { id: listId, projectId: ctx.projectId } })
    if (!list) return res.status(404).json({ error: 'Base no encontrada' })
    const data = {}
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim().slice(0, 80)
      if (!name) return res.status(400).json({ error: 'La base necesita un nombre' })
      const dup = await prisma.mailingList.findFirst({ where: { projectId: ctx.projectId, name, id: { not: list.id } } })
      if (dup) return res.status(409).json({ error: 'Ya hay una base con ese nombre' })
      data.name = name
    }
    if (req.body?.description !== undefined) data.description = String(req.body.description || '').trim().slice(0, 300) || null
    if (req.body?.doubleOptIn !== undefined) data.doubleOptIn = req.body.doubleOptIn === true
    if (req.body?.formSuccessUrl !== undefined) {
      const u = String(req.body.formSuccessUrl || '').trim()
      if (u && !/^https:\/\/[^\s]+$/i.test(u)) return res.status(400).json({ error: 'La página de destino tiene que ser una URL https://' })
      data.formSuccessUrl = u.slice(0, 500) || null
    }
    const updated = await prisma.mailingList.update({ where: { id: list.id }, data })
    res.json({ ...updated, ...formInfo(updated) })
  } catch (err) { next(err) }
}

/**
 * POST /projects/:id/mailing/lists/:listId/form { enabled }
 * Prender genera el token público del formulario; apagarlo lo borra (los forms
 * ya pegados en la web del cliente empiezan a responder 404). Volver a prenderlo
 * genera OTRO token: el código viejo no revive.
 */
async function setListForm(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const listId = intParam(req.params.listId)
    const list = listId && await prisma.mailingList.findFirst({ where: { id: listId, projectId: ctx.projectId } })
    if (!list) return res.status(404).json({ error: 'Base no encontrada' })
    const enabled = req.body?.enabled === true
    const updated = await prisma.mailingList.update({
      where: { id: list.id },
      data: { publicFormToken: enabled ? (list.publicFormToken || crypto.randomBytes(18).toString('base64url')) : null },
    })
    res.json({ ...updated, ...formInfo(updated) })
  } catch (err) { next(err) }
}

/** DELETE — los contactos quedan (pueden estar en otras bases), solo se van las pertenencias. */
async function deleteList(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const listId = intParam(req.params.listId)
    const list = listId && await prisma.mailingList.findFirst({ where: { id: listId, projectId: ctx.projectId } })
    if (!list) return res.status(404).json({ error: 'Base no encontrada' })
    await prisma.mailingList.delete({ where: { id: list.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ─── Contactos ───────────────────────────────────────────────────────────────

const CONTACT_SELECT = {
  id: true, email: true, firstName: true, lastName: true, fields: true, status: true,
  source: true, consentAt: true, unsubscribedAt: true, bouncedAt: true, createdAt: true,
  memberships: { select: { listId: true } },
}

function shapeContact(c) {
  const { memberships, ...rest } = c
  return { ...rest, listIds: (memberships || []).map(m => m.listId) }
}

/** GET /projects/:id/mailing/contacts?listId=&status=&q=&page=&pageSize= */
async function listContacts(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize) || 50))
    const where = { projectId: ctx.projectId }
    const listId = intParam(req.query.listId)
    if (listId) where.memberships = { some: { listId } }
    if (STATUSES.includes(req.query.status)) where.status = req.query.status
    const q = String(req.query.q || '').trim()
    const search = q ? buildTextSearchFilters(q, ['email', 'firstName', 'lastName']) : null
    if (search) where.AND = search
    const [items, total] = await Promise.all([
      prisma.mailingContact.findMany({ where, select: CONTACT_SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.mailingContact.count({ where }),
    ])
    res.json({ items: items.map(shapeContact), total, page, pageSize })
  } catch (err) { next(err) }
}

/**
 * POST /projects/:id/mailing/contacts
 * Si el email ya existe en el proyecto, se suma a las bases pedidas pero NO se
 * re-suscribe: una baja o un rebote no se deshacen cargando el contacto de nuevo.
 */
async function createContact(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const email = normalizeEmail(String(req.body?.email || ''))
    if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'Email inválido' })
    const listIds = await ownListIds(ctx.projectId, req.body?.listIds)
    const existing = await prisma.mailingContact.findUnique({ where: { projectId_email: { projectId: ctx.projectId, email } } })
    let contact
    if (existing) {
      contact = existing
    } else {
      contact = await prisma.mailingContact.create({
        data: {
          workspaceId: ctx.workspaceId, projectId: ctx.projectId, email,
          firstName: cleanName(req.body?.firstName), lastName: cleanName(req.body?.lastName),
          fields: cleanFields(req.body?.fields), source: 'manual',
          consentAt: new Date(), consentSource: 'manual',
        },
      })
    }
    await addMemberships([contact.id], listIds)
    const full = await prisma.mailingContact.findUnique({ where: { id: contact.id }, select: CONTACT_SELECT })
    res.status(existing ? 200 : 201).json({ contact: shapeContact(full), existed: !!existing })
  } catch (err) { next(err) }
}

/**
 * PATCH /projects/:id/mailing/contacts/:contactId
 * Estados que se pueden poner a mano: `unsubscribed` (desde cualquiera) y
 * `subscribed` solo desde `bounced` (la dirección se corrigió) — nunca se
 * re-suscribe a quien pidió la baja o marcó spam.
 */
async function updateContact(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const contactId = intParam(req.params.contactId)
    const contact = contactId && await prisma.mailingContact.findFirst({ where: { id: contactId, projectId: ctx.projectId } })
    if (!contact) return res.status(404).json({ error: 'Contacto no encontrado' })
    const b = req.body || {}
    const data = {}
    if (b.firstName !== undefined) data.firstName = cleanName(b.firstName)
    if (b.lastName !== undefined) data.lastName = cleanName(b.lastName)
    if (b.fields !== undefined) data.fields = cleanFields(b.fields)
    if (b.email !== undefined) {
      const email = normalizeEmail(String(b.email || ''))
      if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'Email inválido' })
      if (email !== contact.email) {
        const dup = await prisma.mailingContact.findUnique({ where: { projectId_email: { projectId: ctx.projectId, email } } })
        if (dup) return res.status(409).json({ error: 'Ya hay un contacto con ese email' })
        data.email = email
      }
    }
    if (b.status !== undefined && b.status !== contact.status) {
      if (b.status === 'unsubscribed') {
        data.status = 'unsubscribed'
        data.unsubscribedAt = new Date()
        data.unsubscribeReason = 'Baja manual'
      } else if (b.status === 'subscribed' && contact.status === 'bounced') {
        data.status = 'subscribed'
        data.bouncedAt = null
      } else {
        return res.status(400).json({ error: 'No se puede volver a suscribir a alguien que pidió la baja o marcó el mail como spam.' })
      }
    }
    if (Array.isArray(b.listIds)) {
      const listIds = await ownListIds(ctx.projectId, b.listIds)
      await prisma.mailingListMember.deleteMany({ where: { contactId: contact.id, listId: { notIn: listIds } } })
      await addMemberships([contact.id], listIds)
    }
    const updated = await prisma.mailingContact.update({ where: { id: contact.id }, data, select: CONTACT_SELECT })
    res.json(shapeContact(updated))
  } catch (err) { next(err) }
}

async function deleteContact(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const contactId = intParam(req.params.contactId)
    const r = contactId ? await prisma.mailingContact.deleteMany({ where: { id: contactId, projectId: ctx.projectId } }) : { count: 0 }
    if (!r.count) return res.status(404).json({ error: 'Contacto no encontrado' })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * POST /projects/:id/mailing/contacts/bulk
 * { action: 'add-to-list' | 'remove-from-list' | 'unsubscribe' | 'delete', contactIds, listId? }
 */
async function bulkContacts(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { action } = req.body || {}
    const ids = (Array.isArray(req.body?.contactIds) ? req.body.contactIds : []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 5000)
    if (!ids.length) return res.status(400).json({ error: 'No hay contactos seleccionados' })
    const own = (await prisma.mailingContact.findMany({ where: { projectId: ctx.projectId, id: { in: ids } }, select: { id: true } })).map(c => c.id)
    if (action === 'add-to-list' || action === 'remove-from-list') {
      const [listId] = await ownListIds(ctx.projectId, [req.body.listId])
      if (!listId) return res.status(404).json({ error: 'Base no encontrada' })
      if (action === 'add-to-list') await addMemberships(own, [listId])
      else await prisma.mailingListMember.deleteMany({ where: { listId, contactId: { in: own } } })
    } else if (action === 'unsubscribe') {
      await prisma.mailingContact.updateMany({
        where: { id: { in: own }, status: { in: ['subscribed', 'pending'] } },
        data: { status: 'unsubscribed', unsubscribedAt: new Date(), unsubscribeReason: 'Baja manual' },
      })
    } else if (action === 'delete') {
      await prisma.mailingContact.deleteMany({ where: { id: { in: own } } })
    } else {
      return res.status(400).json({ error: 'Acción desconocida' })
    }
    res.json({ ok: true, affected: own.length })
  } catch (err) { next(err) }
}

/**
 * POST /projects/:id/mailing/contacts/import
 * { rows: [{ email, firstName?, lastName?, fields? }], listIds, consent: true, dryRun }
 *
 * El CSV se parsea y se mapea en el browser y llega en tandas de hasta 2000 filas
 * (el body corta en 1 MB). En dos pasos, como la importación de enlaces: con
 * `dryRun` devuelve qué pasaría sin escribir nada.
 *
 * - Un email que ya existe completa los datos que faltan (no pisa un nombre con
 *   un vacío) y se suma a las bases, pero conserva su estado: un dado de baja
 *   sigue dado de baja. Se informa aparte para que se vea.
 * - `consent` es obligatorio: quien importa declara que esas personas aceptaron
 *   recibir mails. Queda registrado en cada contacto nuevo.
 */
async function importContacts(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { rows, dryRun } = req.body || {}
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No hay filas para importar' })
    if (rows.length > MAX_IMPORT_ROWS) return res.status(400).json({ error: `Máximo ${MAX_IMPORT_ROWS} filas por tanda` })
    if (!dryRun && req.body.consent !== true) return res.status(400).json({ error: 'Tenés que confirmar que estos contactos aceptaron recibir mails.' })
    const listIds = await ownListIds(ctx.projectId, req.body.listIds)

    res.json(await importRows({ workspaceId: ctx.workspaceId, projectId: ctx.projectId, rows, listIds, dryRun: !!dryRun, source: 'csv' }))
  } catch (err) { sendError(res, next, err) }
}

module.exports = {
  listLists, createList, updateList, deleteList, setListForm,
  listContacts, createContact, updateContact, deleteContact, bulkContacts, importContacts,
  cleanFields, EMAIL_RE,
}
